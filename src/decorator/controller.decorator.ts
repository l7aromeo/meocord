import { injectable } from 'inversify'
import 'reflect-metadata'
import { mainContainer } from '@src/decorator'
import { BaseInteraction, Message, ContextMenuCommandBuilder, SlashCommandBuilder } from 'discord.js'
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

import { CommandType } from '@src/enum'

const COMMAND_METADATA_KEY = Symbol('commands')
const MESSAGE_HANDLER_METADATA_KEY = Symbol('message_handlers')
const REACTION_HANDLER_METADATA_KEY = Symbol('reaction_handlers')

export function MessageHandler() {
  return function (target: any, propertyKey: string) {
    const handlers: string[] = Reflect.getMetadata(MESSAGE_HANDLER_METADATA_KEY, target) || []
    handlers.push(propertyKey)
    Reflect.defineMetadata(MESSAGE_HANDLER_METADATA_KEY, handlers, target)
  }
}

export function ReactionHandler(emoji?: string) {
  return function (target: any, propertyKey: string) {
    const handlers: { emoji: string | undefined; method: string }[] =
      Reflect.getMetadata(REACTION_HANDLER_METADATA_KEY, target) || []
    handlers.push({ emoji, method: propertyKey })
    Reflect.defineMetadata(REACTION_HANDLER_METADATA_KEY, handlers, target)
  }
}

export function getReactionHandlers(controller: any): { emoji: string | undefined; method: string }[] {
  return Reflect.getMetadata(REACTION_HANDLER_METADATA_KEY, controller) || []
}

export function getMessageHandlers(controller: any): string[] {
  return Reflect.getMetadata(MESSAGE_HANDLER_METADATA_KEY, controller) || []
}

export interface CommandBuilderBase {
  build: (commandName: string) => SlashCommandBuilder | ContextMenuCommandBuilder
}

export interface CommandMetadata {
  methodName: string
  builder: SlashCommandBuilder | ContextMenuCommandBuilder | undefined
  type: CommandType
  regex?: RegExp
  dynamicParams?: string[]
}

// Helper function to create a regex from a pattern
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

// Decorator to register command methods
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

// Retrieve the command map from the class
export function getCommandMap(controller: any): Record<string, CommandMetadata> {
  return Reflect.getMetadata(COMMAND_METADATA_KEY, controller)
}

export function Controller() {
  return function (target: any) {
    // Check if the class is already injectable; if not, make it injectable dynamically
    if (!Reflect.hasMetadata('inversify:injectable', target)) {
      injectable()(target)
    }

    const injectables = Reflect.getMetadata('design:paramtypes', target) || []
    injectables.map((dep: any) => {
      if (!mainContainer.isBound(dep)) {
        // Check if the class is already injectable; if not, make it injectable dynamically
        if (!Reflect.hasMetadata('inversify:injectable', dep)) {
          injectable()(dep)
        }

        mainContainer.bind(dep).toSelf().inSingletonScope()
      }
    })

    Reflect.defineMetadata('inversify:container', mainContainer, target)
  }
}
