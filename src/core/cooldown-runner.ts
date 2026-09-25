import 'reflect-metadata'
import { type Container } from 'inversify'
import { BaseInteraction, Message } from 'discord.js'
import { CooldownError, type CooldownScope } from '@src/common/errors.js'
import { CooldownStore, MemoryCooldownStore } from '@src/common/cooldown-store.js'
import { type ExecutionContext, type HandlerExecutionContext } from '@src/common/execution-context.js'
import { sourcePrototype } from '@src/core/guard-runner.js'

/** A value `@Cooldown`'s `by` counts under: calls with different values are counted apart. */
export type CooldownKey = string | number

/**
 * What `@Cooldown` takes. `P` is the handler's second parameter, as `by` receives it.
 */
export interface CooldownOptions<P = Record<string, unknown>> {
  /** The window's length. */
  seconds: number
  /** Calls allowed within the window. @defaultValue `1` */
  uses?: number
  /** Whose calls are counted together. @defaultValue `'user'` */
  per?: CooldownScope
  /** Exempts a call, such as one from an owner, without counting it. */
  bypass?: (context: ExecutionContext) => boolean | Promise<boolean>
  /**
   * Counts calls apart by a value of the call, such as the account a button acts on, within the
   * scope `per` names. It receives the handler's params as the handler does, after validation and
   * pipes. Returning `undefined` counts the call as though there were no `by`.
   */
  by?: (context: ExecutionContext, params: P) => CooldownKey | undefined | Promise<CooldownKey | undefined>
}

/** A `@Cooldown` as the decorator stores it, with its defaults filled in. */
export type StoredCooldown = CooldownOptions<any> & { uses: number; per: CooldownScope }

/** Private metadata: a controller's class-level `@Cooldown`s. */
export const CLASS_COOLDOWNS = Symbol('class_cooldowns')

/** Private metadata: a method's `@Cooldown`s, in declaration order. */
export const METHOD_COOLDOWNS = Symbol('method_cooldowns')

/** The cooldowns on a handler: the controller's, from the class declaring it down, then the method's. */
export function handlerCooldowns(prototype: object, methodName: string): StoredCooldown[] {
  const source = sourcePrototype(prototype, methodName)
  if (!source) return []

  const classLevel: StoredCooldown[] = []
  for (let current: object | null = prototype; current; current = Object.getPrototypeOf(current)) {
    classLevel.unshift(...((Reflect.getOwnMetadata(CLASS_COOLDOWNS, current.constructor) as StoredCooldown[]) ?? []))
    if (current === source) break
  }
  return [...classLevel, ...((Reflect.getOwnMetadata(METHOD_COOLDOWNS, source, methodName) as StoredCooldown[]) ?? [])]
}

/** The cooldowns declared on a method itself. */
export function methodCooldowns(prototype: object, methodName: string): StoredCooldown[] {
  const source = sourcePrototype(prototype, methodName)
  return source ? ((Reflect.getOwnMetadata(METHOD_COOLDOWNS, source, methodName) as StoredCooldown[]) ?? []) : []
}

/** Who and where a call came from: an interaction's or a message's user, server and channel. */
function caller(first: unknown): { user?: string; guild?: string | null; channel?: string | null } {
  if (first instanceof BaseInteraction) return { user: first.user?.id, guild: first.guildId, channel: first.channelId }
  if (first instanceof Message) return { user: first.author?.id, guild: first.guildId, channel: first.channelId }
  return {}
}

/** The id a scope counts under; outside a server, `guild` and `channel` count per user. */
function scopeId(per: CooldownScope, first: unknown): string {
  const { user, guild, channel } = caller(first)
  if (per === 'global') return 'global'
  if (per === 'guild' && guild) return `guild:${guild}`
  if (per === 'channel' && channel && guild) return `channel:${channel}`
  return `user:${user ?? 'unknown'}`
}

/** The store `@Cooldown` counts in: the one bound, else an in-memory one shared by the container. */
export function cooldownStoreOf(container: Container): CooldownStore {
  if (!container.isBound(CooldownStore)) container.bind(CooldownStore).toConstantValue(new MemoryCooldownStore())
  return container.get(CooldownStore)
}

/**
 * Counts the call against each of the handler's cooldowns in order, and throws at the first that is
 * exhausted. A call a later cooldown blocks has still counted against the earlier ones, as any burst
 * of calls would; each store call stays one atomic step. Every key is worked out first, so a `bypass`
 * or `by` that throws leaves every count untouched.
 *
 * @param params - The handler's second argument, as the handler receives it, for `by`.
 * @throws CooldownError with the time until the blocking cooldown allows another call.
 */
export async function consumeCooldowns(
  container: Container,
  controller: { name: string },
  methodName: string,
  cooldowns: readonly StoredCooldown[],
  contextOf: () => HandlerExecutionContext,
  params: unknown,
): Promise<void> {
  if (cooldowns.length === 0) return
  // Only a controller's own cooldowns reach other handlers, and those are not counted there.
  const type = contextOf().getType()
  if (type !== 'interaction' && type !== 'message') return

  const store = cooldownStoreOf(container)
  const first = contextOf().getArgs()[0]

  const counted: { key: string; seconds: number; uses: number; per: CooldownScope }[] = []
  for (const [index, { seconds, uses, per, bypass, by }] of cooldowns.entries()) {
    if (bypass && (await bypass(contextOf()))) continue

    const value = by ? await by(contextOf(), params) : undefined
    // Encoded, so a value holding a colon cannot count under another value's key
    const suffix = value === undefined ? '' : `:by:${encodeURIComponent(String(value))}`
    counted.push({ key: `${controller.name}.${methodName}#${index}:${per}:${scopeId(per, first)}${suffix}`, seconds, uses, per })
  }

  for (const { key, seconds, uses, per } of counted) {
    const { allowed, retryAfterMs } = await store.consume(key, { uses, windowMs: seconds * 1000 })
    if (!allowed) throw new CooldownError(retryAfterMs, per)
  }
}
