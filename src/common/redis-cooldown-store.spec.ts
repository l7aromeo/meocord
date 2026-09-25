import { createHash } from 'node:crypto'
import { CooldownStore, RedisCooldownStore, type RedisEval, type RedisEvalSha } from '@src/common/index.js'
import { createMockFn } from '@src/testing/index.js'

const limit = { uses: 2, windowMs: 5_000 }
const sha1 = (text: string) => createHash('sha1').update(text).digest('hex')

describe('RedisCooldownStore', () => {
  it('runs one script with the prefixed key, the limit and a nonce for the call', async () => {
    const evaluate = createMockFn<RedisEval>(() => Promise.resolve([1, 0]))
    const store = new RedisCooldownStore(evaluate)

    await store.consume('Ping.run#0:per:user:1', limit)
    await store.consume('Ping.run#0:per:user:1', limit)

    const [[script, keys, args], [, , second]] = evaluate.mock.calls
    expect(script).toContain("redis.call('TIME')")
    expect(keys).toEqual(['meocord:cooldown:Ping.run#0:per:user:1'])
    expect(args.slice(0, 2)).toEqual(['2', '5000'])
    expect(args[2]).not.toBe(second[2])
  })

  it('puts its own prefix before every key', async () => {
    const evaluate = createMockFn<RedisEval>(() => Promise.resolve([1, 0]))

    await new RedisCooldownStore(evaluate, { prefix: 'bot:cd:' }).consume('k', limit)

    expect(evaluate.mock.calls[0][1]).toEqual(['bot:cd:k'])
  })

  it.each([
    [[1, 0], { allowed: true, retryAfterMs: 0 }],
    [[0, 1234], { allowed: false, retryAfterMs: 1234 }],
    // Some clients reply with strings
    [['0', '42'], { allowed: false, retryAfterMs: 42 }],
  ])('reads the reply %j as %j', async (reply, verdict) => {
    const store = new RedisCooldownStore(() => Promise.resolve(reply))

    expect(await store.consume('k', limit)).toEqual(verdict)
  })

  it.each([null, 'OK', [2, 0], [0]])('says what it expected when the adapter resolves to %j', async reply => {
    const store = new RedisCooldownStore(() => Promise.resolve(reply))

    await expect(store.consume('k', limit)).rejects.toThrow(/replied .*where it returns \[allowed, retryAfterMs\]/)
  })

  it('sends the script by its SHA1 when given evalsha, and in full only when the server answers NOSCRIPT', async () => {
    const evaluate = createMockFn<RedisEval>(() => Promise.resolve([1, 0]))
    let loaded = false
    const evalsha = createMockFn<RedisEvalSha>(() =>
      loaded ? Promise.resolve([1, 0]) : Promise.reject(new Error('NOSCRIPT No matching script. Please use EVAL.')),
    )
    const store = new RedisCooldownStore(evaluate, { evalsha })

    await store.consume('k', limit)
    loaded = true
    await store.consume('k', limit)

    expect(evalsha.mock.calls.map(([sha]) => sha)).toEqual([sha1(evaluate.mock.calls[0][0]), sha1(evaluate.mock.calls[0][0])])
    expect(evaluate.mock.calls).toHaveLength(1)
  })

  it('passes on an error from evalsha that is not NOSCRIPT', async () => {
    const evaluate = createMockFn<RedisEval>(() => Promise.resolve([1, 0]))
    const store = new RedisCooldownStore(evaluate, { evalsha: () => Promise.reject(new Error('READONLY replica')) })

    await expect(store.consume('k', limit)).rejects.toThrow('READONLY replica')
    expect(evaluate.mock.calls).toHaveLength(0)
  })

  describe('using', () => {
    it('makes a class @MeoCord({ cooldownStore }) can resolve, with nothing to inject', async () => {
      const evaluate = createMockFn<RedisEval>(() => Promise.resolve([0, 900]))
      const Store = RedisCooldownStore.using(evaluate, { prefix: 'p:' })
      const store = new Store()

      expect(Store.name).toBe('RedisCooldownStore')
      expect(Store.length).toBe(0)
      expect(store).toBeInstanceOf(CooldownStore)
      expect(await store.consume('k', limit)).toEqual({ allowed: false, retryAfterMs: 900 })
      expect(evaluate.mock.calls[0][1]).toEqual(['p:k'])
    })
  })
})
