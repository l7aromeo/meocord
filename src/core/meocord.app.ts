/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import {
  type ActivityOptions,
  type AutocompleteInteraction,
  type CacheType,
  Client,
  type Interaction,
  Message,
  MessageFlagsBitField,
  MessageReaction,
  type PartialMessageReaction,
  SlashCommandBuilder,
} from 'discord.js'
import { type Container } from 'inversify'
import { Logger } from '@src/common/index.js'
import {
  findAmbiguousRoutes,
  getAutocompleteHandlers,
  getCommandMap,
  getMessageHandlers,
  getReactionHandlers,
  PARAM_SEPARATOR,
} from '@src/decorator/controller.decorator.js'
import { sample } from 'lodash-es'
import { EmbedUtil } from '@src/util/index.js'
import {
  describeInteraction,
  focusedOptionName,
  hasCustomId,
  matchesCommandType,
  resolveCommandPaths,
  resolveOptionParams,
} from '@src/util/interaction.util.js'
import { CommandType } from '@src/enum/index.js'
import { ReactionHandlerAction } from '@src/enum/controller.enum.js'
import { type ReactionHandlerOptions } from '@src/interface/index.js'
import { type AutocompleteMetadata, type CommandMetadata } from '@src/interface/command-decorator.interface.js'
import Table from 'cli-table3'

interface ComponentRoute {
  controllerClass: new (...args: any[]) => any
  meta: CommandMetadata<string>
  pattern: string
}

interface AutocompleteRoute {
  controllerClass: new (...args: any[]) => any
  meta: AutocompleteMetadata
}

/**
 * The name a builder registers under, which is what Discord deduplicates on.
 *
 * Read from the built payload rather than from the `@Command` argument: a builder is
 * free to name the command something other than the string it was handed, and it is
 * the payload Discord sees.
 */
function commandNameOf(builder: NonNullable<CommandMetadata['builder']>): string | undefined {
  try {
    const json =
      typeof (builder as { toJSON?: () => unknown }).toJSON === 'function'
        ? ((builder as { toJSON: () => unknown }).toJSON() as { name?: string })
        : (builder as { name?: string })
    return typeof json?.name === 'string' ? json.name : undefined
  } catch {
    // A builder missing a required field throws from toJSON. Surfacing that is the
    // registration call's job, where it is reported against the command Discord
    // rejected -- deduplication should not be what turns it into a startup crash.
    return undefined
  }
}

export class MeoCordApp {
  private readonly logger = new Logger(MeoCordApp.name)
  private readonly bot: Client
  private isShuttingDown = false
  private activityInterval: ReturnType<typeof setInterval> | null = null
  private controllerInstancesCache = new Map<any, any>()

  constructor(
    private readonly controllerClasses: (new (...args: any[]) => any)[],
    private readonly container: Container,
    private readonly discordClient: Client,
    private discordToken: string,
    private activities?: ActivityOptions[],
  ) {
    this.bot = this.discordClient
    process.on('SIGINT', () => this.gracefulShutdown())
    process.on('SIGTERM', () => this.gracefulShutdown())
  }

  /**
   * Runs an event handler so a failure inside it cannot take the process down.
   *
   * discord.js calls listeners without awaiting them, so a rejection escaping one has
   * nothing left to settle it: Node reports an unhandled rejection, which terminates
   * the process by default. Losing the whole bot because one reaction landed on a
   * deleted message, or one controller could not be resolved, is a worse failure than
   * the one that caused it -- every other user is served by the same process.
   *
   * Nothing is silenced. The error is logged against the event that produced it, so a
   * genuine misconfiguration -- an unbound controller, a missing dependency -- shows
   * up on the very first interaction rather than staying hidden.
   *
   * @param event - The gateway event being handled, named in the log.
   * @param run - The handler to run.
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

  async start() {
    try {
      this.logger.log('Starting bot...')

      this.bot.on('clientReady', () =>
        this.runListener('clientReady', async () => {
          this.activityInterval = setInterval(() => this.updateActivity(), 10000)
          await this.registerCommands()
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

      await this.bot.login(this.discordToken)
      this.logger.log('Bot is online!')
    } catch (error) {
      this.logger.error('Error during bot startup:', error)
    }
  }

  async registerCommands() {
    // Keyed by registered name: a command whose subcommands live in separate methods
    // declares the same name more than once, and sending its builder twice makes
    // Discord reject the whole payload. The first builder wins, and a second one that
    // is not the same object is reported rather than silently dropped.
    const buildersByName = new Map<string, NonNullable<CommandMetadata['builder']>>()

    for (const controllerClass of this.controllerClasses) {
      const instance = this.getInstance(controllerClass)
      const commandMap = getCommandMap(instance)

      for (const commandName in commandMap) {
        const commandMetadataArray = commandMap[commandName]

        if (!Array.isArray(commandMetadataArray)) continue

        for (const { builder, type } of commandMetadataArray) {
          if (!(type in CommandType) || !builder) continue

          const registeredName = commandNameOf(builder) ?? commandName
          const existing = buildersByName.get(registeredName)
          if (existing === undefined) {
            buildersByName.set(registeredName, builder)
          } else if (existing !== builder) {
            this.logger.warn(
              `Command "${registeredName}" is built more than once; only the first builder is registered. ` +
                `Declare the builder on one @Command and give the others the plain CommandType.`,
            )
          }
        }
      }
    }

    const builders = [...buildersByName.values()]

    try {
      if (this.bot.application) {
        await this.bot.application.commands.set(builders)
        const table = new Table({
          head: ['Name', 'Type', 'Sub-commands'],
          colWidths: [null, null, 30],
          wordWrap: true,
        })

        for (const builder of builders) {
          const json = typeof (builder as any).toJSON === 'function' ? (builder as any).toJSON() : (builder as any)
          const typeName =
            json?.type === 1
              ? 'SlashCommand'
              : json?.type === 2
                ? 'UserContextMenu'
                : json?.type === 3
                  ? 'MessageContextMenu'
                  : json?.type === 4
                    ? 'PrimaryEntryPoint'
                    : builder instanceof SlashCommandBuilder
                      ? 'SlashCommand'
                      : 'Command'
          const name = json?.name || (builder as any).name
          const subCommands =
            Array.isArray(json?.options) && json.options.length
              ? json.options.map((opt: any) => opt.name).join(', ')
              : ''

          table.push([name, typeName, subCommands])
        }

        this.logger.log(`Registered ${builders.length} bot commands:\n${table.toString()}`)
      }
    } catch (error) {
      this.logger.error('Error during command registration:', error)
    }
  }

  /**
   * Every pattern-matched route, ordered most specific first.
   *
   * Built once and cached, so dispatch stays a single ordered walk with an early exit
   * rather than paying to rank anything per interaction. Ordering here is what lets
   * `gi-profile/summary/{ownerId}/{uid}` keep the ids it owns when
   * `gi-profile/{uuid}/{uid}` would also match them — without it, the winner would be
   * whichever controller happened to be registered first.
   */
  private componentRoutes?: ComponentRoute[]

  private getComponentRoutes(): ComponentRoute[] {
    if (this.componentRoutes) return this.componentRoutes

    const routes: ComponentRoute[] = []
    for (const controllerClass of this.controllerClasses) {
      const commandMap = getCommandMap(this.getInstance(controllerClass))
      if (!commandMap) continue
      for (const [pattern, metaArray] of Object.entries(commandMap)) {
        if (!Array.isArray(metaArray)) continue
        for (const meta of metaArray) {
          if (meta.regex) routes.push({ controllerClass, meta, pattern })
        }
      }
    }

    routes.sort((a, b) => (b.meta.specificity ?? 0) - (a.meta.specificity ?? 0))
    this.reportAmbiguousRoutes(routes)
    this.componentRoutes = routes
    return routes
  }

  /**
   * Warns rather than throws: an app whose patterns overlap boots and works today, and
   * refusing to start would turn a latent mis-route into an outage on upgrade.
   */
  private reportAmbiguousRoutes(routes: ComponentRoute[]): void {
    // Grouped by command type first: dispatch only considers routes whose component
    // type matches the interaction, so a button and a select menu sharing a pattern
    // are never in competition and reporting them would be a false alarm.
    const byType = new Map<CommandType, string[]>()
    for (const { meta, pattern } of routes) {
      const patterns = byType.get(meta.type) ?? []
      patterns.push(pattern)
      byType.set(meta.type, patterns)
    }

    const collisions = [...byType.values()].flatMap(patterns => findAmbiguousRoutes(patterns))
    if (collisions.length === 0) return

    this.logger.warn(
      `${collisions.length} pattern pair(s) can match the same customId, so which one runs is decided by ` +
        `ranking rather than by the ids themselves:\n` +
        collisions.map(([left, right]) => `  "${left}"  vs  "${right}"`).join('\n') +
        `\nA parameter stops at "${PARAM_SEPARATOR}", so separating these segments with it makes them distinct.`,
    )
  }

  /**
   * Every `@Autocomplete` handler, ordered so an option-specific handler is found
   * before a command-wide one.
   *
   * Cached alongside the component table: autocomplete fires on every keystroke, and
   * rebuilding the list per keystroke would put reflection on the hottest path the
   * framework has.
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
   * Dispatches an interaction, and makes sure a failure anywhere in that still reaches
   * the person who triggered it.
   *
   * {@link executeCommand} already reports what a handler throws, but everything
   * *before* the handler can fail too — resolving a controller through the container
   * is the common case — and a component that fails there would otherwise look dead
   * with nothing said to the user and nothing in the log.
   */
  private async handleInteraction(interaction: Interaction<CacheType>): Promise<void> {
    try {
      await this.dispatchInteraction(interaction)
    } catch (error) {
      this.logger.error(`Error dispatching ${describeInteraction(interaction)}:`, error)

      // Autocomplete has no reply to fall back on; closing its window is the only
      // thing that stops the client showing a loading state until it times out.
      if (interaction.isAutocomplete()) {
        await this.respondEmpty(interaction)
        return
      }

      await this.replyWithError(interaction, 'An error occurred while executing the command.')
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
      for (const { controllerClass, meta } of this.getComponentRoutes()) {
        // A button and a select menu may legitimately share a customId shape, so the
        // pattern alone does not identify the handler -- the component type does.
        if (!matchesCommandType(meta.type, interaction)) continue
        const match = meta.regex!.exec(customId)
        if (!match) continue
        ;(interaction as Interaction & { dynamicParams: Record<string, string> }).dynamicParams = match.groups ?? {}
        await this.executeCommand(this.getInstance(controllerClass), meta, interaction, customId)
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

        await this.executeCommand(controllerInstance, commandMetadata, interaction, path)
        return
      }
    }

    // Log what actually failed to match. The user's "Command not found!" says nothing
    // about which id was unroutable, so a control that is emitted but never routed --
    // a customId whose value broke its pattern, or a handler nobody wrote -- stays
    // invisible until somebody reports the dead button.
    this.logger.warn(
      `No handler matched ${describeInteraction(interaction)}. Check that a @Command pattern is ` +
        `declared for it and that its controller is registered.`,
    )

    await this.replyWithError(interaction, 'Command not found!')
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
   * Answers an autocomplete interaction from the `@Autocomplete` handler that claims it.
   *
   * Discord closes the window after three seconds and shows a loading state until
   * something arrives, so an unclaimed option is answered with an empty list rather
   * than left to time out -- a visibly empty menu is a better failure than a stuck one,
   * and the warning says which option is missing a handler.
   */
  private async handleAutocomplete(interaction: AutocompleteInteraction<CacheType>): Promise<void> {
    const focusedName = focusedOptionName(interaction)

    for (const path of resolveCommandPaths(interaction)) {
      for (const { controllerClass, meta } of this.getAutocompleteRoutes()) {
        if (meta.commandPath !== path) continue
        if (meta.optionName !== undefined && meta.optionName !== focusedName) continue

        try {
          const controllerInstance = this.getInstance(controllerClass)
          this.logger.log('[AUTOCOMPLETE]', `[${path}]`, `[${meta.methodName}]`)
          await controllerInstance[meta.methodName](interaction, resolveOptionParams(interaction))
        } catch (error) {
          this.logger.error(`Error handling ${describeInteraction(interaction)}:`, error)
          await this.respondEmpty(interaction)
        }
        return
      }
    }

    this.logger.warn(
      `No handler matched ${describeInteraction(interaction)}. Declare an @Autocomplete handler for it, ` +
        `or drop setAutocomplete(true) from the option.`,
    )
    await this.respondEmpty(interaction)
  }

  /** Closes an autocomplete window that nothing else answered. */
  private async respondEmpty(interaction: AutocompleteInteraction<CacheType>): Promise<void> {
    if (interaction.responded) return
    try {
      await interaction.respond([])
    } catch (error) {
      // The three-second window may already have closed, which is not actionable.
      this.logger.debug(`Could not close autocomplete window: ${String(error)}`)
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
    commandIdentifier: string | undefined,
  ): Promise<void> {
    const { methodName, type } = commandMetadata

    // No interaction-type check here: both callers pick the route with
    // `matchesCommandType` before getting this far, and `@Command` re-checks the
    // interaction on the way into the handler.
    try {
      this.logger.log('[INTERACTION]', `[${type}]`, `[${methodName}]`)

      let dynamicParams: Record<string, unknown> = {}

      if (interaction.isChatInputCommand()) {
        dynamicParams = resolveOptionParams(interaction)
      } else if (hasCustomId(interaction)) {
        dynamicParams = (interaction as Interaction & { dynamicParams?: Record<string, string> }).dynamicParams ?? {}
      }

      await controllerInstance[methodName](interaction, dynamicParams)
    } catch (error) {
      this.logger.error(`Error executing command "${commandIdentifier}":`, error)
      await this.replyWithError(interaction, 'An error occurred while executing the command.')
    }
  }

  /**
   * Tells the user something went wrong, if the interaction can still hear it.
   *
   * A handler that replies and *then* throws is the common shape of a failure, and
   * replying twice throws in turn -- out of the catch block, where nothing is left to
   * handle it. Whatever the interaction's state, reporting an error must not be able
   * to become a second, worse one.
   */
  private async replyWithError(interaction: Interaction<CacheType>, message: string): Promise<void> {
    if (!interaction.isRepliable() || interaction.replied || interaction.deferred) return

    try {
      const embed = EmbedUtil.createErrorEmbed(message)
      await interaction.reply({ embeds: [embed], flags: MessageFlagsBitField.Flags.Ephemeral })
    } catch (error) {
      // Unknown or already-acknowledged interaction; the user cannot be told anything.
      this.logger.debug(`Could not deliver the error reply: ${String(error)}`)
    }
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
          try {
            await controllerInstance[method](message)
          } catch (error) {
            this.logger.error(`Error handling message "${messageContent}" for method "${method}":`, error)
          }
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
          try {
            await controllerInstance[method](reaction, { user, action })
          } catch (error) {
            this.logger.error(`Error handling reaction "${reaction.emoji.name}" for method "${method}":`, error)
          }
        }
      }
    }
  }

  private async gracefulShutdown() {
    if (this.isShuttingDown) {
      process.exit(1)
    }

    if (this.bot) {
      try {
        this.isShuttingDown = true
        this.logger.log('Shutting down bot...')
        if (this.activityInterval) clearInterval(this.activityInterval)
        this.bot.removeAllListeners()
        await this.bot.destroy()
        this.logger.log('Bot has shut down')
        process.exit(0)
      } catch (error) {
        this.logger.error('Error during shutdown:', error)
        process.exit(1)
      }
    }
  }
}
