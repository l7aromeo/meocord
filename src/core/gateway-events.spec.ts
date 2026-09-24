import { vi } from 'vitest'
import {
  Client,
  type ClientOptions,
  GatewayIntentBits,
  type GuildMember,
  Message,
  MessageReaction,
  Partials,
} from 'discord.js'
import { ExecutionContext } from '@src/common/execution-context.js'
import { Controller, Guard, MeoCord, MessageHandler, On, Once, ReactionHandler, Service, UseGuard } from '@src/decorator/index.js'
import { MeoCordFactory } from '@src/core/meocord-factory.js'
import { HandlerRegistry } from '@src/core/handler-registry.js'
import { type GuardInterface } from '@src/interface/index.js'
import { createMockMessage } from '@src/testing/index.js'

const { logged } = vi.hoisted(() => ({ logged: { error: [] as unknown[][], warn: [] as unknown[][] } }))

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
vi.mock('@src/util/meocord-config-loader.util.js', () => ({ loadMeoCordConfig: () => ({ discordToken: 'token' }) }))
vi.mock('@src/util/platform.util.js', () => ({ assertBuiltForThisPlatform: () => {} }))

/** Starts an app built by the factory, with a client that logs in without a network. */
async function startApp(
  options: { controllers?: any[]; services?: any[] },
  clientOptions: ClientOptions = { intents: [] },
): Promise<Client> {
  const clients: Client[] = []
  vi.spyOn(Client.prototype, 'login').mockImplementation(function (this: Client) {
    clients.push(this)
    return Promise.resolve('token')
  })

  @MeoCord({ controllers: options.controllers ?? [], services: options.services, clientOptions })
  class App {}

  await MeoCordFactory.create(App).start()
  return clients[0]
}

/** Emits an event and waits for every listener the app attached for it to settle. */
async function emit(client: Client, event: string, ...args: unknown[]): Promise<void> {
  await Promise.all(client.rawListeners(event).map(listener => (listener as (...a: unknown[]) => unknown)(...args)))
}

const member = { id: 'member-1' } as unknown as GuildMember

describe('gateway event handlers', () => {
  beforeEach(() => {
    logged.error.length = 0
    logged.warn.length = 0
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('runs @On handlers on controllers and services with the event arguments', async () => {
    const seen: [string, unknown][] = []

    @Service()
    class WelcomeService {
      @On('guildMemberAdd')
      greet(joined: GuildMember) {
        seen.push(['service', joined])
      }
    }

    @Controller()
    class AuditController {
      @On('guildMemberAdd')
      record(joined: GuildMember) {
        seen.push(['controller', joined])
      }
    }

    const client = await startApp({ controllers: [AuditController], services: [WelcomeService] })
    await emit(client, 'guildMemberAdd', member)

    expect(seen).toEqual([
      ['service', member],
      ['controller', member],
    ])
  })

  it('resolves a dependency with handlers only when its first event arrives', async () => {
    const constructed = vi.fn()

    @Service()
    class Tracker {
      constructor() {
        constructed()
      }
      @On('guildMemberAdd')
      track() {}
    }

    @Controller()
    class UsesTracker {
      constructor(readonly tracker: Tracker) {}
    }

    const client = await startApp({ controllers: [UsesTracker] })
    expect(constructed).not.toHaveBeenCalled()

    await emit(client, 'guildMemberAdd', member)
    expect(constructed).toHaveBeenCalledTimes(1)
  })

  it('runs an @Once handler for the first event only', async () => {
    const ready = vi.fn()

    @Service()
    class Warmup {
      @Once('clientReady')
      warm() {
        ready()
      }
    }

    const client = await startApp({ services: [Warmup] })
    await emit(client, 'clientReady', client)
    await emit(client, 'clientReady', client)

    expect(ready).toHaveBeenCalledTimes(1)
  })

  it('logs an error against the event and handler, and still runs the other listeners', async () => {
    const ran = vi.fn()

    @Service()
    class Broken {
      @On('guildMemberAdd')
      fail() {
        throw new Error('boom')
      }
    }

    @Service()
    class Healthy {
      @On('guildMemberAdd')
      greet() {
        ran()
      }
    }

    const client = await startApp({ services: [Broken, Healthy] })
    await expect(emit(client, 'guildMemberAdd', member)).resolves.toBeUndefined()

    expect(ran).toHaveBeenCalled()
    expect(logged.error).toContainEqual(['Error handling event "guildMemberAdd" in Broken.fail:', new Error('boom')])
  })

  it('gives a service the app\'s HandlerRegistry, listing the app\'s handlers', async () => {
    let registry: HandlerRegistry | undefined

    @Service()
    class HelpService {
      constructor(handlers: HandlerRegistry) {
        registry = handlers
      }
      @On('guildMemberAdd')
      greet() {}
    }

    await startApp({ services: [HelpService] })

    expect(registry?.list({ kind: 'event' }).map(entry => `${entry.controller.name}.${entry.method}`)).toEqual([
      'HelpService.greet',
    ])
  })

  describe('guards', () => {
    it('runs a class-level guard before an @On handler, with the event arguments and type "event"', async () => {
      const calls: { first: unknown; type: string }[] = []
      const handled = vi.fn()

      @Guard()
      class EventGuard implements GuardInterface {
        constructor(private readonly context: ExecutionContext) {}
        canActivate(first: unknown) {
          calls.push({ first, type: this.context.getType() })
          return false
        }
      }

      @Controller()
      @UseGuard(EventGuard)
      class ModerationController {
        @On('messageCreate')
        watch(_message: Message) {
          handled()
        }
      }

      const client = await startApp({ controllers: [ModerationController] })
      const message = createMockMessage()
      await emit(client, 'messageCreate', message)

      // A message event still reads as an event, not as a @MessageHandler call
      expect(calls).toEqual([{ first: message, type: 'event' }])
      expect(handled).not.toHaveBeenCalled()
    })

    it('runs the guards once for an event whose first argument is not an object', async () => {
      const canActivate = vi.fn(() => true)
      const handled = vi.fn()

      @Guard()
      class CountingGuard implements GuardInterface {
        canActivate = canActivate
      }

      @Service()
      class DebugLog {
        @On('debug')
        @UseGuard(CountingGuard)
        log(info: string) {
          handled(info)
        }
      }

      const client = await startApp({ services: [DebugLog] })
      await emit(client, 'debug', 'heartbeat')

      expect(canActivate).toHaveBeenCalledTimes(1)
      expect(handled).toHaveBeenCalledWith('heartbeat')
    })
  })

  describe('intents and partials', () => {
    it('warns once per missing intent, naming every handler and saying it is privileged', async () => {
      @Service()
      class Welcome {
        @On('guildMemberAdd')
        greet() {}
        @On('guildMemberRemove')
        farewell() {}
      }

      await startApp({ services: [Welcome] }, { intents: [GatewayIntentBits.Guilds] })

      const warnings = logged.warn.map(args => String(args[0])).filter(text => text.includes('GuildMembers'))
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toContain("@On('guildMemberAdd') in Welcome.greet")
      expect(warnings[0]).toContain("@On('guildMemberRemove') in Welcome.farewell")
      expect(warnings[0]).toContain('privileged')
    })

    it('checks @MessageHandler for MessageContent and @ReactionHandler for its partials', async () => {
      @Controller()
      class Chat {
        @MessageHandler('ping')
        ping(_message: Message) {}
        @ReactionHandler('👍')
        like(_reaction: MessageReaction) {}
      }

      await startApp(
        { controllers: [Chat] },
        { intents: [GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions] },
      )

      const warnings = logged.warn.map(args => String(args[0])).join('\n')
      expect(warnings).toContain("MessageContent intent is not in clientOptions.intents, so Discord will not send what @MessageHandler('ping') in Chat.ping")
      expect(warnings).toContain("Partials.Message is not in clientOptions.partials, so @ReactionHandler('👍') in Chat.like")
    })

    it('says nothing when the client options cover every handler', async () => {
      @Controller()
      class Chat {
        @MessageHandler()
        any(_message: Message) {}
        @ReactionHandler()
        react(_reaction: MessageReaction) {}
        @On('guildMemberAdd')
        greet() {}
        @On('clientReady')
        ready() {}
      }

      await startApp(
        { controllers: [Chat] },
        {
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.MessageContent,
          ],
          partials: [Partials.Message, Partials.Reaction],
        },
      )

      expect(logged.warn).toEqual([])
    })
  })
})
