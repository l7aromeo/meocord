import { randomUUID } from 'node:crypto'
import { type CooldownLimit, CooldownStore, type CooldownVerdict, MemoryCooldownStore } from '@src/common/cooldown-store.js'
import { Logger } from '@src/common/logger.js'
import { isShardMessage, type ShardMessage } from '@src/core/shard-messages.js'
import { isShardProcess } from '@src/util/sharding-mode.util.js'

/** How long a shard waits for the manager to count a call before counting it itself. */
export const SHARDED_COOLDOWN_TIMEOUT_MS = 1_000

/** The IPC between a shard and its manager, as a shard's `process` provides it. */
export interface CooldownChannel {
  send(message: ShardMessage): void
  onMessage(listener: (message: unknown) => void): void
}

/** A shard's channel to its manager, or none outside process sharding. */
function managerChannel(): CooldownChannel | undefined {
  if (!isShardProcess() || typeof process.send !== 'function') return undefined
  return {
    send: message => void process.send!(message),
    onMessage: listener => void process.on('message', listener),
  }
}

/**
 * A `CooldownStore` for process sharding that needs no database: each shard asks the shard manager, which
 * counts every shard's calls in its own memory, so `'user'` and `'global'` cooldowns are exact across the
 * shards on one host. Outside process sharding, where one process runs every shard, it counts in that
 * process, which is exact too.
 *
 * Counts live in the manager's memory, so they start again when the whole bot restarts, as the in-memory
 * store's do; a shard that restarts keeps them. If the manager does not answer within a second, a shard
 * counts the call itself and logs a warning, once. For counts that outlive a restart, or bots on several
 * hosts, use `RedisCooldownStore`.
 *
 * @example
 * ```ts
 * import { ShardedCooldownStore } from 'meocord/common'
 *
 * @MeoCord({ controllers: [...], clientOptions: {...}, cooldownStore: ShardedCooldownStore })
 * export default class App {}
 * ```
 */
export class ShardedCooldownStore extends CooldownStore {
  private readonly logger = new Logger(ShardedCooldownStore.name)
  private readonly local = new MemoryCooldownStore()
  private readonly pending = new Map<string, (verdict: CooldownVerdict) => void>()
  private readonly prefix = randomUUID()
  private channel = managerChannel()
  private next = 0
  private listening = false
  private warned = false

  /**
   * Records a call for `key` if the limit allows it: in the manager with process sharding, here otherwise.
   *
   * @param key - Identifies the handler, the cooldown and the caller, user or place it counts per.
   * @param limit - The calls allowed, and the window they are counted over.
   * @returns Whether this call was recorded, and if not, how long until one can be.
   */
  async consume(key: string, limit: CooldownLimit): Promise<CooldownVerdict> {
    const { channel } = this
    if (!channel) return this.local.consume(key, limit)
    this.listen(channel)

    const id = `${this.prefix}:${this.next++}`
    const answered = new Promise<CooldownVerdict>(resolve => this.pending.set(id, resolve))
    let timer: ReturnType<typeof setTimeout> | undefined
    const timedOut = new Promise<undefined>(resolve => {
      const waiting = setTimeout(() => resolve(undefined), SHARDED_COOLDOWN_TIMEOUT_MS)
      // A cooldown must never be what keeps a stopping shard alive.
      waiting.unref?.()
      timer = waiting
    })
    try {
      channel.send({ meocord: 'cooldown', id, key, limit })
      const verdict = await Promise.race([answered, timedOut])
      if (verdict) return verdict
    } catch {
      // The manager cannot be reached, as when the channel has closed: counted here instead, below.
    } finally {
      clearTimeout(timer)
      this.pending.delete(id)
    }
    this.warnOnce()
    return this.local.consume(key, limit)
  }

  private listen(channel: CooldownChannel): void {
    if (this.listening) return
    this.listening = true
    channel.onMessage(message => {
      if (!isShardMessage(message) || message.meocord !== 'cooldown-verdict') return
      this.pending.get(message.id)?.(message.verdict)
    })
  }

  private warnOnce(): void {
    if (this.warned) return
    this.warned = true
    this.logger.warn(
      `The shard manager did not count a cooldown within ${SHARDED_COOLDOWN_TIMEOUT_MS} ms, so this shard ` +
        "counts its calls itself until it answers: 'user' and 'global' cooldowns may allow more than they say.",
    )
  }
}

/** A store that talks to a manager over `channel`, for tests that stand a process in for the manager. */
export function shardedCooldownStoreOn(channel: CooldownChannel | undefined): ShardedCooldownStore {
  const store = new ShardedCooldownStore()
  ;(store as unknown as { channel: CooldownChannel | undefined }).channel = channel
  return store
}

/**
 * Answers a shard's `cooldown` message from the manager's store, and ignores any other message.
 *
 * @returns Whether the message was a cooldown call.
 */
export function answerCooldown(store: CooldownStore, message: unknown, reply: (message: ShardMessage) => unknown): boolean {
  if (!isShardMessage(message) || message.meocord !== 'cooldown') return false
  void store.consume(message.key, message.limit).then(
    verdict => reply({ meocord: 'cooldown-verdict', id: message.id, verdict }),
    () => undefined,
  )
  return true
}
