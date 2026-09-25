import { createHash, randomUUID } from 'node:crypto'
import { type CooldownLimit, CooldownStore, type CooldownVerdict } from '@src/common/cooldown-store.js'

/**
 * Runs a Lua script on the server, as a client's `EVAL` does: the script, the keys it touches, and its
 * arguments. Resolves to the script's reply.
 */
export type RedisEval = (script: string, keys: string[], args: string[]) => Promise<unknown>

/** Runs a script the server already holds, by its SHA1, as a client's `EVALSHA` does. */
export type RedisEvalSha = (sha: string, keys: string[], args: string[]) => Promise<unknown>

/** How a {@link RedisCooldownStore} names its keys and runs its script. */
export interface RedisCooldownStoreOptions {
  /** Put before every key the store writes. Defaults to `meocord:cooldown:`. */
  prefix?: string
  /**
   * Runs the script by its SHA1, sending it in full only when the server answers `NOSCRIPT`: once after
   * each restart or `SCRIPT FLUSH`. Without it, every call sends the script with `EVAL`.
   */
  evalsha?: RedisEvalSha
}

/**
 * One call, checked and recorded as one step on the server. A sorted set per key holds the time of each
 * call in the window: calls that have left it are trimmed, the rest counted, and this one added when the
 * limit allows, with the key set to expire when its window would be empty. Time is the server's, so every
 * process counts by one clock, and each member carries a nonce, so calls in the same microsecond stay
 * apart. A refusal reports how long until the oldest call still counting leaves the window.
 *
 * KEYS[1] the key; ARGV[1] uses; ARGV[2] windowMs; ARGV[3] a nonce for this call.
 */
const SCRIPT = `local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local uses = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
local count = redis.call('ZCARD', KEYS[1])
if count < uses then
  redis.call('ZADD', KEYS[1], now, time[1] .. '.' .. time[2] .. ':' .. ARGV[3])
  redis.call('PEXPIRE', KEYS[1], window)
  return {1, 0}
end
local oldest = redis.call('ZRANGE', KEYS[1], count - uses, count - uses, 'WITHSCORES')
redis.call('PEXPIRE', KEYS[1], window)
return {0, math.max(tonumber(oldest[2]) + window - now, 1)}
`

const SCRIPT_SHA = createHash('sha1').update(SCRIPT).digest('hex')

const DEFAULT_PREFIX = 'meocord:cooldown:'

/**
 * A `CooldownStore` on Redis, or on any server that speaks its protocol and runs its Lua scripts:
 * Valkey, KeyDB, Dragonfly, and Upstash, which runs `EVAL`. Garnet runs Lua only in part; check it with
 * `testCooldownStore` before relying on it. Counts outlive a restart and are shared by every process and
 * shard that uses the same server, so `'user'` and `'global'` cooldowns stay exact across them.
 *
 * MeoCord does not depend on a Redis client: give {@link RedisCooldownStore.using} a function that runs
 * a script with the client you have, and pass what it returns to `@MeoCord({ cooldownStore })`.
 *
 * @example
 * ```ts
 * import { createClient } from 'redis'
 * import { RedisCooldownStore } from 'meocord/common'
 *
 * const redis = await createClient({ url: process.env.REDIS_URL }).connect()
 *
 * @MeoCord({
 *   controllers: [...],
 *   clientOptions: {...},
 *   cooldownStore: RedisCooldownStore.using((script, keys, args) => redis.eval(script, { keys, arguments: args })),
 * })
 * export default class App {}
 * ```
 */
export class RedisCooldownStore extends CooldownStore {
  private readonly prefix: string

  /**
   * A store that runs its script through `evaluate`. To bind one to an app, use
   * {@link RedisCooldownStore.using}, which `@MeoCord({ cooldownStore })` takes.
   */
  constructor(
    private readonly evaluate: RedisEval,
    private readonly options: RedisCooldownStoreOptions = {},
  ) {
    super()
    this.prefix = options.prefix ?? DEFAULT_PREFIX
  }

  /**
   * A store class for `@MeoCord({ cooldownStore })` that runs its script with your client.
   *
   * @param evaluate - Runs a script, as the client's `EVAL`.
   * @param options - A key prefix, and an `EVALSHA` runner to send the script only when the server lacks it.
   * @returns A class the app resolves like a service, with nothing to inject.
   *
   * @example
   * ```ts
   * // node-redis, sending the script by its SHA1 once the server has it
   * RedisCooldownStore.using((script, keys, args) => redis.eval(script, { keys, arguments: args }), {
   *   evalsha: (sha, keys, args) => redis.evalSha(sha, { keys, arguments: args }),
   * })
   *
   * // ioredis
   * RedisCooldownStore.using((script, keys, args) => redis.eval(script, keys.length, ...keys, ...args), {
   *   prefix: 'mybot:cooldown:',
   * })
   * ```
   */
  static using(evaluate: RedisEval, options: RedisCooldownStoreOptions = {}): new () => RedisCooldownStore {
    const Bound = class extends RedisCooldownStore {
      constructor() {
        super(evaluate, options)
      }
    }
    Object.defineProperty(Bound, 'name', { value: RedisCooldownStore.name })
    return Bound
  }

  /**
   * Records a call for `key` on the server if the limit allows it, as one script.
   *
   * @param key - Identifies the handler, the cooldown and the caller, user or place it counts per.
   * @param limit - The calls allowed, and the window they are counted over.
   * @returns Whether this call was recorded, and if not, how long until one can be.
   */
  async consume(key: string, { uses, windowMs }: CooldownLimit): Promise<CooldownVerdict> {
    const keys = [`${this.prefix}${key}`]
    const args = [String(uses), String(windowMs), randomUUID()]
    return verdictOf(await this.run(keys, args))
  }

  private async run(keys: string[], args: string[]): Promise<unknown> {
    const { evalsha } = this.options
    if (!evalsha) return this.evaluate(SCRIPT, keys, args)
    try {
      return await evalsha(SCRIPT_SHA, keys, args)
    } catch (error) {
      // The server has not seen the script since it started, or its scripts were flushed: EVAL loads it.
      if (!String((error as Error | undefined)?.message ?? error).includes('NOSCRIPT')) throw error
      return this.evaluate(SCRIPT, keys, args)
    }
  }
}

/** The script's `{allowed, retryAfterMs}` reply, as a verdict. */
function verdictOf(reply: unknown): CooldownVerdict {
  const [allowed, retryAfterMs] = Array.isArray(reply) ? reply.map(Number) : []
  if ((allowed !== 0 && allowed !== 1) || !Number.isFinite(retryAfterMs)) {
    throw new Error(
      `RedisCooldownStore's script replied ${JSON.stringify(reply)}, where it returns [allowed, retryAfterMs]. ` +
        'Check that the function given to RedisCooldownStore.using resolves to what the client’s eval returns.',
    )
  }
  return { allowed: allowed === 1, retryAfterMs: allowed === 1 ? 0 : retryAfterMs }
}
