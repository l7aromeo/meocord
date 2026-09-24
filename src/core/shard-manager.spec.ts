import { EventEmitter } from 'node:events'
import { vi } from 'vitest'
import { REPEAT_SIGNAL_WINDOW_MS } from '@src/util/stop-request.util.js'
import { type Shard, type ShardingManager, type ShardingManagerOptions } from 'discord.js'

const { logged } = vi.hoisted(() => ({ logged: { log: [] as string[], warn: [] as string[], error: [] as string[] } }))

vi.mock('@src/common/index.js', async importOriginal => ({
  ...(await importOriginal<object>()),
  Logger: class {
    log = (...args: unknown[]) => logged.log.push(args.map(String).join(' '))
    warn = (...args: unknown[]) => logged.warn.push(args.map(String).join(' '))
    error = (...args: unknown[]) => logged.error.push(args.map(String).join(' '))
    debug = vi.fn()
    info = vi.fn()
    verbose = vi.fn()
  },
}))

const {
  RESPAWN_BASE_MS,
  RESPAWN_CAP_MS,
  RESPAWN_RESET_MS,
  SHARD_SPAWN_DELAY_MS,
  SHUTDOWN_MARGIN_MS,
  ShardManager,
} = await import('@src/core/shard-manager.js')
const { BUNDLE_ENTRY_KEY } = await import('@src/util/bundle-entry.util.js')

/** A shard as the manager uses it: spawn, send, kill, and the events discord.js emits. */
class FakeShard extends EventEmitter {
  process: { exitCode: number | null } | null = null
  sent: unknown[] = []
  spawns = 0
  /** What a new shard's first spawn does, for a test to set. */
  static firstOutcome: 'ready' | 'die' = 'ready'
  /** What the next spawn does: become ready, or die before it. */
  outcome: 'ready' | 'die' = FakeShard.firstOutcome

  constructor(readonly id: number) {
    super()
  }

  async spawn() {
    this.spawns++
    this.process = { exitCode: null }
    if (this.outcome === 'die') {
      this.die(1)
      throw new Error(`Shard ${this.id}'s process exited before its Client became ready.`)
    }
    return this.process
  }

  die(code: number | null) {
    const child = this.process
    if (child) child.exitCode = code
    this.emit('death', child)
    this.process = null
  }

  async send(message: unknown) {
    this.sent.push(message)
  }

  kill() {
    this.die(null)
  }
}

function setup(overrides: { shards?: number | 'auto'; token?: string; shutdownTimeout?: number } = {}) {
  const shards: FakeShard[] = []
  let managerArgs: [string, ShardingManagerOptions] | undefined
  const puts: unknown[] = []
  const exit = vi.fn()
  const sleeps: number[] = []
  const clock = { now: 0 }

  const manager = new ShardManager({
    controllerClasses: [],
    token: 'token' in overrides ? overrides.token! : 'token',
    config: {
      discordToken: 'token',
      shutdownTimeout: overrides.shutdownTimeout,
      sharding: { mode: 'process', shards: overrides.shards ?? 2 },
    },
    createManager: (file, options) => {
      managerArgs = [file, options]
      return {
        createShard: (id: number) => {
          const shard = new FakeShard(id)
          shards.push(shard)
          return shard as unknown as Shard
        },
      } as unknown as ShardingManager
    },
    createRest: () => ({
      get: async () => ({ id: 'app-1' }),
      put: async (_route, { body }) => {
        puts.push(body)
        return []
      },
    }),
    recommendedShardCount: async () => 3,
    exit,
    sleep: async ms => {
      sleeps.push(ms)
    },
    now: () => clock.now,
  })
  return { manager, shards, exit, puts, sleeps, clock, managerArgs: () => managerArgs }
}

describe('ShardManager', () => {
  let signals: Record<'SIGINT' | 'SIGTERM', NodeJS.SignalsListener[]>

  beforeEach(() => {
    for (const list of Object.values(logged)) list.length = 0
    signals = {
      SIGINT: process.listeners('SIGINT') as NodeJS.SignalsListener[],
      SIGTERM: process.listeners('SIGTERM') as NodeJS.SignalsListener[],
    }
    Reflect.set(globalThis, BUNDLE_ENTRY_KEY, '/app/dist/main.js')
  })

  afterEach(() => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      for (const listener of process.listeners(signal)) {
        if (!signals[signal].includes(listener as NodeJS.SignalsListener)) process.off(signal, listener)
      }
    }
    Reflect.deleteProperty(globalThis, BUNDLE_ENTRY_KEY)
    FakeShard.firstOutcome = 'ready'
    vi.useRealTimers()
  })

  it('registers the commands once, then spawns each shard from the bundle in turn', async () => {
    const { manager, shards, puts, sleeps, managerArgs } = setup({ shards: 2 })

    await manager.start()

    expect(puts).toHaveLength(1)
    expect(shards.map(shard => [shard.id, shard.spawns])).toEqual([
      [0, 1],
      [1, 1],
    ])
    expect(sleeps).toEqual([SHARD_SPAWN_DELAY_MS])
    const [file, options] = managerArgs()!
    expect(file).toBe('/app/dist/main.js')
    expect(options).toMatchObject({ totalShards: 2, mode: 'process', respawn: false, execArgv: process.execArgv })
  })

  it('asks Discord how many shards to run for shards: auto', async () => {
    const { manager, shards } = setup({ shards: 'auto' })
    await manager.start()
    expect(shards).toHaveLength(3)
  })

  it('exits 1 before spawning anything when the token is missing', async () => {
    const { manager, shards, exit } = setup({ token: '' })
    await manager.start()
    expect(exit).toHaveBeenCalledWith(1)
    expect(shards).toEqual([])
  })

  it('starts the shards even when registration fails', async () => {
    const { manager, shards } = setup({ shards: 1 })
    Reflect.set(manager, 'options', {
      ...Reflect.get(manager, 'options'),
      createRest: () => ({
        get: async () => {
          throw new Error('401: Unauthorized')
        },
        put: async () => [],
      }),
    })

    await manager.start()

    expect(logged.error.join('\n')).toContain('Could not register the commands; starting the shards anyway')
    expect(shards[0].spawns).toBe(1)
  })

  it('restarts a shard that exits, doubling the delay up to the cap, and resets after a stable run', async () => {
    vi.useFakeTimers()
    const { manager, shards } = setup({ shards: 1 })
    await manager.start()
    const [shard] = shards

    const delays: number[] = []
    for (let i = 0; i < 8; i++) {
      shard.die(1)
      delays.push(Number(/restarting it in (\d+) ms/.exec(logged.warn.at(-1)!)![1]))
      await vi.advanceTimersByTimeAsync(RESPAWN_CAP_MS)
    }
    expect(delays).toEqual([1, 2, 4, 8, 16, 32, 60, 60].map(s => s * RESPAWN_BASE_MS))
    expect(shard.spawns).toBe(9)

    await vi.advanceTimersByTimeAsync(RESPAWN_RESET_MS)
    shard.die(1)
    expect(logged.warn.at(-1)).toContain(`restarting it in ${RESPAWN_BASE_MS} ms`)
  })

  it('catches a shard that dies before becoming ready, and restarts it', async () => {
    vi.useFakeTimers()
    FakeShard.firstOutcome = 'die'
    const { manager, shards } = setup({ shards: 1 })

    // spawn() rejects on the first attempt; start() must still resolve
    await expect(manager.start()).resolves.toBeUndefined()
    expect(logged.warn.join('\n')).toContain('did not become ready')

    shards[0].outcome = 'ready'
    await vi.advanceTimersByTimeAsync(RESPAWN_BASE_MS)
    expect(shards[0].spawns).toBe(2)
    expect(shards[0].process).not.toBeNull()
  })

  it('stops every shard and exits 1, without restarting, when a shard cannot log in', async () => {
    vi.useFakeTimers()
    const { manager, shards, exit } = setup({ shards: 2 })
    await manager.start()

    shards[0].emit('message', { meocord: 'fatal', code: 'TokenInvalid', message: 'An invalid token was provided.' })
    shards[0].die(1)
    await vi.advanceTimersByTimeAsync(RESPAWN_CAP_MS)

    expect(exit).toHaveBeenCalledWith(1)
    expect(shards.every(shard => shard.process === null)).toBe(true)
    expect(shards.map(shard => shard.spawns)).toEqual([1, 1])
    expect(logged.error.join('\n')).toContain('Shard 0 cannot log in (TokenInvalid)')
  })

  it('ignores messages that are not its own', async () => {
    const { manager, shards, exit } = setup({ shards: 1 })
    await manager.start()
    shards[0].emit('message', { _ready: true })
    expect(exit).not.toHaveBeenCalled()
  })

  describe('stopping', () => {
    it('asks every shard to shut down, waits for them, and exits 0', async () => {
      const { manager, shards, exit } = setup({ shards: 2 })
      await manager.start()

      const stopped = manager.stop()
      expect(shards.map(shard => shard.sent)).toEqual([[{ meocord: 'shutdown' }], [{ meocord: 'shutdown' }]])
      shards.forEach(shard => shard.die(0))
      await stopped

      expect(exit).toHaveBeenCalledWith(0)
    })

    it('kills the shards still running after the shutdown timeout plus the margin, and exits 1', async () => {
      vi.useFakeTimers()
      const { manager, shards, exit } = setup({ shards: 2, shutdownTimeout: 1_000 })
      await manager.start()

      const stopped = manager.stop()
      shards[0].die(0)
      await vi.advanceTimersByTimeAsync(1_000 + SHUTDOWN_MARGIN_MS)
      await stopped

      expect(shards[1].process).toBeNull()
      expect(exit).toHaveBeenCalledWith(1)
    })

    it('kills every shard at once on a signal repeated after the window', async () => {
      const { manager, shards, exit, clock } = setup({ shards: 2 })
      await manager.start()

      void manager.stop()
      clock.now += REPEAT_SIGNAL_WINDOW_MS
      await manager.stop()

      expect(shards.every(shard => shard.process === null)).toBe(true)
      expect(exit).toHaveBeenCalledWith(1)
    })

    // One Ctrl+C reaches the manager from the terminal and again from the CLI that runs it
    it('takes a copy of the signal within the window as the same request', async () => {
      const { manager, shards, exit, clock } = setup({ shards: 2 })
      await manager.start()

      const stopped = manager.stop()
      clock.now += REPEAT_SIGNAL_WINDOW_MS - 1
      await manager.stop()

      expect(shards.map(shard => shard.sent)).toEqual([[{ meocord: 'shutdown' }], [{ meocord: 'shutdown' }]])
      expect(exit).not.toHaveBeenCalled()
      shards.forEach(shard => shard.die(0))
      await stopped
      expect(exit).toHaveBeenCalledWith(0)
    })

    it('does not restart a shard that exits while stopping', async () => {
      vi.useFakeTimers()
      const { manager, shards } = setup({ shards: 1 })
      await manager.start()

      void manager.stop()
      shards[0].die(0)
      await vi.advanceTimersByTimeAsync(RESPAWN_CAP_MS)

      expect(shards[0].spawns).toBe(1)
    })

    it('stops on SIGINT', async () => {
      const { manager, shards } = setup({ shards: 1 })
      await manager.start()

      process.emit('SIGINT')

      expect(shards[0].sent).toEqual([{ meocord: 'shutdown' }])
    })
  })
})
