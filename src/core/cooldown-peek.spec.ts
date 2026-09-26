import { ButtonInteraction, User } from 'discord.js'
import { Container } from 'inversify'
import { vi } from 'vitest'
import {
  type CooldownBatchVerdict,
  type CooldownEntry,
  CooldownError,
  CooldownStore,
  CooldownStoreError,
  Logger,
  MemoryCooldownStore,
} from '@src/common/index.js'
import { HandlerExecutionContext } from '@src/common/execution-context.js'
import { COOLDOWN_POLICY, consumeCooldowns, handlerCooldowns, peekCooldowns } from '@src/core/cooldown-runner.js'
import { Command, Controller, Cooldown } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { createMockInteraction } from '@src/testing/index.js'

const owner = vi.fn(() => false)

@Controller()
class Shop {
  @Command('buy', CommandType.BUTTON)
  @Cooldown({ seconds: 60, uses: 2 })
  @Cooldown({ seconds: 3600, uses: 5, per: 'global' })
  buy() {}

  @Command('owned', CommandType.BUTTON)
  @Cooldown({ seconds: 60, bypass: () => owner() })
  owned() {}

  @Command('item', CommandType.BUTTON)
  @Cooldown<{ item: string }>({ seconds: 60, by: (_context, { item }) => item })
  item() {}
}

/** A store that counts in memory and records what it was asked, or fails every call until `failing` is unset. */
class Recording extends MemoryCooldownStore {
  readonly asked: string[] = []
  failing: 'reject' | 'hang' | undefined

  peekMany(entries: readonly CooldownEntry[]): Promise<CooldownBatchVerdict> {
    this.asked.push('peek')
    return this.failing ? this.fail() : super.peekMany(entries)
  }

  consumeMany(entries: readonly CooldownEntry[]): Promise<CooldownBatchVerdict> {
    this.asked.push('consume')
    return this.failing ? this.fail() : super.consumeMany(entries)
  }

  private fail(): Promise<never> {
    return this.failing === 'reject' ? Promise.reject(new Error('ECONNREFUSED')) : new Promise<never>(() => undefined)
  }
}

function app(store: CooldownStore, failure: 'deny' | 'allow' = 'deny', timeoutMs = 1_000) {
  const container = new Container()
  container.bind(CooldownStore).toConstantValue(store)
  container.bind(COOLDOWN_POLICY).toConstantValue({ failure, timeoutMs })
  return (methodName: 'buy' | 'owned' | 'item', userId = '1') => {
    const interaction = createMockInteraction(ButtonInteraction, { customId: methodName, user: createMockInteraction(User, { id: userId }) })
    const context = new HandlerExecutionContext({ controller: Shop, methodName, args: [interaction] })
    const cooldowns = handlerCooldowns(Shop.prototype, methodName)
    return {
      peek: () => peekCooldowns(container, Shop, methodName, cooldowns, () => context),
      consume: (params: unknown = {}) => consumeCooldowns(container, Shop, methodName, cooldowns, () => context, params),
    }
  }
}

const errorOf = (promise: Promise<unknown>) => promise.then(() => undefined, (error: unknown) => error)

beforeEach(() => {
  owner.mockClear().mockReturnValue(false)
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined)
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined)
})
afterEach(() => vi.restoreAllMocks())

describe('peekCooldowns', () => {
  it('lets a call through below the limit, however often, and counts nothing', async () => {
    const call = app(new MemoryCooldownStore())
    for (let peek = 0; peek < 5; peek++) await call('buy').peek()

    await call('buy').consume()
    await call('buy').consume()
    await expect(call('buy').peek()).rejects.toBeInstanceOf(CooldownError)
  })

  it('refuses with the CooldownError consume would throw: the same scope, wait and message', async () => {
    const call = app(new MemoryCooldownStore())
    await call('buy').consume()
    await call('buy').consume()

    const consumed = (await errorOf(call('buy').consume())) as CooldownError
    const peeked = (await errorOf(call('buy').peek())) as CooldownError

    expect(peeked).toBeInstanceOf(CooldownError)
    expect(peeked.per).toBe(consumed.per)
    expect(peeked.message).toBe(consumed.message)
    expect(consumed.retryAfterMs - peeked.retryAfterMs).toBeGreaterThanOrEqual(0)
    expect(consumed.retryAfterMs - peeked.retryAfterMs).toBeLessThan(250)
  })

  it('checks every cooldown in one store call', async () => {
    const store = new Recording()
    const peekMany = vi.spyOn(store, 'peekMany')

    await app(store)('buy').peek()

    expect(peekMany).toHaveBeenCalledTimes(1)
    expect(peekMany.mock.calls[0][0].map(({ key }) => key)).toEqual(['Shop.buy#0:user:user:1', 'Shop.buy#1:global:global'])
  })

  it('leaves cooldowns with by to consume, since their key needs the resolved params', async () => {
    const store = new Recording()
    const call = app(store)('item')

    await call.peek()
    await call.consume({ item: 'sword' })

    expect(store.asked).toEqual(['consume'])
  })

  it('asks a bypass once per call, for the peek and the consume both', async () => {
    const store = new Recording()
    const call = app(store)('owned')

    await call.peek()
    await call.consume()
    owner.mockReturnValue(true)
    const bypassed = app(store)('owned', '2')
    await bypassed.peek()
    await bypassed.consume()

    expect(owner).toHaveBeenCalledTimes(2)
    expect(store.asked).toEqual(['peek', 'consume'])
  })

  it("refuses with CooldownStoreError when the store fails under 'deny', logging the outage once", async () => {
    const store = new Recording()
    store.failing = 'reject'
    const call = app(store)

    await expect(call('buy').peek()).rejects.toBeInstanceOf(CooldownStoreError)
    await expect(call('buy', '2').consume()).rejects.toBeInstanceOf(CooldownStoreError)

    expect(vi.mocked(Logger.prototype.error).mock.calls.filter(([line]) => String(line).includes('Recording failed'))).toHaveLength(1)
  })

  it("under 'allow', lets the call through and runs it uncounted without asking the failing store again", async () => {
    const store = new Recording()
    store.failing = 'hang'
    const call = app(store, 'allow', 30)('buy')

    await call.peek()
    await call.consume()

    expect(store.asked).toEqual(['peek'])
  })

  it('refuses a peek the store does not answer within the timeout', async () => {
    const store = new Recording()
    store.failing = 'hang'

    const error = (await errorOf(app(store, 'deny', 30)('buy').peek())) as CooldownStoreError

    expect(error).toBeInstanceOf(CooldownStoreError)
    expect(error.timedOut).toBe(true)
  })

  it('lets every call through with a store that does not peek, leaving the refusal to consume', async () => {
    const memory = new MemoryCooldownStore()
    const consumeOnly = { consume: memory.consume.bind(memory) } as unknown as CooldownStore
    const call = app(consumeOnly)

    await call('buy').consume()
    await call('buy').consume()
    await call('buy').peek()
    await expect(call('buy').consume()).rejects.toBeInstanceOf(CooldownError)
  })
})
