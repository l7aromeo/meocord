/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { jest } from '@jest/globals'
import { ApplicationCommandType, CommandInteractionOptionResolver, ComponentType, InteractionType } from 'discord.js'

// ---------------------------------------------------------------------------
// DeepMocked<T>
// ---------------------------------------------------------------------------

/**
 * Recursively transforms all methods of T into jest.MockedFunction and all
 * nested objects into DeepMocked. Depth cap at 5 prevents infinite recursion
 * on circular discord.js types (e.g. Guild ↔ GuildMember).
 * -readonly removes readonly modifiers so test setup can write any property.
 */
export type DeepMocked<T, Depth extends number[] = []> = Depth['length'] extends 5
  ? T
  : {
      -readonly [K in keyof T]: T[K] extends (...args: infer A) => infer R
        ? jest.MockedFunction<(...args: A) => R>
        : T[K] extends object
          ? DeepMocked<T[K], [...Depth, 0]>
          : T[K]
    }

// ---------------------------------------------------------------------------
// stubDeep — Proxy that auto-creates jest.fn() on any property access
// ---------------------------------------------------------------------------

const SKIP = new Set(['constructor', 'toString', 'valueOf', 'toJSON', 'then'])

type StubValue = jest.Mock | object

function stubDeep(instance: object, externalStubs?: Map<string, StubValue>): object {
  const stubs = externalStubs ?? new Map<string, StubValue>()

  return new Proxy(instance, {
    get(target, prop) {
      // Always pass through symbols
      if (typeof prop === 'symbol') {
        return Reflect.get(target, prop, target)
      }

      const key = prop as string

      // 'then' must be undefined — prevents jest treating the mock as a Promise
      if (key === 'then') return undefined

      // Own property writes take precedence (e.g. interaction.guildId = 'abc')
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        return Reflect.get(target, prop, target)
      }

      // Skip passthrough props — return prototype value as-is
      if (SKIP.has(key)) {
        return Reflect.get(target, prop, target)
      }

      // Return cached stub
      if (stubs.has(key)) return stubs.get(key)

      // Walk the prototype chain to check if it's a function
      let proto: object | null = Object.getPrototypeOf(target)
      let protoValue: unknown
      while (proto !== null) {
        const desc = Object.getOwnPropertyDescriptor(proto, key)
        if (desc !== undefined) {
          protoValue = desc.value
          break
        }
        proto = Object.getPrototypeOf(proto)
      }

      const stub: StubValue = typeof protoValue === 'function' ? jest.fn() : stubDeep({}, stubs)
      stubs.set(key, stub)
      return stub
    },

    set(target, prop, value) {
      Reflect.set(target, prop, value, target)
      return true
    },
  })
}

// ---------------------------------------------------------------------------
// Class type fields — sets this.type / commandType / componentType on the
// instance so all prototype type-guard methods run with real logic
// ---------------------------------------------------------------------------

const CLASS_TYPE_FIELDS: Record<string, { type?: number; commandType?: number; componentType?: number }> = {
  ChatInputCommandInteraction: {
    type: InteractionType.ApplicationCommand,
    commandType: ApplicationCommandType.ChatInput,
  },
  ContextMenuCommandInteraction: { type: InteractionType.ApplicationCommand, commandType: ApplicationCommandType.User },
  UserContextMenuCommandInteraction: {
    type: InteractionType.ApplicationCommand,
    commandType: ApplicationCommandType.User,
  },
  MessageContextMenuCommandInteraction: {
    type: InteractionType.ApplicationCommand,
    commandType: ApplicationCommandType.Message,
  },
  PrimaryEntryPointCommandInteraction: {
    type: InteractionType.ApplicationCommand,
    commandType: ApplicationCommandType.PrimaryEntryPoint,
  },
  MessageComponentInteraction: { type: InteractionType.MessageComponent },
  ButtonInteraction: { type: InteractionType.MessageComponent, componentType: ComponentType.Button },
  StringSelectMenuInteraction: { type: InteractionType.MessageComponent, componentType: ComponentType.StringSelect },
  UserSelectMenuInteraction: { type: InteractionType.MessageComponent, componentType: ComponentType.UserSelect },
  RoleSelectMenuInteraction: { type: InteractionType.MessageComponent, componentType: ComponentType.RoleSelect },
  MentionableSelectMenuInteraction: {
    type: InteractionType.MessageComponent,
    componentType: ComponentType.MentionableSelect,
  },
  ChannelSelectMenuInteraction: { type: InteractionType.MessageComponent, componentType: ComponentType.ChannelSelect },
  ModalSubmitInteraction: { type: InteractionType.ModalSubmit },
  AutocompleteInteraction: { type: InteractionType.ApplicationCommandAutocomplete },
}

// All known pure type-guard methods on BaseInteraction and its subclasses.
// These are wired as jest.fn() wrapping the real prototype logic so they return
// correct values by default and can still be overridden per test.
const TYPE_GUARD_METHODS = [
  'isCommand',
  'isChatInputCommand',
  'isContextMenuCommand',
  'isUserContextMenuCommand',
  'isMessageContextMenuCommand',
  'isPrimaryEntryPointCommand',
  'isMessageComponent',
  'isButton',
  'isStringSelectMenu',
  'isUserSelectMenu',
  'isRoleSelectMenu',
  'isMentionableSelectMenu',
  'isChannelSelectMenu',
  'isAnySelectMenu',
  'isSelectMenu',
  'isModalSubmit',
  'isAutocomplete',
  'isRepliable',
] as const

interface InteractionClass<T> {
  prototype: T
  name: string
}

function findPrototypeMethod(instance: object, name: string): ((...args: unknown[]) => unknown) | null {
  let proto: object | null = Object.getPrototypeOf(instance)
  while (proto !== null) {
    const desc = Object.getOwnPropertyDescriptor(proto, name)
    if (desc?.value && typeof desc.value === 'function') return desc.value as (...args: unknown[]) => unknown
    proto = Object.getPrototypeOf(proto)
  }
  return null
}

// ---------------------------------------------------------------------------
// createMockInteraction
// ---------------------------------------------------------------------------

/**
 * Creates a smart mock instance of any discord.js class. The prototype chain
 * is preserved so `instanceof` checks at every level pass.
 *
 * **Type guards** (`isButton()`, `isRepliable()`, etc.) run the real discord.js
 * prototype logic — no manual `.mockReturnValue(true)` setup needed. They are
 * still `jest.fn()` so you can override them per test.
 *
 * **Reply state machine** — `replied` and `deferred` start as `false`. Calling
 * `reply()` or `deferReply()` twice throws, just like a real interaction would.
 * `followUp()`, `editReply()`, and `deleteReply()` throw if called before any
 * reply. These are still `jest.fn()` so call assertions work normally.
 *
 * All other methods are auto-stubbed as `jest.fn()` via Proxy.
 *
 * @example
 * ```ts
 * const interaction = createMockInteraction(ButtonInteraction)
 * interaction.guildId = 'guild-123'
 * interaction.isButton()     // → true  (real logic, no setup)
 * interaction.isRepliable()  // → true  (real logic, no setup)
 * interaction.replied        // → false (real state)
 * await interaction.reply({ content: 'hi' })
 * interaction.replied        // → true
 * await interaction.reply({}) // throws — already replied
 * ```
 */
export function createMockInteraction<T extends object>(Class: InteractionClass<T>): DeepMocked<T> {
  const instance = Object.create(Class.prototype) as Record<string, unknown>
  const stubs = new Map<string, jest.Mock>()

  // Set type fields so all prototype type-guard methods compute the right value
  const fields = CLASS_TYPE_FIELDS[Class.name]
  if (fields !== undefined) {
    for (const [key, value] of Object.entries(fields)) {
      instance[key] = value
    }
  }

  // Wire each type guard as jest.fn() calling the real prototype implementation.
  // Correct by default; overridable per test via .mockReturnValue().
  for (const name of TYPE_GUARD_METHODS) {
    const method = findPrototypeMethod(instance, name)
    if (method !== null) {
      stubs.set(
        name,
        jest.fn().mockImplementation(() => method.call(instance)),
      )
    }
  }

  // Set up reply state machine for repliable interactions
  const isRepliableMethod = findPrototypeMethod(instance, 'isRepliable')
  const repliable = isRepliableMethod !== null && (isRepliableMethod.call(instance) as boolean)
  if (repliable) {
    instance.replied = false
    instance.deferred = false
    instance.ephemeral = false

    const alreadyReplied = () => new Error('The reply to this interaction has already been sent or deferred.')
    const notYetReplied = (method: string) => new Error(`Cannot call ${method}() before replying or deferring.`)

    const hasEphemeralFlag = (options?: Record<string, unknown>): boolean => {
      if (!options) return false
      if (options.ephemeral === true) return true
      const { flags } = options
      if (typeof flags === 'number') return (flags & 64) !== 0
      if (typeof flags === 'bigint') return (flags & 64n) !== 0n
      return false
    }

    stubs.set(
      'reply',
      jest.fn(async (...args: unknown[]) => {
        if (instance.deferred || instance.replied) throw alreadyReplied()
        instance.replied = true
        if (hasEphemeralFlag(args[0] as Record<string, unknown> | undefined)) instance.ephemeral = true
      }),
    )
    stubs.set(
      'deferReply',
      jest.fn(async (...args: unknown[]) => {
        if (instance.deferred || instance.replied) throw alreadyReplied()
        instance.deferred = true
        if (hasEphemeralFlag(args[0] as Record<string, unknown> | undefined)) instance.ephemeral = true
      }),
    )
    stubs.set(
      'followUp',
      jest.fn(async () => {
        if (!instance.deferred && !instance.replied) throw notYetReplied('followUp')
        instance.replied = true
      }),
    )
    stubs.set(
      'editReply',
      jest.fn(async () => {
        if (!instance.deferred && !instance.replied) throw notYetReplied('editReply')
        instance.replied = true
      }),
    )
    stubs.set(
      'deleteReply',
      jest.fn(async () => {
        if (!instance.deferred && !instance.replied) throw notYetReplied('deleteReply')
      }),
    )

    // deferUpdate / update — MessageComponentInteraction only (type === MessageComponent)
    if (instance.type === InteractionType.MessageComponent) {
      stubs.set(
        'update',
        jest.fn(async () => {
          if (instance.deferred || instance.replied) throw alreadyReplied()
          instance.replied = true
        }),
      )
      stubs.set(
        'deferUpdate',
        jest.fn(async () => {
          if (instance.deferred || instance.replied) throw alreadyReplied()
          instance.deferred = true
        }),
      )
    }
  }

  return stubDeep(instance, stubs) as DeepMocked<T>
}

// ---------------------------------------------------------------------------
// createChatInputOptions — typed options resolver for ChatInputCommandInteraction
// ---------------------------------------------------------------------------

export interface ChatInputOptions {
  subcommandGroup?: string | null
  subcommand?: string | null
  [name: string]: string | number | boolean | { id: string } | null | undefined
}

/**
 * Builds a typed options resolver from a plain record. Mirrors how the real
 * `CommandInteractionOptionResolver` works: declare what options the command
 * was invoked with, and the resolver finds them by name.
 *
 * All explicit methods are `jest.fn()` — override per test with `.mockReturnValue()`.
 * Methods not listed (e.g. `getAttachment`) are auto-stubbed by the Proxy.
 *
 * @example
 * ```ts
 * const interaction = createMockInteraction(ChatInputCommandInteraction)
 * interaction.options = createChatInputOptions({
 *   subcommandGroup: 'daily',
 *   subcommand: 'notes',
 *   uid: 12345678,
 * })
 * interaction.options.getSubcommand()  // → 'notes'
 * interaction.options.getNumber('uid') // → 12345678
 * ```
 */
export function createChatInputOptions(opts: ChatInputOptions = {}): DeepMocked<CommandInteractionOptionResolver> {
  const { subcommandGroup = null, subcommand = null, ...values } = opts

  function resolveOrThrow<U>(name: string, value: U | null, required?: boolean): U | null {
    if (value === null) {
      if (required === true) throw new Error(`Option "${name}" is required but was not provided.`)
      return null
    }
    return value
  }

  function resolveSubEntry(field: string | null, label: string, required?: boolean): string | null {
    if (field === null) {
      if (required === true) throw new Error(`No ${label} found.`)
      return null
    }
    return field
  }

  const isObjectOption = (v: unknown): v is { id: string } => typeof v === 'object' && v !== null && 'id' in v

  // Use a real prototype instance so unlisted methods (e.g. getAttachment)
  // are found on the prototype chain and auto-stubbed as jest.fn()
  const base = Object.create(CommandInteractionOptionResolver.prototype)

  base.getSubcommandGroup = jest.fn((required?: boolean) =>
    resolveSubEntry(subcommandGroup, 'subcommand group', required),
  )
  base.getSubcommand = jest.fn<(required?: boolean) => string | null>((required?: boolean) =>
    resolveSubEntry(subcommand, 'subcommand', required),
  )
  base.getString = jest.fn<(name: string, required?: boolean) => string | null>((name: string, required?: boolean) =>
    resolveOrThrow(name, typeof values[name] === 'string' ? (values[name] as string) : null, required),
  )
  base.getNumber = jest.fn<(name: string, required?: boolean) => number | null>((name: string, required?: boolean) =>
    resolveOrThrow(name, typeof values[name] === 'number' ? (values[name] as number) : null, required),
  )
  base.getInteger = jest.fn<(name: string, required?: boolean) => number | null>((name: string, required?: boolean) =>
    resolveOrThrow(name, typeof values[name] === 'number' ? (values[name] as number) : null, required),
  )
  base.getBoolean = jest.fn<(name: string, required?: boolean) => boolean | null>((name: string, required?: boolean) =>
    resolveOrThrow(name, typeof values[name] === 'boolean' ? (values[name] as boolean) : null, required),
  )

  const getObjectOption = (name: string, required?: boolean) =>
    resolveOrThrow(name, isObjectOption(values[name]) ? (values[name] as { id: string }) : null, required)

  base.getUser = jest.fn<(name: string, required?: boolean) => { id: string } | null>(getObjectOption)
  base.getRole = jest.fn<(name: string, required?: boolean) => { id: string } | null>(getObjectOption)
  base.getChannel = jest.fn<(name: string, required?: boolean) => { id: string } | null>(getObjectOption)
  base.getMember = jest.fn<(name: string, required?: boolean) => { id: string } | null>(getObjectOption)
  base.getMentionable = jest.fn<(name: string, required?: boolean) => { id: string } | null>(getObjectOption)

  return stubDeep(base) as unknown as DeepMocked<CommandInteractionOptionResolver>
}
