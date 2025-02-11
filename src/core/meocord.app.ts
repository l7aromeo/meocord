/*
 * MeoCord Framework
 * Copyright (C) 2025 Ukasyah Rahmatullah Zada
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import {
  ActivityType,
  CacheType,
  Client,
  Interaction,
  Message,
  MessageFlagsBitField,
  MessageReaction,
  PartialMessageReaction,
  SlashCommandBuilder,
} from 'discord.js'
import { Logger } from '@src/common'
import { getCommandMap, getMessageHandlers, getReactionHandlers } from '@src/decorator'
import { sample, size } from 'lodash'
import { EmbedUtil } from '@src/util'
import wait from '@src/util/wait.util'
import { CommandType } from '@src/enum'
import { ReactionHandlerAction } from '@src/enum/controller.enum'
import { ReactionHandlerOptions } from '@src/interface'
import { CommandMetadata } from '@src/interface/command-decorator.interface'

export interface AppActivity {
  name: string
  type: ActivityType
  url: string
}

export class MeoCordApp {
  static bot: Client
  private readonly logger = new Logger(MeoCordApp.name)
  private readonly bot: Client
  private isShuttingDown = false
  private controllerInstancesCache = new Map()

  constructor(
    private readonly controllers: any[],
    private readonly discordClient: Client,
    private discordToken: string,
    private activities?: AppActivity[],
  ) {
    this.bot = this.discordClient
    process.on('SIGINT', () => this.gracefulShutdown())
    process.on('SIGTERM', () => this.gracefulShutdown())
  }

  async start() {
    try {
      this.logger.log('Starting bot...')

      this.bot.on('ready', async () => {
        setInterval(() => {
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

    for (const controller of this.controllers) {
      const commandMap = getCommandMap(controller)

      for (const commandName in commandMap) {
        const { builder, type } = commandMap[commandName]
        if (type in CommandType && builder) {
          builders.push(builder)
        }
      }
    }

    try {
      if (this.bot.application) {
        await this.bot.application.commands.set(builders)
        this.logger.log(
          `Registered ${size(builders)} bot commands:`,
          builders.map(builder => {
            if (builder instanceof SlashCommandBuilder && builder.options.length) {
              return {
                name: builder.name,
                subCommands: builder.toJSON().options?.map(option => {
                  return option.name
                }),
              }
            } else {
              return { name: builder.name }
            }
          }),
        )
      }
    } catch (error) {
      this.logger.error('Error during command registration:', error)
    }
  }

  private async handleInteraction(interaction: Interaction<CacheType>) {
    for (const controller of this.controllers) {
      // Check if the controller instance is already cached
      let controllerInstance = this.controllerInstancesCache.get(controller.constructor)
      if (!controllerInstance) {
        const container = Reflect.getMetadata('inversify:container', controller.constructor)
        controllerInstance = container.resolve(controller.constructor)
        this.controllerInstancesCache.set(controller.constructor, controllerInstance)
      }

      const commandMap = getCommandMap(controller)

      let commandMetadata: CommandMetadata<string> | undefined = undefined
      let commandIdentifier: string | undefined = undefined

      if (interaction.isChatInputCommand()) {
        commandIdentifier = interaction.commandName
        commandMetadata = commandMap[commandIdentifier]
      } else if (interaction.isButton() || interaction.isStringSelectMenu() || interaction.isModalSubmit()) {
        commandIdentifier = interaction.customId
        commandMetadata = Object.values(commandMap).find(meta => {
          if (!meta.regex || !commandIdentifier) return false
          const match = meta.regex.exec(commandIdentifier)
          if (match?.groups) {
            ;(interaction as Interaction & { dynamicParams: Record<string, string> }).dynamicParams = match.groups
            return true
          }
          return false
        })
      } else if (interaction.isContextMenuCommand()) {
        commandIdentifier = interaction.commandName
        commandMetadata = commandMap[commandIdentifier]
      }

      if (commandMetadata) {
        const { methodName, type } = commandMetadata

        try {
          // Ensure the interaction type matches the command type
          if (
            (type === CommandType.SLASH && interaction.isChatInputCommand()) ||
            (type === CommandType.BUTTON && interaction.isButton()) ||
            (type === CommandType.SELECT_MENU && interaction.isStringSelectMenu()) ||
            (type === CommandType.CONTEXT_MENU && interaction.isUserContextMenuCommand()) ||
            (type === CommandType.CONTEXT_MENU && interaction.isMessageContextMenuCommand()) ||
            (type === CommandType.MODAL_SUBMIT && interaction.isModalSubmit())
          ) {
            this.logger.log('[INTERACTION]', `[${CommandType[type]}]`, `[${methodName}]`)

            let dynamicParams = {}

            if (interaction.isChatInputCommand() && interaction.options) {
              dynamicParams = interaction.options.data.reduce((acc, opt) => {
                acc[opt.name] = opt.value
                return acc
              }, {})
            } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
              dynamicParams = (interaction as any).dynamicParams || {}
            }

            await controllerInstance[methodName](interaction, dynamicParams)
          } else {
            this.logger.warn(
              `Interaction type mismatch for command "${commandIdentifier}". Interaction type: ${interaction.type}.`,
            )
          }
        } catch (error) {
          this.logger.error(`Error executing command "${commandIdentifier}":`, error)

          if (interaction.isRepliable()) {
            const embed = EmbedUtil.createErrorEmbed('An error occurred while executing the command.')
            await interaction.reply({
              embeds: [embed],
              flags: MessageFlagsBitField.Flags.Ephemeral,
            })
          }
        }
        return
      }
    }

    // If no matching command is found
    if (interaction.isRepliable()) {
      const embed = EmbedUtil.createErrorEmbed('Command not found!')
      await interaction.reply({ embeds: [embed], flags: MessageFlagsBitField.Flags.Ephemeral })
    }
  }

  private async handleMessage(message: Message) {
    if (message.author.bot || !message.content?.trim()) return

    const messageContent = message.content.trim()

    const relevantControllers = this.controllers.filter(controller => {
      const messageHandlers = getMessageHandlers(controller)
      return messageHandlers.some(handler => !handler.keyword || handler.keyword === messageContent)
    })

    for (const controller of relevantControllers) {
      let controllerInstance = this.controllerInstancesCache.get(controller.constructor)
      if (!controllerInstance) {
        const container = Reflect.getMetadata('inversify:container', controller.constructor)
        controllerInstance = container.resolve(controller.constructor)
        this.controllerInstancesCache.set(controller.constructor, controllerInstance)
      }

      let messageHandlers = getMessageHandlers(controller)

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

    const relevantControllers = this.controllers.filter(controller => {
      const reactionHandlers = getReactionHandlers(controller)
      return reactionHandlers.some(handler => !handler.emoji || handler.emoji === reaction.emoji.name)
    })

    for (const controller of relevantControllers) {
      let controllerInstance = this.controllerInstancesCache.get(controller.constructor)
      if (!controllerInstance) {
        const container = Reflect.getMetadata('inversify:container', controller.constructor)
        controllerInstance = container.resolve(controller.constructor)
        this.controllerInstancesCache.set(controller.constructor, controllerInstance)
      }

      let reactionHandlers = getReactionHandlers(controller)

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
    if (this.bot && !this.isShuttingDown) {
      try {
        this.isShuttingDown = true
        this.logger.log('Shutting down bot...')
        this.bot.removeAllListeners()
        await this.bot.destroy()
        this.logger.log('Bot has shut down')
        await wait(100)
        process.exit(0)
      } catch (error) {
        this.logger.error('Error during shutdown:', error)
        await wait(100)
        process.exit(0)
      }
    }
  }
}
