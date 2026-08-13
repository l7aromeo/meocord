/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import {
  type ActivityOptions,
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
  getCommandMap,
  getMessageHandlers,
  getReactionHandlers,
  PARAM_SEPARATOR,
} from '@src/decorator/controller.decorator.js'
import { sample } from 'lodash-es'
import { EmbedUtil } from '@src/util/index.js'
import { CommandType } from '@src/enum/index.js'
import { ReactionHandlerAction } from '@src/enum/controller.enum.js'
import { type ReactionHandlerOptions } from '@src/interface/index.js'
import { type CommandMetadata } from '@src/interface/command-decorator.interface.js'
import Table from 'cli-table3'

interface ComponentRoute {
  controllerClass: new (...args: any[]) => any
  meta: CommandMetadata<string>
  pattern: string
}

/** Identifies an unmatched interaction for the log, by whichever field would have routed it. */
function describeUnmatched(interaction: Interaction): string {
  if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
    return `command "${interaction.commandName}"`
  }
  if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
    return `customId "${interaction.customId}"`
  }
  return `interaction type ${interaction.type}`
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

  private getInstance(controllerClass: new (...args: any[]) => any): any {
    if (!this.controllerInstancesCache.has(controllerClass)) {
      this.controllerInstancesCache.set(controllerClass, this.container.get(controllerClass))
    }
    return this.controllerInstancesCache.get(controllerClass)
  }

  async start() {
    try {
      this.logger.log('Starting bot...')

      this.bot.on('clientReady', async () => {
        this.activityInterval = setInterval(() => {
          this.bot.user?.setActivity(sample(this.activities))
        }, 10000)

        await this.registerCommands()
      })

      this.bot.on('interactionCreate', async interaction => {
        await this.handleInteraction(interaction)
      })

      this.bot.on('messageCreate', async message => {
        await this.handleMessage(message)
      })

      this.bot.on('messageReactionAdd', async (reaction, user) => {
        await this.handleReaction(reaction, { user, action: ReactionHandlerAction.ADD })
      })

      this.bot.on('messageReactionRemove', async (reaction, user) => {
        await this.handleReaction(reaction, { user, action: ReactionHandlerAction.REMOVE })
      })

      await this.bot.login(this.discordToken)
      this.logger.log('Bot is online!')
    } catch (error) {
      this.logger.error('Error during bot startup:', error)
    }
  }

  async registerCommands() {
    const builders: NonNullable<CommandMetadata['builder']>[] = []

    for (const controllerClass of this.controllerClasses) {
      const instance = this.getInstance(controllerClass)
      const commandMap = getCommandMap(instance)

      for (const commandName in commandMap) {
        const commandMetadataArray = commandMap[commandName]

        if (!Array.isArray(commandMetadataArray)) continue

        for (const { builder, type } of commandMetadataArray) {
          if (type in CommandType && builder) {
            builders.push(builder)
          }
        }
      }
    }

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
   * `gi-profile-summary-{ownerId}-{uid}` keep the ids it owns when
   * `gi-profile-{uuid}-{uid}` would also match them — without it, the winner would be
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
    const collisions = findAmbiguousRoutes(routes.map(({ pattern }) => pattern))
    if (collisions.length === 0) return

    this.logger.warn(
      `${collisions.length} pattern pair(s) can match the same customId, so which one runs is decided by ` +
        `ranking rather than by the ids themselves:\n` +
        collisions.map(([left, right]) => `  "${left}"  vs  "${right}"`).join('\n') +
        `\nA parameter stops at "${PARAM_SEPARATOR}", so separating these segments with it makes them distinct.`,
    )
  }

  private async handleInteraction(interaction: Interaction<CacheType>) {
    // Component interactions route on a pattern, so they go through the ranked table.
    // Slash and context-menu commands match their name exactly and cannot overlap.
    if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
      const customId = interaction.customId
      for (const { controllerClass, meta } of this.getComponentRoutes()) {
        const match = meta.regex!.exec(customId)
        if (!match) continue
        ;(interaction as Interaction & { dynamicParams: Record<string, string> }).dynamicParams = match.groups ?? {}
        await this.executeCommand(this.getInstance(controllerClass), meta, interaction, customId)
        return
      }
    }

    for (const controllerClass of this.controllerClasses) {
      const controllerInstance = this.getInstance(controllerClass)
      const commandMap = getCommandMap(controllerInstance)
      if (!commandMap) continue

      let commandMetadataArray: CommandMetadata<string>[] | undefined = undefined
      let commandIdentifier: string | undefined = undefined

      if (interaction.isChatInputCommand() || interaction.isContextMenuCommand()) {
        commandIdentifier = interaction.commandName
        commandMetadataArray = commandMap[commandIdentifier]
      }

      if (commandMetadataArray && commandMetadataArray.length > 0) {
        const commandMetadata = commandMetadataArray[0]
        await this.executeCommand(controllerInstance, commandMetadata, interaction, commandIdentifier)
        return
      }
    }

    // Log what actually failed to match. The user's "Command not found!" says nothing
    // about which id was unroutable, so a control that is emitted but never routed --
    // a customId whose value broke its pattern, or a handler nobody wrote -- stays
    // invisible until somebody reports the dead button.
    this.logger.warn(
      `No handler matched ${describeUnmatched(interaction)}. Check that a @Command pattern is ` +
        `declared for it and that its controller is registered.`,
    )

    if (interaction.isRepliable()) {
      const embed = EmbedUtil.createErrorEmbed('Command not found!')
      await interaction.reply({ embeds: [embed], flags: MessageFlagsBitField.Flags.Ephemeral })
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

    try {
      if (
        (type === CommandType.SLASH && interaction.isChatInputCommand()) ||
        (type === CommandType.BUTTON && interaction.isButton()) ||
        (type === CommandType.SELECT_MENU && interaction.isStringSelectMenu()) ||
        (type === CommandType.CONTEXT_MENU && interaction.isUserContextMenuCommand()) ||
        (type === CommandType.CONTEXT_MENU && interaction.isMessageContextMenuCommand()) ||
        (type === CommandType.MODAL_SUBMIT && interaction.isModalSubmit())
      ) {
        this.logger.log('[INTERACTION]', `[${CommandType[type]}]`, `[${methodName}]`)

        let dynamicParams: Record<string, unknown> = {}

        if (interaction.isChatInputCommand() && interaction.options) {
          dynamicParams = interaction.options.data.reduce<Record<string, unknown>>((acc, opt) => {
            acc[opt.name] = opt.value
            return acc
          }, {})
        } else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
          dynamicParams = (interaction as Interaction & { dynamicParams?: Record<string, string> }).dynamicParams ?? {}
        }

        await controllerInstance[methodName](interaction, dynamicParams)
        return
      }

      this.logger.warn(
        `Interaction type mismatch for command "${commandIdentifier}". Interaction type: ${interaction.type}.`,
      )
    } catch (error) {
      this.logger.error(`Error executing command "${commandIdentifier}":`, error)

      if (interaction.isRepliable()) {
        const embed = EmbedUtil.createErrorEmbed('An error occurred while executing the command.')
        await interaction.reply({ embeds: [embed], flags: MessageFlagsBitField.Flags.Ephemeral })
      }
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
    await reaction.message.fetch()

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
