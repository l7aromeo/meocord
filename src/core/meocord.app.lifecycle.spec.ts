import { vi } from 'vitest'
import { type Client } from 'discord.js'
import type * as AppModule from '@src/core/meocord.app.js'
import type * as FactoryModule from '@src/core/meocord-factory.js'
import type * as DecoratorModule from '@src/decorator/index.js'
import { type OnReady, type OnShutdown, type ReadyInfo } from '@src/interface/index.js'

const { logged } = vi.hoisted(() => ({ logged: { error: [] as unknown[][], warn: [] as unknown[][] } }))

// Logger is constructed with `new`, so the implementation has to be a class.
vi.mock('@src/common/index.js', async importOriginal => ({
  ...(await importOriginal<object>()),
  Logger: class {
    log = vi.fn()
    debug = vi.fn()
    info = vi.fn()
    verbose = vi.fn()
    error = (...args: unknown[]) => logged.error.push(args)
    warn = (...args: unknown[]) => logged.warn.push(args)
  },
}))

vi.mock('@src/util/meocord-config-loader.util.js', () => ({
  loadMeoCordConfig: () => ({ discordToken: 'test-token' }),
}))

vi.mock('@src/util/platform.util.js', () => ({ assertBuiltForThisPlatform: () => {} }))

/**
 * Fresh modules per test: shutdown state and the signal listeners live at module level, as they do
 * in a real process, so each test starts from a process that has shut nothing down yet.
 */
async function load() {
  vi.resetModules()
  const discord = await import('discord.js')
  const app: typeof AppModule = await import('@src/core/meocord.app.js')
  const factory: typeof FactoryModule = await import('@src/core/meocord-factory.js')
  const decorators: typeof DecoratorModule = await import('@src/decorator/index.js')
  return { discord, ...app, ...factory, ...decorators }
}

type Loaded = Awaited<ReturnType<typeof load>>

/** Starts an app built by the factory, with a client that logs in without a network. */
async function startApp(loaded: Loaded, options: { controllers: any[]; services?: any[] }) {
  const clients: Client[] = []
  vi.spyOn(loaded.discord.Client.prototype, 'login').mockImplementation(function (this: Client) {
    clients.push(this)
    return Promise.resolve('token')
  })
  vi.spyOn(loaded.discord.Client.prototype, 'destroy').mockResolvedValue(undefined)

  @loaded.MeoCord({ controllers: options.controllers, services: options.services, clientOptions: { intents: [] } })
  class App {}

  const app = loaded.MeoCordFactory.create(App)
  await app.start()
  return { app, client: clients[0] }
}

/** Emits clientReady and waits for the listener, which runs the hooks and registration, to settle. */
async function becomeReady(client: Client): Promise<void> {
  const [listener] = client.listeners('clientReady')
  await listener(client)
}

describe('lifecycle hooks', () => {
  let exit: ReturnType<typeof vi.spyOn>
  let signalListeners: Record<'SIGINT' | 'SIGTERM', NodeJS.SignalsListener[]>

  beforeEach(() => {
    logged.error.length = 0
    logged.warn.length = 0
    exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never)
    signalListeners = {
      SIGINT: process.listeners('SIGINT') as NodeJS.SignalsListener[],
      SIGTERM: process.listeners('SIGTERM') as NodeJS.SignalsListener[],
    }
  })

  afterEach(() => {
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      for (const listener of process.listeners(signal)) {
        if (!signalListeners[signal].includes(listener as NodeJS.SignalsListener)) process.off(signal, listener)
      }
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('onReady', () => {
    it('runs on controllers, listed services and their dependencies, with the client and primary', async () => {
      const loaded = await load()
      const calls: [string, Client, ReadyInfo][] = []

      @loaded.Service()
      class UnusedDependency implements OnReady {
        onReady(client: Client<true>, info: ReadyInfo) {
          calls.push(['dependency', client, info])
        }
      }

      @loaded.Service()
      class Scheduler implements OnReady {
        constructor(readonly dependency: UnusedDependency) {}
        onReady(client: Client<true>, info: ReadyInfo) {
          calls.push(['service', client, info])
        }
      }

      @loaded.Controller()
      class PingController implements OnReady {
        onReady(client: Client<true>, info: ReadyInfo) {
          calls.push(['controller', client, info])
        }
      }

      const { client } = await startApp(loaded, { controllers: [PingController], services: [Scheduler] })
      expect(calls).toEqual([])

      await becomeReady(client)

      expect(calls.map(([who]) => who).sort()).toEqual(['controller', 'dependency', 'service'])
      for (const [, readyClient, info] of calls) {
        expect(readyClient).toBe(client)
        expect(info).toEqual({ primary: true })
      }
    })

    it('logs a hook that throws and still runs the others', async () => {
      const loaded = await load()
      const ran: string[] = []

      @loaded.Service()
      class Broken implements OnReady {
        onReady() {
          throw new Error('boom')
        }
      }

      @loaded.Service()
      class Healthy implements OnReady {
        async onReady() {
          ran.push('healthy')
        }
      }

      const { client } = await startApp(loaded, { controllers: [], services: [Broken, Healthy] })
      await becomeReady(client)

      expect(ran).toEqual(['healthy'])
      expect(logged.error).toContainEqual(['onReady failed in Broken:', new Error('boom')])
    })

    it('runs without waiting for command registration, which never finishes here', async () => {
      const loaded = await load()
      let ready = false

      @loaded.Service()
      class Scheduler implements OnReady {
        onReady() {
          ready = true
        }
      }

      const { client } = await startApp(loaded, { controllers: [], services: [Scheduler] })
      Object.defineProperty(client, 'application', {
        value: { commands: { set: () => new Promise(() => {}) } },
        configurable: true,
      })

      void becomeReady(client)
      await vi.waitFor(() => expect(ready).toBe(true))
    })

    it('still runs when command registration fails', async () => {
      const loaded = await load()
      let ready = false

      @loaded.Service()
      class Scheduler implements OnReady {
        onReady() {
          ready = true
        }
      }

      const { client } = await startApp(loaded, { controllers: [], services: [Scheduler] })
      Object.defineProperty(client, 'application', {
        value: { commands: { set: () => Promise.reject(new Error('registration failed')) } },
        configurable: true,
      })

      await becomeReady(client)

      expect(ready).toBe(true)
    })
  })

  describe('shutdown', () => {
    it('runs every onShutdown hook, then destroys the client, then exits 0', async () => {
      const loaded = await load()
      const order: string[] = []

      @loaded.Service()
      class Scheduler implements OnShutdown {
        async onShutdown() {
          order.push('service')
        }
      }

      @loaded.Controller()
      class PingController implements OnShutdown {
        onShutdown() {
          order.push('controller')
        }
      }

      const { client } = await startApp(loaded, { controllers: [PingController], services: [Scheduler] })
      vi.mocked(client.destroy).mockImplementation(async () => {
        order.push('destroy')
      })
      await becomeReady(client)

      await loaded.shutdownAndExit()

      expect(order.slice(0, 2).sort()).toEqual(['controller', 'service'])
      expect(order[2]).toBe('destroy')
      expect(exit).toHaveBeenCalledWith(0)
    })

    it('runs on SIGINT and SIGTERM', async () => {
      for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        const loaded = await load()
        let stopped = false

        @loaded.Service()
        class Scheduler implements OnShutdown {
          onShutdown() {
            stopped = true
          }
        }

        const { client } = await startApp(loaded, { controllers: [], services: [Scheduler] })
        await becomeReady(client)

        process.emit(signal)

        await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0))
        expect(stopped).toBe(true)
        exit.mockClear()
      }
    })

    it('logs a hook that throws and still exits 0', async () => {
      const loaded = await load()

      @loaded.Service()
      class Broken implements OnShutdown {
        onShutdown() {
          throw new Error('flush failed')
        }
      }

      const { client } = await startApp(loaded, { controllers: [], services: [Broken] })
      await becomeReady(client)

      await loaded.shutdownAndExit()

      expect(logged.error).toContainEqual(['onShutdown failed in Broken:', new Error('flush failed')])
      expect(client.destroy).toHaveBeenCalled()
      expect(exit).toHaveBeenCalledWith(0)
    })

    it('stops waiting for hooks after the timeout and shuts down anyway', async () => {
      const loaded = await load()

      @loaded.Service()
      class Hanging implements OnShutdown {
        onShutdown() {
          return new Promise<void>(() => {})
        }
      }

      const { client } = await startApp(loaded, { controllers: [], services: [Hanging] })
      await becomeReady(client)
      vi.useFakeTimers()

      const done = loaded.shutdownAndExit()
      await vi.advanceTimersByTimeAsync(loaded.SHUTDOWN_HOOK_TIMEOUT_MS)
      await done

      expect(logged.warn.flat().join(' ')).toContain('did not finish')
      expect(client.destroy).toHaveBeenCalled()
      expect(exit).toHaveBeenCalledWith(0)
    })

    it('runs no onShutdown when onReady never ran', async () => {
      const loaded = await load()
      let stopped = false

      @loaded.Service()
      class Scheduler implements OnShutdown {
        onShutdown() {
          stopped = true
        }
      }

      const { client } = await startApp(loaded, { controllers: [], services: [Scheduler] })

      await loaded.shutdownAndExit()

      expect(stopped).toBe(false)
      expect(client.destroy).toHaveBeenCalled()
      expect(exit).toHaveBeenCalledWith(0)
    })

    it('leaves an app whose login failed out of shutdown', async () => {
      const loaded = await load()
      vi.spyOn(loaded.discord.Client.prototype, 'login').mockRejectedValue(new Error('invalid token'))
      const destroy = vi.spyOn(loaded.discord.Client.prototype, 'destroy').mockResolvedValue(undefined)
      const exitCode = process.exitCode

      @loaded.MeoCord({ controllers: [], clientOptions: { intents: [] } })
      class App {}

      try {
        await expect(loaded.MeoCordFactory.create(App).start()).rejects.toThrow('invalid token')
        await loaded.shutdownAndExit()
      } finally {
        process.exitCode = exitCode
      }

      expect(destroy).not.toHaveBeenCalled()
      expect(exit).toHaveBeenCalledWith(0)
    })

    it('exits 1 when the client fails to close', async () => {
      const loaded = await load()
      const { client } = await startApp(loaded, { controllers: [] })
      vi.mocked(client.destroy).mockRejectedValue(new Error('socket stuck'))

      await loaded.shutdownAndExit()

      expect(exit).toHaveBeenCalledWith(1)
    })

    it('forces exit 1 on a second signal while shutdown is running', async () => {
      const loaded = await load()

      @loaded.Service()
      class Hanging implements OnShutdown {
        onShutdown() {
          return new Promise<void>(() => {})
        }
      }

      const { client } = await startApp(loaded, { controllers: [], services: [Hanging] })
      await becomeReady(client)

      void loaded.shutdownAndExit()
      await loaded.shutdownAndExit()

      expect(exit).toHaveBeenCalledWith(1)
    })
  })

  it('adds one pair of signal listeners however many apps start', async () => {
    const loaded = await load()
    const before = process.listenerCount('SIGINT')

    for (let i = 0; i < 12; i++) await startApp(loaded, { controllers: [] })

    expect(process.listenerCount('SIGINT')).toBe(before + 1)
    expect(process.listenerCount('SIGTERM')).toBe(signalListeners.SIGTERM.length + 1)
  })
})
