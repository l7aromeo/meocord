import {
  type ActivityOptions,
  type AutocompleteInteraction,
  type CacheType,
  Client,
  type Interaction,
  Message,
  MessageReaction,
  type PartialMessageReaction,
  REST,
  Routes,
} from 'discord.js'
import { type Container } from 'inversify'
import { Logger } from '@src/common/index.js'
import {
  getAutocompleteHandlers,
  getCommandMap,
  getMessageHandlers,
  getReactionHandlers,
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
import { type OnReady, type OnShutdown, type ReactionHandlerOptions } from '@src/interface/index.js'
import { type AutocompleteMetadata, type CommandMetadata } from '@src/interface/command-decorator.interface.js'
import {
  buildComponentRoutes,
  type ComponentRoute,
  findComponentRouteConflicts,
  matchComponentRoute,
} from '@src/core/component-routes.js'
import { globalStagesOf, handleUnroutedError, runHandler } from '@src/core/handler-pipeline.js'
import { closeAutocomplete, createFallback, type Fallback } from '@src/core/fallback.js'
import { handlerInput } from '@src/core/handler-input.js'
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
import { lifecycleDependencies } from '@src/core/lifecycle-order.js'
import { type MeoCordApplication } from '@src/interface/index.js'
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

/** A resolved controller or service, with the class it came from. */
interface LifecycleEntry {
  lifecycleClass: LifecycleClass
  instance: Partial<OnReady & OnShutdown>
}

/** Closes each started app: runs its shutdown hooks and destroys its client, resolving `false` on failure. */
const runningApps = new Set<() => Promise<boolean>>()
let shuttingDown = false
let signalHandlersInstalled = false

/**
 * Shuts every started app down and exits: `onShutdown` hooks under the configured `shutdownTimeout`,
 * then `destroy()`, then exit 0, or 1 if a client failed to close. SIGINT and SIGTERM call it, and so
 * does a shard its manager tells to stop; a second call while one is running forces exit 1.
 */
export async function shutdownAndExit(): Promise<void> {
  if (shuttingDown) {
    // A shard hears Ctrl+C both directly and from its manager, which owns forcing it; so it waits
    if (isShardProcess()) return
    process.exit(1)
    return
  }
  shuttingDown = true

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

/** The discord.js login errors no restart can fix, which a shard reports to its manager before exiting. */
const FATAL_LOGIN_CODES = new Set(['TokenInvalid', 'DisallowedIntents'])

/** Tells the manager a shard cannot log in, and waits until the message is sent. */
async function reportFatalLogin(error: unknown): Promise<void> {
  const code = (error as { code?: unknown } | null)?.code
  if (!isShardProcess() || !process.send || typeof code !== 'string' || !FATAL_LOGIN_CODES.has(code)) return
  const message: ShardMessage = { meocord: 'fatal', code, message: error instanceof Error ? error.message : String(error) }
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
  ) {
    this.bot = this.discordClient
    this.shutdownTimeout =
      typeof shutdownTimeout === 'number' && shutdownTimeout >= 0 ? shutdownTimeout : DEFAULT_SHUTDOWN_TIMEOUT_MS
  }

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
   * Registers the Discord event handlers and logs the bot in.
   *
   * If the login fails, the process exit code is set to `1` before the promise rejects, so the
   * process exits non-zero even when the caller catches the error to log it. A later `start()`
   * that logs in clears that code again.
   *
   * @returns A promise that resolves once the bot is logged in.
   * @throws The login error, such as an invalid token or Discord being unreachable.
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
      await reportFatalLogin(error)
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
    const rest = new REST().setToken(this.discordToken)
    let applicationId: string

    try {
      applicationId = ((await rest.get(Routes.currentApplication())) as { id: string }).id
    } catch (error) {
      this.logger.error('Could not read the application the token belongs to; check discordToken:', error)
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
    try {
      await this.dispatchInteraction(interaction)
    } catch (error) {
      await handleUnroutedError(this.container, [interaction], error, { fallback: this.fallback })
    }
  }

  private async dispatchInteraction(interaction: Interaction<CacheType>) {
    // Autocomplete first, and on its own path: it is answered with `respond()` rather
    // than a reply, it has no customId to route on, and the "Command not found!" reply
    // the other paths end in cannot be sent to it at all.
    if (interaction.isAutocomplete()) {
      await this.handleAutocomplete(interaction)
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
        await this.executeCommand(this.getInstance(route.controllerClass), route.meta, interaction)
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

        await this.executeCommand(controllerInstance, commandMetadata, interaction)
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
  private async handleAutocomplete(interaction: AutocompleteInteraction<CacheType>): Promise<void> {
    const focusedName = focusedOptionName(interaction)

    for (const path of resolveCommandPaths(interaction)) {
      for (const { controllerClass, meta } of this.getAutocompleteRoutes()) {
        if (meta.commandPath !== path) continue
        if (meta.optionName !== undefined && meta.optionName !== focusedName) continue

        const controllerInstance = this.getInstance(controllerClass)
        this.logger.log('[AUTOCOMPLETE]', `[${path}]`, `[${meta.methodName}]`)
        const params = resolveOptionParams(interaction)
        const ran = await this.invokeHandler(controllerInstance, meta.methodName, [interaction, params])
        if (!ran) await closeAutocomplete(interaction, this.logger)
        return
      }
    }

    this.logger.warn(
      `No handler matched ${describeInteraction(interaction)}. Declare an @Autocomplete handler for it, ` +
        `or drop setAutocomplete(true) from the option.`,
    )
    await closeAutocomplete(interaction, this.logger)
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
        `"${name}" is both a customId param and a modal field of ${methodName}; the handler receives the customId ` +
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
  ): Promise<void> {
    const { methodName, type } = commandMetadata

    // No interaction-type check here: both callers pick the route with
    // `matchesCommandType` before getting this far, and `@Command` re-checks the
    // interaction on the way into the handler.
    this.logger.log('[INTERACTION]', `[${type}]`, `[${methodName}]`)

    const routeParams = (interaction as Interaction & { dynamicParams?: Record<string, string> }).dynamicParams
    const { params, collisions } = handlerInput(interaction, routeParams)
    this.warnCollisions(methodName, collisions)

    await this.invokeHandler(controllerInstance, methodName, [interaction, params])
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
      for (const { keyword, method } of getMessageHandlers(prototype)) {
        const decorator = keyword === undefined ? '@MessageHandler()' : `@MessageHandler('${keyword}')`
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
  ): Promise<boolean> {
    const { ran } = await runHandler(this.container, instance, methodName, args, { fallback: this.fallback })
    return ran
  }

  private async handleMessage(message: Message) {
    if (message.author.bot || !message.content?.trim()) return

    const messageContent = message.content.trim()

    const relevantControllers = this.controllerClasses.filter(controllerClass => {
      const instance = this.getInstance(controllerClass)
      const messageHandlers = getMessageHandlers(instance)
      return messageHandlers.some(handler => !handler.keyword || handler.keyword === messageContent)
    })

    for (const controllerClass of relevantControllers) {
      const controllerInstance = this.getInstance(controllerClass)

      let messageHandlers = getMessageHandlers(controllerInstance)

      messageHandlers = messageHandlers.sort((a, b) => {
        if (a.keyword && !b.keyword) return -1
        if (!a.keyword && b.keyword) return 1
        return 0
      })

      for (const handler of messageHandlers) {
        const { keyword, method } = handler

        if (!keyword || keyword === messageContent) {
          await this.invokeHandler(controllerInstance, method, [message])
        }
      }
    }
  }

  private async handleReaction(
    reaction: MessageReaction | PartialMessageReaction,
    { user, action }: ReactionHandlerOptions,
  ) {
    // A reaction arrives for messages the bot may no longer be able to read -- deleted,
    // or in a channel it lost access to -- and `fetch` rejects for all of them. That is
    // an ordinary outcome rather than a fault, so the reaction is skipped quietly.
    try {
      await reaction.message.fetch()
    } catch (error) {
      this.logger.debug(`Skipping a reaction whose message could not be fetched: ${String(error)}`)
      return
    }

    const relevantControllers = this.controllerClasses.filter(controllerClass => {
      const instance = this.getInstance(controllerClass)
      const reactionHandlers = getReactionHandlers(instance)
      return reactionHandlers.some(handler => !handler.emoji || handler.emoji === reaction.emoji.name)
    })

    for (const controllerClass of relevantControllers) {
      const controllerInstance = this.getInstance(controllerClass)

      let reactionHandlers = getReactionHandlers(controllerInstance)

      reactionHandlers = reactionHandlers.sort((a, b) => {
        if (a.emoji && !b.emoji) return -1
        if (!a.emoji && b.emoji) return 1
        return 0
      })

      for (const handler of reactionHandlers) {
        const { emoji, method } = handler

        if (!emoji || emoji === reaction.emoji.name) {
          await this.invokeHandler(controllerInstance, method, [reaction, { user, action }])
        }
      }
    }
  }

  /**
   * Resolves every bound controller and service and runs their `onReady` hooks one at a time, in
   * dependency order. A hook that throws is logged and the next one still runs, with a warning for
   * each hook whose dependencies' hooks failed.
   */
  private async runReadyHooks(client: Client<true>): Promise<void> {
    const entries: LifecycleEntry[] = []
    const failed = new Set<LifecycleClass>()
    // For each class, the failed classes it depends on, directly or through another dependency
    const failedUpstream = new Map<LifecycleClass, Set<LifecycleClass>>()
    this.lifecycleEntries = entries

    for (const lifecycleClass of this.lifecycleClasses) {
      const upstream = new Set<LifecycleClass>()
      for (const dependency of lifecycleDependencies(this.container, lifecycleClass)) {
        if (failed.has(dependency)) upstream.add(dependency)
        failedUpstream.get(dependency)?.forEach(cls => upstream.add(cls))
      }
      failedUpstream.set(lifecycleClass, upstream)

      let instance: Partial<OnReady & OnShutdown>
      try {
        instance = this.container.get(lifecycleClass)
      } catch (error) {
        failed.add(lifecycleClass)
        this.logger.error(`Could not resolve ${lifecycleClass.name} to run its lifecycle hooks:`, error)
        continue
      }
      entries.push({ lifecycleClass, instance })
      if (typeof instance.onReady !== 'function') continue

      if (upstream.size > 0) {
        const names = [...upstream].map(cls => cls.name).join(', ')
        this.logger.warn(`Running onReady in ${lifecycleClass.name} although it depends on ${names}, which failed.`)
      }

      const slow = setTimeout(
        () =>
          this.logger.warn(
            `onReady in ${lifecycleClass.name} has run for over ${SLOW_READY_HOOK_MS} ms; the hooks after it are waiting.`,
          ),
        SLOW_READY_HOOK_MS,
      )
      try {
        await instance.onReady(client, { primary: client.shard ? client.shard.ids.includes(0) : true })
      } catch (error) {
        failed.add(lifecycleClass)
        this.logger.error(`onReady failed in ${lifecycleClass.name}:`, error)
      } finally {
        clearTimeout(slow)
      }
    }
  }

  /**
   * Runs the `onShutdown` hooks one at a time in reverse dependency order, each isolated, and stops
   * waiting once the whole sequence has run for the configured `shutdownTimeout`.
   */
  private async runShutdownHooks(entries: LifecycleEntry[]): Promise<void> {
    const hooks = (async () => {
      for (const { lifecycleClass, instance } of [...entries].reverse()) {
        if (typeof instance.onShutdown !== 'function') continue
        try {
          await instance.onShutdown()
        } catch (error) {
          this.logger.error(`onShutdown failed in ${lifecycleClass.name}:`, error)
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
