import {
  type ActivityOptions,
  type AutocompleteInteraction,
  type CacheType,
  Client,
  type Interaction,
  Message,
  MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  REST,
  Routes,
  type User,
} from 'discord.js'
import { type Container, type ServiceIdentifier } from 'inversify'
import { Logger } from '@src/common/index.js'
import {
  getAutocompleteHandlers,
  getCommandMap,
  getMessageHandlers,
  getReactionHandlers,
  matchesEmoji,
  type ReactionHandlerMetadata,
  PARAM_SEPARATOR,
} from '@src/decorator/controller.decorator.js'
import { sample } from 'lodash-es'
import {
  describeInteraction,
  focusedOptionName,
  hasCustomId,
  matchesCommandType,
  resolveCommandPaths,
  resolveOptionParams,
} from '@src/util/interaction.util.js'
import { ReactionHandlerAction } from '@src/enum/controller.enum.js'
import { type MessageCommandOptions, type OnReady, type OnShutdown, type ReactionHandlerOptions } from '@src/interface/index.js'
import { type AutocompleteMetadata, type CommandMetadata } from '@src/interface/command-decorator.interface.js'
import {
  buildComponentRoutes,
  type ComponentRoute,
  findComponentRouteConflicts,
  matchComponentRoute,
} from '@src/core/component-routes.js'
import { globalStagesOf, handleUnroutedError, observeUnclaimed, runHandler } from '@src/core/handler-pipeline.js'
import { closeAutocomplete, createFallback, type Fallback } from '@src/core/fallback.js'
import { handlerInput } from '@src/core/handler-input.js'
import { buildMessageRoutes, matchMessageRoute, type MessageRoute, messageStarts, usesAppPrefix } from '@src/core/message-routes.js'
import { CommandNotFoundError } from '@src/common/errors.js'
import { stageClass, stageTypes } from '@src/core/stage-scope.js'
import { getEventHandlers } from '@src/decorator/event.decorator.js'
import {
  eventRequirements,
  MESSAGE_HANDLER_REQUIREMENTS,
  missingRequirementWarnings,
  REACTION_HANDLER_REQUIREMENTS,
  type RequiringHandler,
} from '@src/core/event-requirements.js'
import { classUnits, type LifecycleUnit } from '@src/core/lifecycle-order.js'
import { type MeoCordApplication } from '@src/interface/index.js'
import { stopRequests } from '@src/util/stop-request.util.js'
import { explainLoginFailure, type FatalLoginCode, fatalLoginCode, isRefusedToken, tokenMessage } from '@src/core/login-failure.js'
import { markExplained } from '@src/common/explained-error.js'
import { isShardProcess } from '@src/util/sharding-mode.util.js'
import { isShardMessage, type ShardMessage } from '@src/core/shard-messages.js'
import { registerCommands } from '@src/core/command-registration.js'
import { loadMeoCordConfig } from '@src/util/meocord-config-loader.util.js'
import { FORCE_REGISTER_ENV, isRegisterOnly, REGISTER_GUILD_ENV } from '@src/util/registration-mode.util.js'

interface AutocompleteRoute {
  controllerClass: new (...args: any[]) => any
  meta: AutocompleteMetadata
}

/** How long shutdown waits for the `onShutdown` hooks when `shutdownTimeout` is not configured. */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000

/** How long an `onReady` hook runs before a warning says the hooks after it are waiting. */
export const SLOW_READY_HOOK_MS = 10_000

type LifecycleClass = new (...args: any[]) => any

/** A resolved controller, service or provided value, with its name for logs. */
interface LifecycleEntry {
  name: string
  instance: Partial<OnReady & OnShutdown>
}

/** Closes each started app: runs its shutdown hooks and destroys its client, resolving `false` on failure. */
const runningApps = new Set<() => Promise<boolean>>()
const stopRequest = stopRequests()
let signalHandlersInstalled = false

/**
 * Shuts every started app down and exits: `onShutdown` hooks under the configured `shutdownTimeout`,
 * then `destroy()`, then exit 0, or 1 if a client failed to close. SIGINT and SIGTERM call it, and so
 * does a shard its manager tells to stop. A call within `REPEAT_SIGNAL_WINDOW_MS` of the first is the
 * same request; one after it forces exit 1.
 */
export async function shutdownAndExit(): Promise<void> {
  const request = stopRequest()
  if (request !== 'first') {
    // A shard hears Ctrl+C both directly and from its manager, which owns forcing it; so it waits
    if (request === 'duplicate' || isShardProcess()) return
    process.exit(1)
    return
  }

  const closed = await Promise.all([...runningApps].map(close => close()))
  process.exit(closed.every(Boolean) ? 0 : 1)
}

/** One pair of signal listeners for the process, however many apps it starts. */
function installSignalHandlers(): void {
  if (signalHandlersInstalled) return
  signalHandlersInstalled = true
  process.on('SIGINT', () => void shutdownAndExit())
  process.on('SIGTERM', () => void shutdownAndExit())

  // A shard stops when its manager asks, or when the manager is gone and cannot ask
  if (isShardProcess()) {
    process.on('message', message => {
      if (isShardMessage(message) && message.meocord === 'shutdown') void shutdownAndExit()
    })
    process.on('disconnect', () => void shutdownAndExit())
  }
}

/** Tells the manager a shard cannot log in, and why, and waits until the message is sent. */
async function reportFatalLogin(code: FatalLoginCode, reason: string): Promise<void> {
  if (!isShardProcess() || !process.send) return
  const message: ShardMessage = { meocord: 'fatal', code, message: reason }
  await new Promise<void>(resolve => process.send!(message, undefined, {}, () => resolve()))
}

export class MeoCordApp implements MeoCordApplication {
  private readonly logger = new Logger(MeoCordApp.name)
  private readonly fallback: Fallback = createFallback(this.logger)
  private readonly bot: Client
  private activityInterval: ReturnType<typeof setInterval> | null = null
  private controllerInstancesCache = new Map<any, any>()

  constructor(
    private readonly controllerClasses: (new (...args: any[]) => any)[],
    private readonly container: Container,
    private readonly discordClient: Client,
    private discordToken: string,
    private activities?: ActivityOptions[],
    private readonly lifecycleClasses: LifecycleClass[] = [],
    shutdownTimeout?: number,
    private readonly startup?: () => Promise<void>,
    lifecycleUnits?: LifecycleUnit[],
    private readonly messageOptions: MessageCommandOptions = {},
    private readonly warnUnanswered = false,
  ) {
    this.lifecycleUnits = lifecycleUnits ?? classUnits(container, lifecycleClasses)
    // Built now, so a pattern that cannot be read or two that match the same messages stop the bot before login
    this.messageRoutes = buildMessageRoutes(controllerClasses, messageOptions)
    this.messageListeners = controllerClasses.flatMap(controllerClass =>
      getMessageHandlers(controllerClass.prototype)
        .filter(handler => handler.pattern === undefined)
        .map(({ method }) => ({ controllerClass, method })),
    )
    this.bot = this.discordClient
    this.shutdownTimeout =
      typeof shutdownTimeout === 'number' && shutdownTimeout >= 0 ? shutdownTimeout : DEFAULT_SHUTDOWN_TIMEOUT_MS
  }

  /** Everything whose lifecycle hooks run, classes and provided values, in dependency order. */
  private readonly lifecycleUnits: LifecycleUnit[]

  /** Every patterned `@MessageHandler`, most specific first. */
  private readonly messageRoutes: MessageRoute[]

  /** Every `@MessageHandler()` without a pattern, in controller order. */
  private readonly messageListeners: { controllerClass: new (...args: any[]) => any; method: string }[]

  /** Whether shutdown has begun, so the ready hooks start no more. */
  private closing = false

  /** How long shutdown waits for the `onShutdown` hooks, from `shutdownTimeout` in the config. */
  private readonly shutdownTimeout: number

  /** The resolved instances whose hooks ran at ready, so shutdown calls the same ones; `undefined` before ready. */
  private lifecycleEntries?: LifecycleEntry[]

  private readonly close = () => this.closeClient()

  /**
   * Runs an event handler so its failure is logged against the event instead of surfacing as an
   * unhandled rejection, which would terminate the whole bot.
   */
  private async runListener(event: string, run: () => Promise<void>): Promise<void> {
    try {
      await run()
    } catch (error) {
      this.logger.error(`Unhandled error while handling "${event}":`, error)
    }
  }

  /**
   * Rotates the bot's activity.
   *
   * Guarded separately from {@link runListener}: this runs on a timer rather than an
   * event, and a throw from a timer callback is an uncaught exception no listener
   * wrapper can reach.
   */
  private updateActivity(): void {
    try {
      this.bot.user?.setActivity(sample(this.activities))
    } catch (error) {
      this.logger.error('Could not update the bot activity:', error)
    }
  }

  private getInstance(controllerClass: new (...args: any[]) => any): any {
    if (!this.controllerInstancesCache.has(controllerClass)) {
      this.controllerInstancesCache.set(controllerClass, this.container.get(controllerClass))
    }
    return this.controllerInstancesCache.get(controllerClass)
  }

  /** Whether a failed login set the process exit code, so a later successful one knows to clear it. */
  private static failedLoginSetExitCode = false

  /**
   * Resolves the app's providers, makes its listed services, registers the Discord event handlers
   * and logs the bot in.
   *
   * If a provider's factory or the login fails, the process exit code is set to `1` before the
   * promise rejects, so the process exits non-zero even when the caller catches the error to log it.
   * A later `start()` that logs in clears that code again.
   *
   * @returns A promise that resolves once the bot is logged in.
   * @throws The error of a factory that failed, already logged and naming its token, or the login
   *   error, such as an invalid token or Discord being unreachable.
   *
   * @example
   * ```ts
   * const app = MeoCordFactory.create(App)
   * await app.start()
   * ```
   */
  async start() {
    if (isRegisterOnly()) return this.registerOnly()

    this.logger.log('Starting bot...')

    // Every provided value is made before anything that injects it is resolved, and before login
    if (this.startup) {
      try {
        await this.startup()
      } catch (error) {
        if (process.exitCode === undefined || process.exitCode === 0) {
          process.exitCode = 1
          MeoCordApp.failedLoginSetExitCode = true
        }
        throw error
      }
    }

    installSignalHandlers()
    runningApps.add(this.close)

    this.bot.on('clientReady', readyClient =>
      this.runListener('clientReady', async () => {
        this.activityInterval = setInterval(() => this.updateActivity(), 10000)
        // Started before registration and not waited on by it, so a slow or failed registration never holds them up
        const readyHooks = this.runReadyHooks((readyClient ?? this.bot) as Client<true>)
        // With process sharding, the manager registers once for every shard
        if (!isShardProcess()) await this.registerCommands()
        await readyHooks
      }),
    )

    this.bot.on('interactionCreate', interaction =>
      this.runListener('interactionCreate', () => this.handleInteraction(interaction)),
    )

    this.bot.on('messageCreate', message => this.runListener('messageCreate', () => this.handleMessage(message)))

    this.bot.on('messageReactionAdd', (reaction, user) =>
      this.runListener('messageReactionAdd', () =>
        this.handleReaction(reaction, { user, action: ReactionHandlerAction.ADD }),
      ),
    )

    this.bot.on('messageReactionRemove', (reaction, user) =>
      this.runListener('messageReactionRemove', () =>
        this.handleReaction(reaction, { user, action: ReactionHandlerAction.REMOVE }),
      ),
    )

    this.attachEventHandlers()
    this.warnAboutMissingRequirements()
    this.noteGlobalStagesOnEvents()
    // Built now rather than on the first click, so overlapping patterns are reported at startup
    this.getComponentRoutes()

    try {
      await this.bot.login(this.discordToken)
    } catch (error) {
      runningApps.delete(this.close)
      const fatal = fatalLoginCode(error)
      // Read only for a failure that needs them: a hand-built client in a test may have no options
      const explanation = fatal && explainLoginFailure(fatal, this.bot.options?.intents, this.discordToken)
      if (explanation) {
        // The explanation is what to act on, and the stack only for debugging. A shard's manager logs it instead.
        if (!isShardProcess()) this.logger.error(explanation)
        this.logger.debug('Login failed:', error)
        markExplained(error)
      }
      if (fatal) await reportFatalLogin(fatal, explanation ?? (error instanceof Error ? error.message : String(error)))
      if (process.exitCode === undefined || process.exitCode === 0) {
        process.exitCode = 1
        MeoCordApp.failedLoginSetExitCode = true
      }
      throw error
    }
    if (MeoCordApp.failedLoginSetExitCode && process.exitCode === 1) {
      process.exitCode = undefined
      MeoCordApp.failedLoginSetExitCode = false
    }
    this.logger.log('Bot is online!')
  }

  /**
   * Registers the application's commands with Discord, where `meocord.config.ts`'s `commands` says.
   *
   * Runs once the bot is ready. It never throws: a failure is logged and the bot stays online.
   */
  async registerCommands(): Promise<void> {
    const applicationId = this.bot.application?.id
    if (!applicationId) return

    const config = loadMeoCordConfig()?.commands
    if (config?.register === false) {
      this.logger.log('Command registration is off (commands.register: false); run `meocord register` to register.')
      return
    }

    await registerCommands({
      rest: this.bot.rest,
      applicationId,
      controllerClasses: this.controllerClasses,
      logger: this.logger,
      config,
      development: process.env.NODE_ENV === 'development',
      force: process.env[FORCE_REGISTER_ENV] === '1',
    })
  }

  /**
   * Registers the commands over REST without logging in, as `meocord register` asks, and exits: `0`
   * when every scope registered, `1` otherwise.
   */
  private async registerOnly(): Promise<never> {
    if (!this.discordToken?.trim()) {
      this.logger.error(tokenMessage(this.discordToken))
      process.exit(1)
    }
    const rest = new REST().setToken(this.discordToken)
    let applicationId: string

    try {
      applicationId = ((await rest.get(Routes.currentApplication())) as { id: string }).id
    } catch (error) {
      if (isRefusedToken(error)) {
        this.logger.error(tokenMessage(this.discordToken))
        this.logger.debug('Reading the application failed:', error)
      } else {
        this.logger.error('Could not read the application the token belongs to; check discordToken:', error)
      }
      process.exit(1)
    }

    const registered = await registerCommands({
      rest,
      applicationId,
      controllerClasses: this.controllerClasses,
      logger: this.logger,
      config: loadMeoCordConfig()?.commands,
      development: process.env.NODE_ENV === 'development',
      onlyGuild: process.env[REGISTER_GUILD_ENV],
      force: true,
    })
    process.exit(registered ? 0 : 1)
  }

  /**
   * Every pattern-matched route, most specific first, built once at start. The ordering lets
   * `gi-profile/summary/{ownerId}/{uid}` win over `gi-profile/{uuid}/{uid}` regardless of registration order.
   */
  private componentRoutes?: ComponentRoute[]

  private getComponentRoutes(): ComponentRoute[] {
    if (this.componentRoutes) return this.componentRoutes

    const routes = buildComponentRoutes(this.controllerClasses)
    this.reportAmbiguousRoutes(routes)
    this.componentRoutes = routes
    return routes
  }

  /**
   * Warns rather than throws: an app whose patterns overlap boots and works, and refusing to start
   * would turn a latent mis-route into an outage.
   */
  private reportAmbiguousRoutes(routes: ComponentRoute[]): void {
    const conflicts = findComponentRouteConflicts(routes)
    if (conflicts.length === 0) return

    this.logger.warn(
      `${conflicts.length} pattern pair(s) can match the same customId, so which one runs is decided by ` +
        `ranking rather than by the ids themselves:\n` +
        conflicts.map(({ patterns: [left, right] }) => `  "${left}"  vs  "${right}"`).join('\n') +
        `\nA parameter stops at "${PARAM_SEPARATOR}", so separating these segments with it makes them distinct.`,
    )
  }

  /**
   * Every `@Autocomplete` handler, option-specific ones first. Cached, since autocomplete runs on
   * every keystroke.
   */
  private autocompleteRoutes?: AutocompleteRoute[]

  private getAutocompleteRoutes(): AutocompleteRoute[] {
    if (this.autocompleteRoutes) return this.autocompleteRoutes

    const routes: AutocompleteRoute[] = []
    for (const controllerClass of this.controllerClasses) {
      for (const meta of getAutocompleteHandlers(this.getInstance(controllerClass))) {
        routes.push({ controllerClass, meta })
      }
    }

    routes.sort((a, b) => Number(Boolean(b.meta.optionName)) - Number(Boolean(a.meta.optionName)))
    this.autocompleteRoutes = routes
    return routes
  }

  /**
   * Dispatches an interaction. A failure outside any handler, such as no route matching or resolving
   * the controller, goes to the global filters, then the fallback.
   */
  private async handleInteraction(interaction: Interaction<CacheType>): Promise<void> {
    // From the moment it arrives, so an observer's duration includes routing
    const startedAt = performance.now()
    try {
      await this.dispatchInteraction(interaction, startedAt)
    } catch (error) {
      await handleUnroutedError(this.container, [interaction], error, { fallback: this.fallback, startedAt })
    }
  }

  private async dispatchInteraction(interaction: Interaction<CacheType>, startedAt: number) {
    // Autocomplete first, and on its own path: it is answered with `respond()` rather
    // than a reply, it has no customId to route on, and the "Command not found!" reply
    // the other paths end in cannot be sent to it at all.
    if (interaction.isAutocomplete()) {
      await this.handleAutocomplete(interaction, startedAt)
      return
    }

    // Component interactions route on a pattern, so they go through the ranked table.
    // Commands match their registered name exactly and cannot overlap.
    if (hasCustomId(interaction)) {
      const customId = interaction.customId
      // The component type as well as the pattern: a button and a select menu may share a customId shape.
      const matched = matchComponentRoute(this.getComponentRoutes(), type => matchesCommandType(type, interaction), customId)
      if (matched) {
        const { route, params } = matched
        ;(interaction as Interaction & { dynamicParams: Record<string, string> }).dynamicParams = params
        await this.executeCommand(this.getInstance(route.controllerClass), route.meta, interaction, startedAt)
        return
      }
    }

    // Paths are walked outside the controller loop so the full subcommand path always
    // beats the bare command name, whatever order the controllers were registered in.
    for (const path of this.resolveNameRoutes(interaction)) {
      for (const controllerClass of this.controllerClasses) {
        const controllerInstance = this.getInstance(controllerClass)
        const commandMap = getCommandMap(controllerInstance)
        const commandMetadata = commandMap?.[path]?.find(meta => matchesCommandType(meta.type, interaction))
        if (!commandMetadata) continue

        await this.executeCommand(controllerInstance, commandMetadata, interaction, startedAt)
        return
      }
    }

    // Log what actually failed to match. The user's "Command not found!" says nothing
    // about which id was unroutable, so a control that is emitted but never routed --
    // a customId whose value broke its pattern, or a handler nobody wrote -- stays
    // invisible until somebody reports the dead button.
    throw new CommandNotFoundError(
      `No handler matched ${describeInteraction(interaction)}. Check that a @Command pattern is ` +
        `declared for it and that its controller is registered.`,
    )
  }

  /**
   * The names a command interaction can be handled under, most specific first.
   *
   * Empty for anything that is not a registered command, which is how a component
   * whose customId matched no pattern falls through to the unmatched warning instead
   * of being looked up under a name it does not have.
   */
  private resolveNameRoutes(interaction: Interaction<CacheType>): string[] {
    if (interaction.isChatInputCommand()) return resolveCommandPaths(interaction)
    if (interaction.isContextMenuCommand() || interaction.isPrimaryEntryPointCommand()) {
      return [interaction.commandName]
    }
    return []
  }

  /**
   * Answers an autocomplete interaction from the `@Autocomplete` handler that claims it. An unclaimed
   * option gets an empty list and a warning, rather than a menu stuck loading until Discord times out.
   */
  private async handleAutocomplete(interaction: AutocompleteInteraction<CacheType>, startedAt: number): Promise<void> {
    const focusedName = focusedOptionName(interaction)

    for (const path of resolveCommandPaths(interaction)) {
      for (const { controllerClass, meta } of this.getAutocompleteRoutes()) {
        if (meta.commandPath !== path) continue
        if (meta.optionName !== undefined && meta.optionName !== focusedName) continue

        const controllerInstance = this.getInstance(controllerClass)
        this.logger.log('[AUTOCOMPLETE]', `[${path}]`, `[${meta.methodName}]`)
        const params = resolveOptionParams(interaction)
        const ran = await this.invokeHandler(controllerInstance, meta.methodName, [interaction, params], startedAt)
        if (!ran) await closeAutocomplete(interaction, this.logger)
        return
      }
    }

    this.logger.warn(
      `No handler matched ${describeInteraction(interaction)}. Declare an @Autocomplete handler for it, ` +
        `or drop setAutocomplete(true) from the option.`,
    )
    await closeAutocomplete(interaction, this.logger)
    await observeUnclaimed(this.container, [interaction], { startedAt })
  }

  /** Handler and name pairs already warned about, so a colliding modal warns once rather than per submit. */
  private readonly warnedCollisions = new Set<string>()

  /** Tells a developer that a modal field is hidden by a customId param of the same name. */
  private warnCollisions(methodName: string, names: string[]): void {
    if (process.env.NODE_ENV !== 'development') return

    for (const name of names) {
      const key = `${methodName}:${name}`
      if (this.warnedCollisions.has(key)) continue
      this.warnedCollisions.add(key)
      this.logger.warn(
        `"${name}" is both a customId param and a modal field or select menu choice of ${methodName}; the handler receives the customId ` +
          `param. Rename one to receive both.`,
      )
    }
  }

  /**
   * Runs a resolved command, shared by both dispatch paths so a pattern-matched
   * component and a named slash command behave identically once the route is chosen.
   */
  private async executeCommand(
    controllerInstance: Record<string, (...args: unknown[]) => Promise<void>>,
    commandMetadata: CommandMetadata<string>,
    interaction: Interaction<CacheType>,
    startedAt: number,
  ): Promise<void> {
    const { methodName, type } = commandMetadata

    // No interaction-type check here: both callers pick the route with
    // `matchesCommandType` before getting this far, and `@Command` re-checks the
    // interaction on the way into the handler.
    this.logger.log('[INTERACTION]', `[${type}]`, `[${methodName}]`)

    const routeParams = (interaction as Interaction & { dynamicParams?: Record<string, string> }).dynamicParams
    const { params, collisions } = handlerInput(interaction, routeParams)
    this.warnCollisions(methodName, collisions)

    await this.invokeHandler(controllerInstance, methodName, [interaction, params], startedAt)
  }

  /**
   * Adds a client listener for every `@On` and `@Once` handler on the app's controllers and services.
   * The instance is resolved when the first event arrives, and each call is isolated: an error is
   * logged against the event and the handler, and the next listener still runs.
   */
  private attachEventHandlers(): void {
    for (const lifecycleClass of this.lifecycleClasses) {
      for (const { event, method, once } of getEventHandlers(lifecycleClass.prototype)) {
        const logError = (error: unknown) =>
          this.logger.error(`Error handling event "${event}" in ${lifecycleClass.name}.${method}:`, error)
        // An event has no one to answer, so an error no filter handles is only logged, with the handler
        const fallback: Fallback = async error => logError(error)
        const listener = async (...args: unknown[]) => {
          try {
            const instance = this.container.get(lifecycleClass)
            await runHandler(this.container, instance, method, args, { fallback, type: 'event' })
          } catch (error) {
            // Only resolving the instance can fail here; the pipeline hands every other error to the fallback
            logError(error)
          }
        }
        if (once) this.bot.once(event, listener)
        else this.bot.on(event, listener)
      }
    }
  }

  /**
   * Says, once per stage, which global guards and interceptors declare no `types` and so also run
   * before `@On` and `@Once` handlers, when the app has any.
   */
  private noteGlobalStagesOnEvents(): void {
    if (!this.lifecycleClasses.some(cls => getEventHandlers(cls.prototype).length > 0)) return

    const { guards, interceptors } = globalStagesOf(this.container)
    for (const [label, decorator, entries] of [
      ['guard', 'Guard', guards],
      ['interceptor', 'Interceptor', interceptors],
    ] as const) {
      for (const entry of entries) {
        if (stageTypes(entry)) continue
        this.logger.info(
          `Global ${label} ${stageClass(entry).name} also runs on gateway events; declare ` +
            `@${decorator}({ types: [...] }) to limit it.`,
        )
      }
    }
  }

  /** Warns about handlers whose events the client options will not deliver, once per missing intent or partial. */
  private warnAboutMissingRequirements(): void {
    const options = this.bot.options
    if (!options?.intents) return

    const handlers: RequiringHandler[] = []
    for (const lifecycleClass of this.lifecycleClasses) {
      const prototype = lifecycleClass.prototype
      for (const { event, method, once } of getEventHandlers(prototype)) {
        handlers.push({
          label: `@${once ? 'Once' : 'On'}('${event}') in ${lifecycleClass.name}.${method}`,
          requirements: eventRequirements(event),
        })
      }
      for (const { pattern, method } of getMessageHandlers(prototype)) {
        const decorator = pattern === undefined ? '@MessageHandler()' : `@MessageHandler('${pattern}')`
        handlers.push({ label: `${decorator} in ${lifecycleClass.name}.${method}`, requirements: MESSAGE_HANDLER_REQUIREMENTS })
      }
      for (const { emoji, method } of getReactionHandlers(prototype)) {
        const decorator = emoji === undefined ? '@ReactionHandler()' : `@ReactionHandler('${emoji}')`
        handlers.push({ label: `${decorator} in ${lifecycleClass.name}.${method}`, requirements: REACTION_HANDLER_REQUIREMENTS })
      }
    }

    for (const warning of missingRequirementWarnings(options, handlers)) this.logger.warn(warning)
  }

  /**
   * Runs a handler through its pipeline, with the fallback answering any error no filter handles, and
   * says whether the handler ran. Its guard wrappers let this call through, so each guard runs once.
   */
  private async invokeHandler(
    instance: Record<string, (...args: unknown[]) => unknown>,
    methodName: string,
    args: unknown[],
    startedAt?: number,
  ): Promise<boolean> {
    const handler = `${instance.constructor.name}.${methodName}`
    const onUnanswered = this.warnUnanswered ? (phase: 'unanswered' | 'deferred') => this.warnUnansweredOnce(handler, phase) : undefined
    const { ran } = await runHandler(this.container, instance, methodName, args, { fallback: this.fallback, startedAt, onUnanswered })
    return ran
  }

  /** The handlers already warned about, so each is named once however often it runs. */
  private readonly warnedUnanswered = new Set<string>()

  /** Warns, once per handler, that it left its interaction unanswered or deferred without a follow-up. */
  private warnUnansweredOnce(handler: string, phase: 'unanswered' | 'deferred'): void {
    if (this.warnedUnanswered.has(handler)) return
    this.warnedUnanswered.add(handler)
    const what =
      phase === 'unanswered'
        ? `${handler} finished without answering its interaction, so the user saw "The application did not respond". ` +
          'Answer it with respond(interaction).send(), or acknowledge it first with @Defer().'
        : `${handler} deferred its interaction and never followed up, so the user saw it thinking until Discord gave up. ` +
          'Follow up with respond(interaction).send().'
    this.logger.warn(`${what} Shown once per handler; @MeoCord({ warnUnanswered: false }) turns it off.`)
  }

  /**
   * Runs the most specific patterned handler the message matches, then every listener. A failure to
   * read the prefixes goes to the global filters, then the fallback; the listeners still run.
   */
  private async handleMessage(message: Message) {
    if (message.author.bot || !message.content?.trim()) return

    let matched: ReturnType<typeof matchMessageRoute>
    try {
      if (this.messageRoutes.length > 0) {
        const starts = usesAppPrefix(this.messageRoutes)
          ? await messageStarts(this.messageOptions, message, this.bot.user?.id)
          : { prefixes: [] }
        matched = matchMessageRoute(this.messageRoutes, message.content, starts)
      }
    } catch (error) {
      await handleUnroutedError(this.container, [message], error, { fallback: this.fallback })
    }
    if (matched) {
      const { route, params } = matched
      await this.invokeHandler(this.getInstance(route.controllerClass), route.method, [message, params])
    }

    for (const { controllerClass, method } of this.messageListeners) {
      await this.invokeHandler(this.getInstance(controllerClass), method, [message])
    }
  }

  /**
   * Runs the reaction's handlers, controller by controller, those for its emoji before those for every
   * emoji. A reaction from a bot, the bot's own included, runs only handlers that set `bots: true`.
   */
  private async handleReaction(
    reaction: MessageReaction | PartialMessageReaction,
    { user, action }: ReactionHandlerOptions,
  ) {
    const forEmoji = (handler: ReactionHandlerMetadata) => !handler.emoji || matchesEmoji(handler.emoji, reaction.emoji)
    const matching = this.controllerClasses
      .map(controllerClass => ({
        controllerClass,
        // Handlers for this emoji first, then those for every emoji
        handlers: getReactionHandlers(this.getInstance(controllerClass))
          .filter(forEmoji)
          .sort((a, b) => Number(!a.emoji) - Number(!b.emoji)),
      }))
      .filter(({ handlers }) => handlers.length > 0)
    if (matching.length === 0) return

    // Only asked when a matching handler leaves bots out, since a partial user costs a fetch
    const fromBot = matching.some(({ handlers }) => handlers.some(handler => !handler.settings.bots))
      ? await this.isBot(user)
      : undefined
    // A user that could not be fetched is not known to be a person, so it reaches only those that take bots
    const botsOnly = fromBot !== false && fromBot !== undefined
    const runs = matching
      .map(({ controllerClass, handlers }) => ({
        controllerClass,
        handlers: botsOnly ? handlers.filter(handler => handler.settings.bots) : handlers,
      }))
      .filter(({ handlers }) => handlers.length > 0)
    if (runs.length === 0) return

    // A reaction arrives for messages the bot may no longer be able to read -- deleted,
    // or in a channel it lost access to -- and `fetch` rejects for all of them. That is
    // an ordinary outcome rather than a fault, so the reaction is skipped quietly.
    try {
      await reaction.message.fetch()
    } catch (error) {
      this.logger.debug(`Skipping a reaction whose message could not be fetched: ${String(error)}`)
      return
    }

    for (const { controllerClass, handlers } of runs) {
      const controllerInstance = this.getInstance(controllerClass)
      for (const { method } of handlers) {
        await this.invokeHandler(controllerInstance, method, [reaction, { user, action }])
      }
    }
  }

  /**
   * Whether a user is a bot: the bot itself, or a user discord.js knows to be one. A partial user is
   * fetched first; `null` when that fails.
   */
  private async isBot(user: User | PartialUser): Promise<boolean | null> {
    if (user.id === this.bot.user?.id) return true
    if (typeof user.bot === 'boolean') return user.bot
    try {
      return (await user.fetch()).bot
    } catch (error) {
      this.logger.debug(`Skipping a reaction whose user could not be fetched: ${String(error)}`)
      return null
    }
  }

  /**
   * Resolves every bound controller and service and runs their `onReady` hooks one at a time, in
   * dependency order. A hook that throws is logged and the next one still runs, with a warning for
   * each hook whose dependencies' hooks failed. Once shutdown begins, no further hook starts.
   */
  private async runReadyHooks(client: Client<true>): Promise<void> {
    const entries: LifecycleEntry[] = []
    const failed = new Set<unknown>()
    // For each unit, the failed units it depends on, directly or through another dependency
    const failedUpstream = new Map<unknown, Set<LifecycleUnit>>()
    const byToken = new Map(this.lifecycleUnits.map(unit => [unit.token, unit]))
    this.lifecycleEntries = entries

    for (const unit of this.lifecycleUnits) {
      // Shutdown has begun: the client is going away, so no further hook starts
      if (this.closing) break
      const upstream = new Set<LifecycleUnit>()
      for (const dependency of unit.dependencies) {
        if (failed.has(dependency)) upstream.add(byToken.get(dependency)!)
        failedUpstream.get(dependency)?.forEach(failedUnit => upstream.add(failedUnit))
      }
      failedUpstream.set(unit.token, upstream)

      let instance: Partial<OnReady & OnShutdown>
      try {
        // A provided value may be anything, null included; only an object can carry hooks
        instance = (this.container.get(unit.token as ServiceIdentifier) as Partial<OnReady & OnShutdown> | null) ?? {}
      } catch (error) {
        failed.add(unit.token)
        this.logger.error(`Could not resolve ${unit.name} to run its lifecycle hooks:`, error)
        continue
      }
      // Only a unit whose onReady has settled, or that has none, is shut down: a signal mid-ready
      // skips the one still starting, and those not reached yet
      if (typeof instance.onReady !== 'function') {
        entries.push({ name: unit.name, instance })
        continue
      }

      if (upstream.size > 0) {
        const names = [...upstream].map(failedUnit => failedUnit.name).join(', ')
        this.logger.warn(`Running onReady in ${unit.name} although it depends on ${names}, which failed.`)
      }

      const slow = setTimeout(
        () =>
          this.logger.warn(
            `onReady in ${unit.name} has run for over ${SLOW_READY_HOOK_MS} ms; the hooks after it are waiting.`,
          ),
        SLOW_READY_HOOK_MS,
      )
      try {
        await instance.onReady(client, { primary: client.shard ? client.shard.ids.includes(0) : true })
      } catch (error) {
        failed.add(unit.token)
        this.logger.error(`onReady failed in ${unit.name}:`, error)
      } finally {
        clearTimeout(slow)
      }
      entries.push({ name: unit.name, instance })
    }
  }

  /**
   * Runs the `onShutdown` hooks one at a time in reverse dependency order, each isolated, and stops
   * waiting once the whole sequence has run for the configured `shutdownTimeout`.
   */
  private async runShutdownHooks(entries: LifecycleEntry[]): Promise<void> {
    const hooks = (async () => {
      for (const { name, instance } of [...entries].reverse()) {
        if (typeof instance.onShutdown !== 'function') continue
        try {
          await instance.onShutdown()
        } catch (error) {
          this.logger.error(`onShutdown failed in ${name}:`, error)
        }
      }
    })()

    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<'timeout'>(resolve => {
      timer = setTimeout(() => resolve('timeout'), this.shutdownTimeout)
    })
    try {
      if ((await Promise.race([hooks, timedOut])) === 'timeout') {
        this.logger.warn(`onShutdown hooks did not finish within ${this.shutdownTimeout} ms; shutting down anyway.`)
      }
    } finally {
      clearTimeout(timer)
    }
  }

  /**
   * Runs the shutdown hooks, if the ready hooks ran, then destroys the client.
   *
   * @returns Whether the client was destroyed cleanly.
   */
  private async closeClient(): Promise<boolean> {
    this.closing = true
    runningApps.delete(this.close)
    this.logger.log('Shutting down bot...')
    if (this.activityInterval) clearInterval(this.activityInterval)

    // A login that failed never ran onReady, so there is nothing for onShutdown to undo
    if (this.lifecycleEntries) await this.runShutdownHooks(this.lifecycleEntries)

    try {
      this.bot.removeAllListeners()
      await this.bot.destroy()
      this.logger.log('Bot has shut down')
      return true
    } catch (error) {
      this.logger.error('Error during shutdown:', error)
      return false
    }
  }
}
