import { randomUUID } from 'node:crypto'
import { Redis } from 'ioredis'
import { createClient } from 'redis'
import { RedisCooldownStore } from '@src/common/index.js'
import { testCooldownStore } from '@src/testing/index.js'

/**
 * RedisCooldownStore's script on a real server, through both clients the README shows. Runs where
 * REDIS_URL names one, as CI's Redis job does: `REDIS_URL=redis://localhost:6379 bun run test`.
 */
const url = process.env.REDIS_URL

describe.skipIf(!url)('RedisCooldownStore on a Redis server', () => {
  const nodeRedis = createClient({ url })
  const ioredis = new Redis(url ?? '', { lazyConnect: true })
  const prefix = `meocord-test:${randomUUID()}:`

  beforeAll(async () => {
    await Promise.all([nodeRedis.connect(), ioredis.connect()])
  })

  afterAll(async () => {
    const keys = await ioredis.keys(`${prefix}*`)
    if (keys.length > 0) await ioredis.del(...keys)
    await Promise.all([nodeRedis.quit(), ioredis.quit()])
  })

  const viaNodeRedis = RedisCooldownStore.using((script, keys, args) => nodeRedis.eval(script, { keys, arguments: args }), {
    prefix,
  })
  const viaIoredis = RedisCooldownStore.using((script, keys, args) => ioredis.eval(script, keys.length, ...keys, ...args), {
    prefix,
  })
  const viaEvalSha = RedisCooldownStore.using((script, keys, args) => nodeRedis.eval(script, { keys, arguments: args }), {
    prefix,
    evalsha: (sha, keys, args) => nodeRedis.evalSha(sha, { keys, arguments: args }),
  })

  testCooldownStore('RedisCooldownStore through node-redis', () => new viaNodeRedis(), { describe, it, expect })
  testCooldownStore('RedisCooldownStore through ioredis', () => new viaIoredis(), { describe, it, expect })
  testCooldownStore('RedisCooldownStore through EVALSHA', () => new viaEvalSha(), { describe, it, expect })

  it('gives every key it writes an expiry no longer than its window', async () => {
    const store = new viaIoredis()
    await store.consume('expiry', { uses: 1, windowMs: 3_000 })
    await store.consume('expiry', { uses: 1, windowMs: 3_000 })

    const ttl = await ioredis.pttl(`${prefix}expiry`)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(3_000)
  })

  it('loads its script after the server flushes it, through EVALSHA', async () => {
    await ioredis.script('FLUSH')

    expect((await new viaEvalSha().consume('flushed', { uses: 1, windowMs: 1_000 })).allowed).toBe(true)
  })
})
