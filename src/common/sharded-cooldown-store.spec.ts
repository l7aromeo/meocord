import { vi } from 'vitest'
import { CooldownStore, MemoryCooldownStore, ShardedCooldownStore } from '@src/common/index.js'
import {
  answerCooldown,
  type CooldownChannel,
  SHARDED_COOLDOWN_TIMEOUT_MS,
  shardedCooldownStoreOn,
} from '@src/common/sharded-cooldown-store.js'
import { type ShardMessage } from '@src/core/shard-messages.js'
import { testCooldownStore } from '@src/testing/index.js'

/** A manager in this process, reached as over IPC: messages cross as JSON, a turn of the event loop later. */
function loopback(manager: CooldownStore = new MemoryCooldownStore()): CooldownChannel {
  const listeners: ((message: unknown) => void)[] = []
  const deliver = (message: ShardMessage) =>
    setImmediate(() => listeners.forEach(listener => listener(JSON.parse(JSON.stringify(message)))))
  return {
    send: message => setImmediate(() => answerCooldown(manager, JSON.parse(JSON.stringify(message)), deliver)),
    onMessage: listener => void listeners.push(listener),
  }
}

const limit = { uses: 1, windowMs: 5_000 }

testCooldownStore('ShardedCooldownStore outside process sharding', () => new ShardedCooldownStore(), { describe, it, expect })

testCooldownStore('ShardedCooldownStore counting in a manager', () => shardedCooldownStoreOn(loopback()), {
  describe,
  it,
  expect,
})

describe('ShardedCooldownStore', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('counts every shard in the manager, so two shards share one count', async () => {
    const manager = new MemoryCooldownStore()
    const [first, second] = [shardedCooldownStoreOn(loopback(manager)), shardedCooldownStoreOn(loopback(manager))]

    expect((await first.consume('shared', limit)).allowed).toBe(true)
    expect((await second.consume('shared', limit)).allowed).toBe(false)
  })

  it('needs nothing injected, so @MeoCord({ cooldownStore }) can take it as it is', () => {
    expect(ShardedCooldownStore.length).toBe(0)
    expect(new ShardedCooldownStore()).toBeInstanceOf(CooldownStore)
  })

  it('counts a call itself, and warns once, when the manager does not answer in time', async () => {
    vi.useFakeTimers()
    const warn = vi.spyOn(ShardedCooldownStore.prototype as never, 'warnOnce' as never)
    const logger = vi.fn()
    const silent: CooldownChannel = { send: () => undefined, onMessage: () => undefined }
    const store = shardedCooldownStoreOn(silent)
    ;(store as unknown as { logger: { warn: typeof logger } }).logger = { warn: logger }

    const first = store.consume('k', limit)
    await vi.advanceTimersByTimeAsync(SHARDED_COOLDOWN_TIMEOUT_MS)
    const second = store.consume('k', limit)
    await vi.advanceTimersByTimeAsync(SHARDED_COOLDOWN_TIMEOUT_MS)

    expect(await first).toEqual({ allowed: true, retryAfterMs: 0 })
    expect((await second).allowed).toBe(false)
    expect(warn).toHaveBeenCalledTimes(2)
    expect(logger).toHaveBeenCalledTimes(1)
    expect(logger).toHaveBeenCalledWith(expect.stringContaining('did not count a cooldown within 1000 ms'))
  })

  it('counts a call itself at once when the channel to the manager has closed', async () => {
    const closed: CooldownChannel = {
      send: () => {
        throw new Error('Channel closed')
      },
      onMessage: () => undefined,
    }
    const store = shardedCooldownStoreOn(closed)
    ;(store as unknown as { logger: { warn: () => void } }).logger = { warn: () => undefined }

    expect(await store.consume('k', limit)).toEqual({ allowed: true, retryAfterMs: 0 })
  })

  it("ignores another store's answers, and messages that are not verdicts", async () => {
    const listeners: ((message: unknown) => void)[] = []
    const channel: CooldownChannel = {
      send: message => {
        if (message.meocord !== 'cooldown') return
        setImmediate(() => {
          for (const listener of listeners) {
            listener({ meocord: 'cooldown-verdict', id: 'someone-else:0', verdict: { allowed: false, retryAfterMs: 9 } })
            listener({ meocord: 'shutdown' })
            listener('not ours')
            listener({ meocord: 'cooldown-verdict', id: message.id, verdict: { allowed: true, retryAfterMs: 0 } })
          }
        })
      },
      onMessage: listener => void listeners.push(listener),
    }

    expect(await shardedCooldownStoreOn(channel).consume('k', limit)).toEqual({ allowed: true, retryAfterMs: 0 })
  })
})

describe('answerCooldown', () => {
  it("answers a shard's call from the manager's store, under the call's id", async () => {
    const reply = vi.fn()
    const handled = answerCooldown(new MemoryCooldownStore(), { meocord: 'cooldown', id: 'a:1', key: 'k', limit }, reply)
    await vi.waitFor(() => expect(reply).toHaveBeenCalled())

    expect(handled).toBe(true)
    expect(reply).toHaveBeenCalledWith({ meocord: 'cooldown-verdict', id: 'a:1', verdict: { allowed: true, retryAfterMs: 0 } })
  })

  it.each([{ meocord: 'fatal', code: 'x', message: 'y' }, { meocord: 'shutdown' }, 'text', null])('leaves %j alone', message => {
    const reply = vi.fn()

    expect(answerCooldown(new MemoryCooldownStore(), message, reply)).toBe(false)
    expect(reply).not.toHaveBeenCalled()
  })
})
