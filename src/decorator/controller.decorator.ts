import 'reflect-metadata'
import {
  type AutocompleteInteraction,
  Message,
  MessageReaction,
  type OmitPartialGroupDMChannel,
  type PartialMessageReaction,
} from 'discord.js'
import { CommandType, MetadataKey } from '@src/enum/index.js'
import { type ReactionHandlerOptions } from '@src/interface/index.js'
import {
  type AutocompleteMetadata,
  type BuildableCommandType,
  type CommandBuilderBase,
  type CommandBuilderConstructor,
  type CommandInteractionType,
  type CommandMetadata,
} from '@src/interface/command-decorator.interface.js'
import { isCustomIdRouted, matchesCommandType } from '@src/util/interaction.util.js'
import { makeInjectable } from '@src/util/injectable.util.js'
import { BUILDER_GUILDS } from '@src/decorator/command-builder.decorator.js'

const COMMAND_METADATA_KEY = Symbol('commands')
const MESSAGE_HANDLER_METADATA_KEY = Symbol('message_handlers')
const REACTION_HANDLER_METADATA_KEY = Symbol('reaction_handlers')
const AUTOCOMPLETE_METADATA_KEY = Symbol('autocomplete_handlers')

/**
 * The class's own handler list, started from a copy of the inherited one, so a subclass's
 * handlers never land in its base class's metadata.
 */
function ownHandlerList<T>(key: symbol, target: object): T[] {
  return Reflect.getOwnMetadata(key, target) ?? [...(Reflect.getMetadata(key, target) ?? [])]
}

/** The class's own command map, started from a copy of the inherited one, for the same reason. */
function ownCommandMap(target: object): Record<string, CommandMetadata[]> {
  const own: Record<string, CommandMetadata[]> | undefined = Reflect.getOwnMetadata(COMMAND_METADATA_KEY, target)
  if (own) return own

  const inherited: Record<string, CommandMetadata[]> = Reflect.getMetadata(COMMAND_METADATA_KEY, target) ?? {}
  return Object.fromEntries(Object.entries(inherited).map(([name, metas]) => [name, [...metas]]))
}

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
    const handlers = ownHandlerList(MESSAGE_HANDLER_METADATA_KEY, target)
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
    const handlers = ownHandlerList(REACTION_HANDLER_METADATA_KEY, target)
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
 * Compiles a pattern into a regex, its parameter names and its specificity. A `{name}` matches up to
 * the next `/`, so a uuid is captured whole and `profile/{uuid}` never overlaps `profile/{uuid}/{id}`;
 * `-`-separated patterns can, which {@link findAmbiguousRoutes} reports at registration.
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
 * @param commandName - What the command is addressed by. Commands registered with
 *   Discord use their name, and a subcommand its full path — `settings notify email`,
 *   parts separated by a space, the way Discord displays it. Components use a customId
 *   pattern, where `{name}` captures one `/`-separated segment.
 * @param builderOrType - A command builder class, or a `CommandType` for a handler that
 *   registers nothing of its own: every component, and every subcommand of a command
 *   whose builder already describes it.
 *
 * @example
 * ```typescript
 * @Command('help', CommandType.SLASH)
 * public async handleHelp(interaction: ChatInputCommandInteraction) {
 *   await interaction.reply('This is the help command!')
 * }
 *
 * @Command('settings notify email', CommandType.SLASH)
 * public async handleNotifyEmail(interaction: ChatInputCommandInteraction, { enabled }) {
 *   await interaction.reply(`Email notifications ${enabled ? 'on' : 'off'}`)
 * }
 *
 * @Command('stats/{id}', CommandType.BUTTON)
 * public async handleStats(interaction: ButtonInteraction, { id }) {
 *   await interaction.reply(`Fetching stats for ID: ${id}`);
 * }
 *
 * @Command('assign/{taskId}', CommandType.USER_SELECT_MENU)
 * public async handleAssign(interaction: UserSelectMenuInteraction, { taskId }) {
 *   await interaction.reply(`Assigned ${interaction.users.size} user(s) to ${taskId}`)
 * }
 * ```
 */
export function Command<CBC extends BuildableCommandType, T extends CommandBuilderConstructor<CBC> | CommandType>(
  commandName: string,
  builderOrType: T,
) {
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
      if (!matchesCommandType(commandType, interaction)) {
        throw new Error(`Invalid interaction type passed to @Command for method: ${propertyKey}`)
      }

      return originalMethod.apply(this, [interaction, params])
    }

    // This class's own map, inherited routes included
    const commands = ownCommandMap(target)

    let builderInstance: CommandMetadata['builder']
    let commandType: CommandType
    let regex: RegExp | undefined
    let dynamicParams: string[] = []
    let specificity: number | undefined
    let guilds: (string | undefined)[] | undefined

    // Determine command type and builder
    if (typeof builderOrType === 'function') {
      const builderObj = new builderOrType() as CommandBuilderBase
      builderInstance = builderObj.build(commandName)
      guilds = Reflect.getMetadata(BUILDER_GUILDS, builderOrType)
      commandType = Reflect.getMetadata(MetadataKey.CommandType, builderOrType) as CommandType
      if (!(commandType in CommandType)) {
        throw new Error(`Metadata for 'commandType' is missing on builder ${builderOrType.name}`)
      }
    } else {
      commandType = builderOrType
    }

    if (isCustomIdRouted(commandType)) {
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
      ...(guilds && { guilds }),
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
 * Registers an autocomplete handler for an option of a chat input command.
 *
 * Enable it on the option with `setAutocomplete(true)` and answer with `interaction.respond()`.
 *
 * @param commandPath - The command, such as `search` or `settings notify email` for a subcommand.
 * @param optionName - The option to complete. Omit to handle every option, branching on
 *   `interaction.options.getFocused(true)`.
 *
 * @example
 * ```typescript
 * @Autocomplete('search', 'query')
 * async completeQuery(interaction: AutocompleteInteraction) {
 *   const { value } = interaction.options.getFocused(true)
 *   await interaction.respond(this.search(value).map(name => ({ name, value: name })))
 * }
 * ```
 */
export function Autocomplete<R extends void | Promise<void>>(commandPath: string, optionName?: string) {
  return function <P extends Record<string, any>>(
    target: object,
    propertyKey: string,
    _descriptor:
      | TypedPropertyDescriptor<(interaction: AutocompleteInteraction, params: P) => R>
      | TypedPropertyDescriptor<(interaction: AutocompleteInteraction) => R>,
  ) {
    const handlers = ownHandlerList<AutocompleteMetadata>(AUTOCOMPLETE_METADATA_KEY, target)
    handlers.push({ commandPath, optionName, methodName: propertyKey.toString() })
    Reflect.defineMetadata(AUTOCOMPLETE_METADATA_KEY, handlers, target)
  }
}

/**
 * Returns a controller's autocomplete handlers, option-specific ones first.
 * @param controller - The controller instance.
 */
export function getAutocompleteHandlers(controller: any): AutocompleteMetadata[] {
  const handlers: AutocompleteMetadata[] = Reflect.getMetadata(AUTOCOMPLETE_METADATA_KEY, controller) || []
  return [...handlers].sort((a, b) => Number(Boolean(b.optionName)) - Number(Boolean(a.optionName)))
}

/**
 * Marks a class as a controller, to be listed in `@MeoCord({ controllers })`.
 *
 * @example
 * ```typescript
 * @Controller()
 * export class PingSlashController {
 *   constructor(private pingService: PingService) {}
 *
 *   @Command('ping', PingCommandBuilder)
 *   async ping(interaction: ChatInputCommandInteraction) {
 *     await interaction.reply(await this.pingService.handlePing())
 *   }
 * }
 * ```
 */
export function Controller() {
  return function (target: any) {
    makeInjectable(target)
  }
}

/**
 * Finds pairs of customId patterns that can both match one id, such as `a/{x}/c` and `a/b/{y}`.
 * @returns Each ambiguous pair once, in the order the patterns were given.
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
