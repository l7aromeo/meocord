/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { jest } from '@jest/globals'
import { CommandInteractionOptionResolver } from 'discord.js'

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
      -readonly [K in keyof T]: T[K] extends (...args: any[]) => any
        ? jest.MockedFunction<T[K]>
        : T[K] extends object
          ? DeepMocked<T[K], [...Depth, 0]>
          : T[K]
    }

// ---------------------------------------------------------------------------
// stubDeep — Proxy that auto-creates jest.fn() on any property access
// ---------------------------------------------------------------------------

const SKIP = new Set(['constructor', 'toString', 'valueOf', 'toJSON', 'then'])

function stubDeep(instance: any): any {
  const stubs = new Map<string, any>()

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
        return target[key]
      }

      // Skip passthrough props — return prototype value as-is
      if (SKIP.has(key)) {
        return Reflect.get(target, prop, target)
      }

      // Return cached stub
      if (stubs.has(key)) return stubs.get(key)

      // Walk the prototype chain to check if it's a function
      let proto = Object.getPrototypeOf(target)
      let protoValue: any
      while (proto) {
        if (Object.prototype.hasOwnProperty.call(proto, key)) {
          protoValue = proto[key]
          break
        }
        proto = Object.getPrototypeOf(proto)
      }

      const stub = typeof protoValue === 'function' ? jest.fn() : stubDeep({})
      stubs.set(key, stub)
      return stub
    },

    set(target, prop, value) {
      target[prop as string] = value
      return true
    },
  })
}

// ---------------------------------------------------------------------------
// createMockInteraction
// ---------------------------------------------------------------------------

/**
 * Creates a mock instance of any discord.js class. The prototype chain is
 * preserved so `instanceof` checks at every level pass. All methods are
 * auto-stubbed as `jest.fn()` via Proxy — including nested objects like
 * `interaction.options`. Direct property writes work normally.
 *
 * Works for any current or future discord.js class — no per-type maintenance.
 *
 * @example
 * ```ts
 * const interaction = createMockInteraction(ButtonInteraction)
 * interaction.isButton.mockReturnValue(true)
 * interaction.guildId = 'guild-123'
 * expect(interaction).toBeInstanceOf(BaseInteraction) // true
 * ```
 */
export function createMockInteraction<T extends object>(Class: { prototype: T }): DeepMocked<T> {
  const instance = Object.create(Class.prototype)
  return stubDeep(instance) as DeepMocked<T>
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

  function resolveOrThrow<T>(name: string, value: T | null, required?: boolean): T | null {
    if (value === null) {
      if (required) throw new Error(`Option "${name}" is required but was not provided.`)
      return null
    }
    return value
  }

  function resolveSubEntry(field: string | null, label: string, required?: boolean): string | null {
    if (!field) {
      if (required) throw new Error(`No ${label} found.`)
      return null
    }
    return field
  }

  const isObjectOption = (v: unknown): v is { id: string } => typeof v === 'object' && v !== null && 'id' in v

  // Use a real prototype instance so unlisted methods (e.g. getAttachment)
  // are found on the prototype chain and auto-stubbed as jest.fn()
  const base: Record<string, any> = Object.create(CommandInteractionOptionResolver.prototype)

  base.getSubcommandGroup = jest
    .fn()
    .mockImplementation(((required?: boolean) => resolveSubEntry(subcommandGroup, 'subcommand group', required)) as any)
  base.getSubcommand = jest
    .fn()
    .mockImplementation(((required?: boolean) => resolveSubEntry(subcommand, 'subcommand', required)) as any)
  base.getString = jest
    .fn()
    .mockImplementation(((name: string, required?: boolean) =>
      resolveOrThrow(name, typeof values[name] === 'string' ? (values[name] as string) : null, required)) as any)
  base.getNumber = jest
    .fn()
    .mockImplementation(((name: string, required?: boolean) =>
      resolveOrThrow(name, typeof values[name] === 'number' ? (values[name] as number) : null, required)) as any)
  base.getInteger = jest
    .fn()
    .mockImplementation(((name: string, required?: boolean) =>
      resolveOrThrow(name, typeof values[name] === 'number' ? (values[name] as number) : null, required)) as any)
  base.getBoolean = jest
    .fn()
    .mockImplementation(((name: string, required?: boolean) =>
      resolveOrThrow(name, typeof values[name] === 'boolean' ? (values[name] as boolean) : null, required)) as any)

  const getObjectOption = (name: string, required?: boolean) =>
    resolveOrThrow(name, isObjectOption(values[name]) ? (values[name] as { id: string }) : null, required)

  base.getUser = jest.fn().mockImplementation(getObjectOption as any)
  base.getRole = jest.fn().mockImplementation(getObjectOption as any)
  base.getChannel = jest.fn().mockImplementation(getObjectOption as any)
  base.getMember = jest.fn().mockImplementation(getObjectOption as any)
  base.getMentionable = jest.fn().mockImplementation(getObjectOption as any)

  return stubDeep(base) as unknown as DeepMocked<CommandInteractionOptionResolver>
}
