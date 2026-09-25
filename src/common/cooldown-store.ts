/** How many calls a cooldown allows, and in how long a window. */
export interface CooldownLimit {
  /** Calls allowed within the window. */
  uses: number
  /** The window's length, in milliseconds. */
  windowMs: number
}

/** Whether a call may run, and if not, how long until one may. */
export interface CooldownVerdict {
  allowed: boolean
  /** `0` when allowed; otherwise how long until the oldest call in the window leaves it. */
  retryAfterMs: number
}

/**
 * Where `@Cooldown` counts calls. The default keeps them in memory, in this process; bind another, such
 * as one backed by Redis, with `@MeoCord({ cooldownStore })` so shards or several processes share one
 * count.
 *
 * `consume` must check and record a call as one step: two calls at the limit must not both pass. Check a
 * store of your own with `testCooldownStore` from `meocord/testing`.
 *
 * @example
 * ```ts
 * @Service()
 * export class RedisCooldownStore extends CooldownStore {
 *   constructor(private readonly redis: RedisService) {
 *     super()
 *   }
 *
 *   consume(key: string, limit: CooldownLimit): Promise<CooldownVerdict> {
 *     // A sorted set of call times per key, trimmed and counted in one Lua script
 *     return this.redis.slidingWindow(key, limit.uses, limit.windowMs)
 *   }
 * }
 * ```
 */
export abstract class CooldownStore {
  /**
   * Records a call for `key` if the limit allows it: at most `limit.uses` calls within the last
   * `limit.windowMs` milliseconds.
   *
   * @param key - Identifies the handler, the cooldown and the caller, user or place it counts per.
   * @param limit - The calls allowed, and the window they are counted over.
   * @returns Whether this call was recorded, and if not, how long until one can be.
   */
  abstract consume(key: string, limit: CooldownLimit): Promise<CooldownVerdict>
}

/** How often the in-memory store drops keys whose every call has left its window. */
const SWEEP_INTERVAL_MS = 60_000

/**
 * The default `CooldownStore`: call times per key, in this process's memory. Checking and recording
 * run with nothing awaited between them, so concurrent calls cannot both take the last use.
 *
 * With process sharding each shard has its own, so `per: 'user'` and `'global'` cooldowns count per
 * shard; bind a shared store for those.
 */
export class MemoryCooldownStore extends CooldownStore {
  private readonly calls = new Map<string, { times: number[]; windowMs: number }>()
  private sweeper?: ReturnType<typeof setInterval>

  consume(key: string, { uses, windowMs }: CooldownLimit): Promise<CooldownVerdict> {
    const now = Date.now()
    const entry = this.calls.get(key) ?? { times: [], windowMs }
    entry.windowMs = windowMs
    entry.times = entry.times.filter(time => now - time < windowMs)

    let verdict: CooldownVerdict
    if (entry.times.length < uses) {
      entry.times.push(now)
      verdict = { allowed: true, retryAfterMs: 0 }
    } else {
      verdict = { allowed: false, retryAfterMs: entry.times[entry.times.length - uses] + windowMs - now }
    }

    this.calls.set(key, entry)
    this.startSweeping()
    return Promise.resolve(verdict)
  }

  /** The number of keys held, for tests of the sweep. */
  get size(): number {
    return this.calls.size
  }

  /** Drops every key whose calls have all left their window. */
  sweep(now = Date.now()): void {
    for (const [key, { times, windowMs }] of this.calls) {
      if (times.every(time => now - time >= windowMs)) this.calls.delete(key)
    }
  }

  private startSweeping(): void {
    if (this.sweeper) return
    this.sweeper = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS)
    // A cooldown must never be what keeps a stopping bot alive.
    this.sweeper.unref?.()
  }
}
