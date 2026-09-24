import 'reflect-metadata'
import { type ClientEvents, type RESTPostAPIApplicationCommandsJSONBody } from 'discord.js'
import { type MetadataDecorator } from '@src/common/metadata.js'
import { HandlerExecutionContext } from '@src/common/execution-context.js'
import {
  getAutocompleteHandlers,
  getCommandMap,
  getMessageHandlers,
  getReactionHandlers,
} from '@src/decorator/controller.decorator.js'
import { getEventHandlers } from '@src/decorator/event.decorator.js'
import { CommandType } from '@src/enum/index.js'

type HandlerClass = new (...args: any[]) => unknown

/** What a {@link HandlerEntry} handles. */
export type HandlerKind = 'command' | 'component' | 'modal' | 'autocomplete' | 'message' | 'reaction' | 'event'

interface HandlerEntryBase {
  /** The controller or service declaring the handler. */
  controller: HandlerClass
  /** The name of the handler method. */
  method: string
  /**
   * Reads a metadata value for the handler: the method's value, else the controller's, as
   * `ExecutionContext.get` does.
   */
  get<T>(metadata: MetadataDecorator<T>): T | undefined
  get<T = unknown>(key: string | symbol): T | undefined
  /** Reads every declared value for the handler, method first, then controller. */
  getAll<T>(metadata: MetadataDecorator<T>): T[]
  getAll<T = unknown>(key: string | symbol): T[]
}

/** A slash command, subcommand, context menu command or entry point command. */
export interface CommandHandlerEntry extends HandlerEntryBase {
  kind: 'command'
  commandType: CommandType
  /** The command's name, or a subcommand's full path such as `settings notify email`. */
  name: string
  /** The registered command's JSON, the top-level command's for a subcommand. */
  command?: RESTPostAPIApplicationCommandsJSONBody
  /** The command's description, a subcommand's own for a subcommand; `undefined` for a context menu command. */
  description?: string
}

/** A button or select menu handler. */
export interface ComponentHandlerEntry extends HandlerEntryBase {
  kind: 'component'
  commandType: CommandType
  /** The customId pattern, such as `profile/{uid}`. */
  name: string
}

/** A modal submit handler. */
export interface ModalHandlerEntry extends HandlerEntryBase {
  kind: 'modal'
  commandType: CommandType.MODAL_SUBMIT
  /** The customId pattern. */
  name: string
}

/** An `@Autocomplete` handler. */
export interface AutocompleteHandlerEntry extends HandlerEntryBase {
  kind: 'autocomplete'
  /** The command path, followed by the option name when the handler completes one option only. */
  name: string
}

/** A `@MessageHandler`. */
export interface MessageHandlerEntry extends HandlerEntryBase {
  kind: 'message'
  /** The keyword, or `undefined` for a handler that takes every message. */
  name: string | undefined
}

/** A `@ReactionHandler`. */
export interface ReactionHandlerEntry extends HandlerEntryBase {
  kind: 'reaction'
  /** The emoji, or `undefined` for a handler that takes every reaction. */
  name: string | undefined
}

/** An `@On` or `@Once` handler. */
export interface EventHandlerEntry extends HandlerEntryBase {
  kind: 'event'
  /** The client event. */
  name: keyof ClientEvents
  /** Whether it handles only the first time the event is emitted. */
  once: boolean
}

/** One registered handler, narrowed by its `kind`. */
export type HandlerEntry =
  | CommandHandlerEntry
  | ComponentHandlerEntry
  | ModalHandlerEntry
  | AutocompleteHandlerEntry
  | MessageHandlerEntry
  | ReactionHandlerEntry
  | EventHandlerEntry

/** Narrows {@link HandlerRegistry.list}. */
export interface HandlerFilter<K extends HandlerKind = HandlerKind> {
  /** Only handlers of this kind. */
  kind?: K
  /** Only handlers declared by this controller or service. */
  controller?: HandlerClass
}

const COMMAND_TYPES = new Set<CommandType>([CommandType.SLASH, CommandType.CONTEXT_MENU, CommandType.PRIMARY_ENTRY_POINT])

/** A builder's JSON, or `undefined` for none, or for a builder missing a field, which registration reports. */
function builderJson(builder: unknown): RESTPostAPIApplicationCommandsJSONBody | undefined {
  const toJSON = (builder as { toJSON?: () => RESTPostAPIApplicationCommandsJSONBody } | undefined)?.toJSON
  if (typeof toJSON !== 'function') return undefined
  try {
    return toJSON.call(builder)
  } catch {
    return undefined
  }
}

/** The description of the command or subcommand at `path` within a command's JSON. */
function describe(json: RESTPostAPIApplicationCommandsJSONBody | undefined, path: string): string | undefined {
  interface Described {
    name?: string
    description?: string
    options?: Described[]
  }
  let node = json as Described | undefined
  for (const segment of path.split(' ').slice(1)) {
    node = node?.options?.find(option => option.name === segment)
  }
  return node?.description
}

/**
 * Every handler the app registered, with the metadata declared on it: for a `/help` command, an admin
 * page or generated docs.
 *
 * Inject it into a service or controller. It lists commands (one entry per subcommand path),
 * components, modals, autocomplete, message, reaction and event handlers, on every controller and
 * service the app binds.
 *
 * @example
 * ```typescript
 * @Service()
 * export class HelpService {
 *   constructor(private readonly handlers: HandlerRegistry) {}
 *
 *   commands() {
 *     return this.handlers
 *       .list({ kind: 'command' })
 *       .map(h => ({ path: h.name, description: h.description, category: h.get(Category) ?? 'Other' }))
 *   }
 * }
 * ```
 */
export class HandlerRegistry {
  private entries?: HandlerEntry[]

  /**
   * @param classes - The controllers and services to read handlers from. The factory fills the list
   *   once the app is bound; entries are read on the first {@link list}.
   */
  constructor(private readonly classes: readonly HandlerClass[]) {}

  /**
   * Lists the registered handlers.
   *
   * @param filter - Narrows the list by kind, controller, or both.
   * @returns The handlers, in the order their controllers and services were bound.
   */
  list<K extends HandlerKind = HandlerKind>(filter: HandlerFilter<K> = {}): Extract<HandlerEntry, { kind: K }>[] {
    this.entries ??= this.collect()
    return this.entries.filter(
      entry =>
        (filter.kind === undefined || entry.kind === filter.kind) &&
        (filter.controller === undefined || entry.controller === filter.controller),
    ) as Extract<HandlerEntry, { kind: K }>[]
  }

  private collect(): HandlerEntry[] {
    const commandJson = new Map<string, RESTPostAPIApplicationCommandsJSONBody>()
    for (const cls of this.classes) {
      for (const metas of Object.values(getCommandMap(cls.prototype) ?? {})) {
        for (const { builder } of metas) {
          const json = builderJson(builder)
          if (json && !commandJson.has(json.name)) commandJson.set(json.name, json)
        }
      }
    }

    const entries: HandlerEntry[] = []
    for (const controller of this.classes) {
      const prototype = controller.prototype as object
      const base = (method: string) => {
        const context = new HandlerExecutionContext({ controller, methodName: method, args: [] })
        return {
          controller,
          method,
          get: context.get.bind(context),
          getAll: context.getAll.bind(context),
        } as HandlerEntryBase
      }

      for (const [name, metas] of Object.entries(getCommandMap(prototype) ?? {})) {
        for (const { methodName, type, builder } of metas) {
          if (COMMAND_TYPES.has(type)) {
            const command = builderJson(builder) ?? commandJson.get(name.split(' ')[0])
            const description = describe(command, name)
            entries.push({ ...base(methodName), kind: 'command', commandType: type, name, command, description })
          } else if (type === CommandType.MODAL_SUBMIT) {
            entries.push({ ...base(methodName), kind: 'modal', commandType: type, name })
          } else {
            entries.push({ ...base(methodName), kind: 'component', commandType: type, name })
          }
        }
      }
      for (const { commandPath, optionName, methodName } of getAutocompleteHandlers(prototype)) {
        const name = optionName === undefined ? commandPath : `${commandPath} ${optionName}`
        entries.push({ ...base(methodName), kind: 'autocomplete', name })
      }
      for (const { keyword, method } of getMessageHandlers(prototype)) {
        entries.push({ ...base(method), kind: 'message', name: keyword })
      }
      for (const { emoji, method } of getReactionHandlers(prototype)) {
        entries.push({ ...base(method), kind: 'reaction', name: emoji })
      }
      for (const { event, method, once } of getEventHandlers(prototype)) {
        entries.push({ ...base(method), kind: 'event', name: event, once })
      }
    }
    return entries
  }
}
