/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { injectable } from 'inversify'
import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
  Message,
  MessageReaction,
  ModalSubmitInteraction,
  type OmitPartialGroupDMChannel,
  type PartialMessageReaction,
  SlashCommandBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
  StringSelectMenuInteraction,
} from 'discord.js'
import { CommandType, MetadataKey } from '@src/enum/index.js'
import { type ReactionHandlerOptions } from '@src/interface/index.js'
import {
  type CommandBuilderBase,
  type CommandBuilderConstructor,
  type CommandInteractionType,
  type CommandMetadata,
} from '@src/interface/command-decorator.interface.js'

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
export function MessageHandler<T extends OmitPartialGroupDMChannel<Message<boolean>>, R extends void | Promise<void>>(
  keyword?: string,
) {
  return function (target: object, propertyKey: string, _descriptor: TypedPropertyDescriptor<(message: T) => R>) {
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
    propertyKey: string,
    _descriptor:
      | TypedPropertyDescriptor<(reaction: T, options: ReactionHandlerOptions) => R>
      | TypedPropertyDescriptor<(reaction: T) => R>,
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

const PLACEHOLDER_PATTERN = /\{(\w+)}/g

/** The character a parameter will not cross, so one pattern segment maps to one value. */
export const PARAM_SEPARATOR = '/'

/** Escapes a literal stretch of a pattern so only placeholders stay meaningful. */
const escapeLiteral = (literal: string): string => literal.replace(/[/\\^$*+?.()|[\]{}]/g, '\\$&')

/**
 * Helper function to create regex and parameter mappings from a pattern string.
 *
 * A `{name}` matches anything up to the next `/`, the same rule Express and Rails use
 * for a path segment. That is what lets a value the application does not control — a
 * uuid, an opaque vendor id, a slug — be captured whole without the author annotating
 * anything, since a hyphen inside it is data rather than structure.
 *
 * It also keeps neighbouring patterns apart: `profile/{uuid}` and `profile/{uuid}/{id}`
 * cannot both match one id, because a parameter cannot swallow the separator between
 * them. Patterns separated by `-` instead have no such boundary, so a pair like
 * `profile-{uuid}` and `profile-{uuid}-{id}` is ambiguous — {@link findAmbiguousRoutes}
 * reports those at registration.
 *
 * @param pattern - The pattern string to parse.
 * @returns The regex, the parameter names, and how specific the pattern is.
 */
function createRegexFromPattern(pattern: string): { regex: RegExp; params: string[]; specificity: number } {
  const params: string[] = []
  let regexPattern = ''
  let cursor = 0
  let literalLength = 0

  PLACEHOLDER_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = PLACEHOLDER_PATTERN.exec(pattern)) !== null) {
    const [placeholder, param] = match
    const literal = pattern.slice(cursor, match.index)
    const after = pattern[match.index + placeholder.length]

    // A parameter has to own its segment. Sharing one with a literal leaves no
    // boundary a sibling pattern can be told apart by, and the resulting overlap has
    // no correct reading -- `profile-{uuid}` and `profile-{uuid}-{id}` both take
    // `profile-a-b`. Registration is the last point where that is still fixable.
    if ((literal !== '' && !literal.endsWith(PARAM_SEPARATOR)) || (after !== undefined && after !== PARAM_SEPARATOR)) {
      throw new Error(
        `Invalid pattern "${pattern}": {${param}} must occupy a whole segment, so it has to be ` +
          `preceded and followed by "${PARAM_SEPARATOR}" or by the ends of the pattern. ` +
          `Write "a${PARAM_SEPARATOR}{${param}}" rather than "a-{${param}}".`,
      )
    }

    literalLength += literal.length
    regexPattern += escapeLiteral(literal)
    regexPattern += `(?<${param}>[^${PARAM_SEPARATOR}]+)`
    params.push(param)
    cursor = match.index + placeholder.length
  }

  const trailing = pattern.slice(cursor)
  literalLength += trailing.length
  regexPattern += escapeLiteral(trailing)

  const regex = new RegExp(`^${regexPattern}$`)

  // Literal text is the signal: a pattern spelling out more of the id describes it
  // more exactly than one leaving it to a parameter. Fewer parameters breaks a tie
  // between equal-length patterns, so the ranking is total and never falls back to
  // declaration order.
  const specificity = literalLength * 1_000 - params.length
  return { regex, params, specificity }
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
 * @Command('stats-{id}', CommandType.BUTTON)
 * public async handleStats(message: ButtonInteraction, { id }) {
 *   await message.reply(`Fetching stats for ID: ${id}`);
 * }
 * ```
 */
export function Command<
  CBC extends CommandType.SLASH | CommandType.CONTEXT_MENU,
  T extends CommandBuilderConstructor<CBC> | CommandType,
>(commandName: string, builderOrType: T) {
  return function <P extends Record<string, any>, R extends Promise<void> | void>(
    target: object,
    propertyKey: string,
    _descriptor:
      | TypedPropertyDescriptor<(interaction: CommandInteractionType<CBC, T>, params: P) => R>
      | TypedPropertyDescriptor<(interaction: CommandInteractionType<CBC, T>) => R>,
  ) {
    const originalMethod = _descriptor.value
    if (!originalMethod) {
      throw new Error(`Missing implementation for method ${propertyKey}`)
    }

    // Wrap original method for interaction type validation
    _descriptor.value = function (interaction, params) {
      const expectedInteraction =
        (commandType === CommandType.BUTTON && interaction instanceof ButtonInteraction) ||
        (commandType === CommandType.SELECT_MENU && interaction instanceof StringSelectMenuInteraction) ||
        (commandType === CommandType.SLASH && interaction instanceof ChatInputCommandInteraction) ||
        (commandType === CommandType.CONTEXT_MENU && interaction instanceof ContextMenuCommandInteraction) ||
        (commandType === CommandType.MODAL_SUBMIT && interaction instanceof ModalSubmitInteraction)

      if (!expectedInteraction) {
        throw new Error(`Invalid interaction type passed to @Command for method: ${propertyKey}`)
      }

      return originalMethod.apply(this, [interaction, params])
    }

    // Retrieve existing metadata or initialize it
    const commands: Record<string, CommandMetadata[]> = Reflect.getMetadata(COMMAND_METADATA_KEY, target) || {}

    let builderInstance:
      SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder | ContextMenuCommandBuilder | undefined
    let commandType: CommandType
    let regex: RegExp | undefined
    let dynamicParams: string[] = []
    let specificity: number | undefined

    // Determine command type and builder
    if (typeof builderOrType === 'function') {
      const builderObj = new builderOrType() as CommandBuilderBase
      builderInstance = builderObj.build(commandName)
      commandType = Reflect.getMetadata(MetadataKey.CommandType, builderOrType) as CommandType
      if (!(commandType in CommandType)) {
        throw new Error(`Metadata for 'commandType' is missing on builder ${builderOrType.name}`)
      }
    } else {
      commandType = builderOrType
    }

    if (commandType !== CommandType.SLASH && commandType !== CommandType.CONTEXT_MENU) {
      const { regex: generatedRegex, params, specificity: patternSpecificity } = createRegexFromPattern(commandName)
      regex = generatedRegex
      dynamicParams = params
      specificity = patternSpecificity
    }

    // Ensure commandName supports multiple entries
    if (!commands[commandName]) {
      commands[commandName] = []
    }

    commands[commandName].push({
      methodName: propertyKey,
      builder: builderInstance,
      type: commandType,
      regex,
      dynamicParams,
      specificity,
    })

    Reflect.defineMetadata(COMMAND_METADATA_KEY, commands, target)
  }
}

/**
 * Retrieves the command map for a given controller.
 *
 * @param controller - The controller class instance.
 * @returns A record containing command metadata indexed by command names.
 */
export function getCommandMap<T extends string>(controller: any): Record<string, CommandMetadata<T>[]> {
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
    if (!Reflect.hasMetadata(MetadataKey.Injectable, target)) {
      injectable()(target)
    }
  }
}

/**
 * Finds pattern pairs that can both match one customId.
 *
 * Patterns of different segment counts are disjoint, because a parameter cannot cross
 * `/`. Within the same count, two patterns overlap unless some position holds literals
 * that differ: `a/{x}/c` and `a/b/{y}` both take `a/b/c`, and neither is more literal
 * than the other, so ranking cannot settle it either.
 *
 * @param patterns - The registered patterns.
 * @returns Each ambiguous pair, once, in the order the patterns were given.
 */
export function findAmbiguousRoutes(patterns: string[]): [string, string][] {
  const isParam = (segment: string): boolean => PLACEHOLDER_PATTERN.test(segment)
  const segmentsOf = (pattern: string): string[] => pattern.split(PARAM_SEPARATOR)
  const collisions: [string, string][] = []

  for (let i = 0; i < patterns.length; i++) {
    for (let j = i + 1; j < patterns.length; j++) {
      const left = segmentsOf(patterns[i])
      const right = segmentsOf(patterns[j])
      if (left.length !== right.length) continue

      const disjoint = left.some((segment, index) => {
        PLACEHOLDER_PATTERN.lastIndex = 0
        const leftIsParam = isParam(segment)
        PLACEHOLDER_PATTERN.lastIndex = 0
        const rightIsParam = isParam(right[index])
        return !leftIsParam && !rightIsParam && segment !== right[index]
      })

      if (!disjoint) collisions.push([patterns[i], patterns[j]])
    }
  }

  return collisions
}
