import 'reflect-metadata'
import { CLASS_COOLDOWNS, type CooldownOptions, METHOD_COOLDOWNS, type StoredCooldown } from '@src/core/cooldown-runner.js'

/**
 * Limits how often a handler runs: at most `uses` calls within `seconds`, counted per user, server,
 * channel or for everyone. The window slides, so each use comes back `seconds` after it was spent.
 * Stack several for layered limits, such as one every 3 seconds and 5 a minute. They are counted in the
 * order they read, and a call one refuses has already spent those above it, so put the shortest first.
 *
 * A blocked call throws `CooldownError`, answered only to the caller with how long to wait. The
 * cooldown is counted after guards, validation and pipes allow the call, so a denied call or bad
 * input spends nothing. On a controller, it applies to each of its handlers separately.
 *
 * Calls are counted in a `CooldownStore`, in memory by default; see `@MeoCord({ cooldownStore })`.
 *
 * @param options.seconds - The window's length.
 * @param options.uses - Calls allowed within the window. Defaults to `1`.
 * @param options.per - `'user'` (the default), `'guild'`, `'channel'` or `'global'`. Outside a server,
 *   `'guild'` and `'channel'` count per user.
 * @param options.bypass - Exempts a call without counting it, such as one from an owner.
 *
 * @example
 * ```ts
 * @Command('daily', CommandType.SLASH)
 * @Cooldown({ seconds: 3 })
 * @Cooldown({ uses: 5, seconds: 60, bypass: context => OWNERS.has(context.getInteraction()?.user.id ?? '') })
 * async daily(interaction: ChatInputCommandInteraction) {}
 * ```
 */
export function Cooldown(options: CooldownOptions): ClassDecorator & MethodDecorator {
  const { seconds, uses = 1, per = 'user' } = options
  if (!(seconds > 0)) throw new Error(`@Cooldown needs a positive number of seconds, not ${seconds}.`)
  if (!Number.isInteger(uses) || uses < 1) throw new Error(`@Cooldown needs a whole number of uses of at least 1, not ${uses}.`)
  if (!['user', 'guild', 'channel', 'global'].includes(per)) {
    throw new Error(`@Cooldown counts per 'user', 'guild', 'channel' or 'global', not '${String(per)}'.`)
  }
  const cooldown: StoredCooldown = { ...options, uses, per }

  return function (target: object, propertyKey?: string | symbol) {
    // Decorators apply bottom-up; prepending keeps them in the order they read.
    if (propertyKey === undefined) {
      const existing = (Reflect.getOwnMetadata(CLASS_COOLDOWNS, target) as StoredCooldown[]) ?? []
      Reflect.defineMetadata(CLASS_COOLDOWNS, [cooldown, ...existing], target)
    } else {
      const existing = (Reflect.getOwnMetadata(METHOD_COOLDOWNS, target, propertyKey) as StoredCooldown[]) ?? []
      Reflect.defineMetadata(METHOD_COOLDOWNS, [cooldown, ...existing], target, propertyKey)
    }
  } as ClassDecorator & MethodDecorator
}
