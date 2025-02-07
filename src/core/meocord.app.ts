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
  ContextMenuCommandBuilder,
  Interaction,
  Message,
  MessageFlagsBitField,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  SlashCommandBuilder,
  User,
} from 'discord.js'
import { Logger } from '@src/common'
import { CommandMetadata, getCommandMap, getMessageHandlers, getReactionHandlers } from '@src/decorator'
import { sample, size } from 'lodash'
import { EmbedUtil } from '@src/util'
import wait from '@src/util/wait.util'
import { CommandType } from '@src/enum'

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

  constructor(
    private readonly controllers: any[],
    private readonly discordClient: Client,
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
        await this.handleReaction(reaction, user, 'add')
      })

      this.bot.on('messageReactionRemove', async (reaction, user) => {
        await this.handleReaction(reaction, user, 'remove')
      })

      await this.bot.login(process.env.TOKEN)
      this.logger.log('Bot is online!')
    } catch (error) {
      this.logger.error('Error during bot startup:', error)
    }
  }

  async registerCommands() {
    const builders: (SlashCommandBuilder | ContextMenuCommandBuilder)[] = []

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
      const commandMap = getCommandMap(controller)

      let commandMetadata: CommandMetadata | undefined = undefined
      let commandIdentifier: string | undefined = undefined

      if (interaction.isChatInputCommand()) {
        commandIdentifier = interaction.commandName
        commandMetadata = commandMap[commandIdentifier]
      } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
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
            (type === CommandType.CONTEXT_MENU && interaction.isContextMenuCommand())
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

            await controller[methodName](interaction, dynamicParams)
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

  private async handleMessage(message: Message<boolean>) {
    if (message.author.bot || !message.content?.trim()) return

    for (const controller of this.controllers) {
      const commandMap = getCommandMap(controller)

      // Handle specific message commands
      if (commandMap) {
        const commandMetadata = commandMap[message.content.toLowerCase()]
        if (commandMetadata && commandMetadata.type === CommandType.MESSAGE) {
          try {
            const { methodName } = commandMetadata
            this.logger.log('[MESSAGE]', `[${methodName}]`, `Executing message command: ${message.content}`)
            await controller[methodName](message)
          } catch (error) {
            this.logger.error(`Error executing message command "${message.content}":`, error)
            await message.reply('An error occurred while processing your command.')
          }
        }
      }

      // Handle general message handlers
      const messageHandlers = getMessageHandlers(controller)
      if (messageHandlers) {
        for (const handlerMethod of messageHandlers) {
          try {
            await controller[handlerMethod](message)
          } catch (error) {
            this.logger.error(`Error in message handler "${handlerMethod}":`, error)
          }
        }
      }
    }
  }

  private async handleReaction(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
    action: 'add' | 'remove',
  ) {
    await reaction.message.fetch()
    if (!reaction.message.content?.trim()) return

    for (const controller of this.controllers) {
      const container = Reflect.getMetadata('inversify:container', controller.constructor)
      const controllerInstance = container.resolve(controller.constructor)

      const reactionHandlers = getReactionHandlers(controller)

      for (const handler of reactionHandlers) {
        const { emoji, method } = handler

        if (!emoji || emoji === reaction.emoji.name) {
          try {
            this.logger.log(`[REACTION]`, `[${action}]`, `Emoji: ${reaction.emoji.name}, User: ${user.tag}`)
            await controllerInstance[method](reaction, user, action)
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
