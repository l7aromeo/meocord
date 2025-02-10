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

import { injectable } from 'inversify'
import 'reflect-metadata'
import { mainContainer } from '@src/decorator'
import {
  BaseInteraction,
  Message,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
  MessageReaction,
  PartialMessageReaction,
  PartialMessage,
} from 'discord.js'
import { CommandType } from '@src/enum'
import { ReactionHandlerOptions } from '@src/interface'

const COMMAND_METADATA_KEY = Symbol('commands')
const MESSAGE_HANDLER_METADATA_KEY = Symbol('message_handlers')
const REACTION_HANDLER_METADATA_KEY = Symbol('reaction_handlers')

/**
 * Decorator to register message handlers in the controller.
 *
 * @param keyword - An optional keyword to filter messages this handler should respond to.
 *
 * @example
 * ```typescript
 * @MessageHandler('hello')
 * async handleHelloMessage(message: Message) {
 *   await message.reply('Hello! How can I help you?');
 * }
 *
 * @MessageHandler()
 * async handleAnyMessage(message: Message) {
 *   console.log(`Received a message: ${message.content}`);
 * }
 * ```
 */
export function MessageHandler<T extends Message | PartialMessage, R extends void | Promise<void>>(keyword?: string) {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<(message: T) => R>,
  ) {
    const handlers = Reflect.getMetadata(MESSAGE_HANDLER_METADATA_KEY, target) || []
    handlers.push({ keyword, method: propertyKey.toString() })
    Reflect.defineMetadata(MESSAGE_HANDLER_METADATA_KEY, handlers, target)
  }
}

/**
 * Decorator to register reaction handlers in the controller.
 *
 * @param emoji - Optional emoji name to filter reactions this handler should respond to.
 *
 * @example
 * ```typescript
 * @ReactionHandler('👍')
 * async handleThumbsUpReaction(reaction: MessageReaction, { user }: ReactionHandlerOptions) {
 *   console.log(`User ${user.username} reacted with 👍`);
 * }
 *
 * @ReactionHandler()
 * async handleAnyReaction(reaction: MessageReaction, { user }: ReactionHandlerOptions) {
 *   console.log(`User ${user.username} reacted with ${reaction.emoji.name}`);
 * }
 * ```
 */
export function ReactionHandler<T extends MessageReaction | PartialMessageReaction, R extends void | Promise<void>>(
  emoji?: string,
) {
  return function (
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<(reaction: T, options?: ReactionHandlerOptions) => R>,
  ) {
    const handlers = Reflect.getMetadata(REACTION_HANDLER_METADATA_KEY, target) || []
    handlers.push({ emoji, method: propertyKey.toString() })
    Reflect.defineMetadata(REACTION_HANDLER_METADATA_KEY, handlers, target)
  }
}

/**
 * Retrieves reaction handlers metadata from a given controller.
 *
 * @param controller - The controller class instance.
 * @returns An array of reaction handler metadata objects.
 */
export function getReactionHandlers(controller: any): { emoji: string | undefined; method: string }[] {
  return Reflect.getMetadata(REACTION_HANDLER_METADATA_KEY, controller) || []
}

/**
 * Retrieves message handlers metadata from a given controller.
 *
 * @param controller - The controller class instance.
 * @returns An array of message handler method names.
 */
export function getMessageHandlers(controller: any): { keyword: string | undefined; method: string }[] {
  return Reflect.getMetadata(MESSAGE_HANDLER_METADATA_KEY, controller) || []
}

/**
 * Base interface for a command builder.
 */
export interface CommandBuilderBase {
  /**
   * Builds the command structure using the specified command name.
   *
   * @param commandName - The name of the command.
   * @returns A SlashCommandBuilder or ContextMenuCommandBuilder instance.
   */
  build: (commandName: string) => SlashCommandBuilder | ContextMenuCommandBuilder
}

/**
 * Command metadata describing a registered command method.
 */
export interface CommandMetadata {
  methodName: string
  builder: SlashCommandBuilder | ContextMenuCommandBuilder | undefined
  type: CommandType
  regex?: RegExp
  dynamicParams?: string[]
}

/**
 * Helper function to create regex and parameter mappings from a pattern string.
 *
 * @param pattern - The pattern string to parse.
 * @returns An object containing the generated regex and parameter names.
 */
function createRegexFromPattern(pattern: string): { regex: RegExp; params: string[] } {
  const params: string[] = []

  // Escape special characters outside placeholders
  const escapedPattern = pattern.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')

  // Replace placeholders with strict named capturing groups
  const regexPattern = escapedPattern.replace(/\\{(\w+)\\}/g, (_, param) => {
    if (!/^\w+$/.test(param)) {
      throw new Error(`Invalid parameter name: ${param}. Parameter names must be alphanumeric.`)
    }
    params.push(param)
    return `(?<${param}>\\d+)` // Adjusted to match digits only for IDs
  })

  // Create the final regex
  const regex = new RegExp(`^${regexPattern}$`)
  return { regex, params }
}

/**
 * Decorator to register command methods in a controller.
 *
 * @param commandName - The name or pattern of the command.
 * @param builderOrType - A command builder class or a command type from `CommandType`.
 *
 * @example
 * ```typescript
 * @Command('help', CommandType.SLASH)
 * public async handleHelp(interaction: ChatInputCommandInteraction) {
 *   await interaction.reply('This is the help command!')
 * }
 *
 * @Command('stats-{id}', CommandType.MESSAGE)
 * public async handleStats(message: Message, params: { id: string }) {
 *   const statsId = params.id;
 *   await message.reply(`Fetching stats for ID: ${statsId}`);
 * }
 * ```
 */
export function Command(commandName: string, builderOrType: (new () => CommandBuilderBase) | CommandType) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value
    descriptor.value = function (...args: any[]) {
      const interactionOrMessage = args[0]
      if (!(interactionOrMessage instanceof BaseInteraction || interactionOrMessage instanceof Message)) {
        throw new Error(`The first argument of ${propertyKey} must be an instance of BaseInteraction or Message.`)
      }
      return originalMethod.apply(this, args)
    }

    const commands: Record<string, CommandMetadata> = Reflect.getMetadata(COMMAND_METADATA_KEY, target) || {}

    let builderInstance: SlashCommandBuilder | ContextMenuCommandBuilder | undefined
    let commandType: CommandType
    let regex: RegExp | undefined
    let dynamicParams: string[] | undefined

    if (typeof builderOrType === 'function') {
      const builderObj = new builderOrType() as CommandBuilderBase
      builderInstance = builderObj.build(commandName)
      commandType = Reflect.getMetadata('commandType', builderOrType) as CommandType
      if (!(commandType in CommandType)) {
        throw new Error(`Metadata for 'commandType' is missing on builder ${builderOrType.name}`)
      }
    } else {
      commandType = builderOrType
    }

    if (commandType !== CommandType.SLASH) {
      const { regex: generatedRegex, params } = createRegexFromPattern(commandName)
      regex = generatedRegex
      dynamicParams = params
    }

    commands[commandName] = {
      methodName: propertyKey,
      builder: builderInstance,
      type: commandType,
      regex,
      dynamicParams,
    }

    Reflect.defineMetadata(COMMAND_METADATA_KEY, commands, target)
  }
}

/**
 * Retrieves the command map for a given controller.
 *
 * @param controller - The controller class instance.
 * @returns A record containing command metadata indexed by command names.
 */
export function getCommandMap(controller: any): Record<string, CommandMetadata> {
  return Reflect.getMetadata(COMMAND_METADATA_KEY, controller)
}

/**
 * Decorator to mark a class as a controller that can later be registered to the App class `(app.ts)` using the `@MeoCord` decorator.
 *
 * @example
 * ```typescript
 * @Controller()
 * export class PingSlashController {
 *   constructor(private pingService: PingService) {}
 *
 *   @Command('ping', PingCommandBuilder)
 *   async ping(interaction: ChatInputCommandInteraction) {
 *     const response = await this.pingService.handlePing()
 *     await interaction.reply(response)
 *   }
 * }
 * ```
 */
export function Controller() {
  return function (target: any) {
    if (!Reflect.hasMetadata('inversify:injectable', target)) {
      injectable()(target)
    }

    const injectables = Reflect.getMetadata('design:paramtypes', target) || []
    injectables.map((dep: any) => {
      if (!mainContainer.isBound(dep)) {
        if (!Reflect.hasMetadata('inversify:injectable', dep)) {
          injectable()(dep)
        }

        mainContainer.bind(dep).toSelf().inSingletonScope()
      }
    })

    Reflect.defineMetadata('inversify:container', mainContainer, target)
  }
}
