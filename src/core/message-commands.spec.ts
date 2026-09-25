import { vi } from 'vitest'
import { Client, type Message } from 'discord.js'
import {
  Catch,
  Controller,
  Cooldown,
  Interceptor,
  MeoCord,
  MessageHandler,
  UseInterceptor,
  Validate,
} from '@src/decorator/index.js'
import { MeoCordFactory } from '@src/core/meocord-factory.js'
import { type ExecutionContext } from '@src/common/index.js'
import {
  type CallHandler,
  type ExceptionFilter,
  type InterceptorInterface,
  type MessageCommandOptions,
  type StandardSchemaV1,
} from '@src/interface/index.js'
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

const BOT_ID = '111'
const calls: [string, ...unknown[]][] = []

/** Starts an app built by the factory, logged in as a bot with id {@link BOT_ID}, without a network. */
async function startApp(options: { controllers: any[]; messages?: MessageCommandOptions; filters?: any[] }): Promise<Client> {
  const clients: Client[] = []
  vi.spyOn(Client.prototype, 'login').mockImplementation(function (this: Client) {
    clients.push(this)
    return Promise.resolve('token')
  })

  @MeoCord({ ...options, clientOptions: { intents: [] } })
  class App {}

  await MeoCordFactory.create(App).start()
  const [client] = clients
  Object.defineProperty(client, 'user', { value: { id: BOT_ID, setActivity: () => {} }, configurable: true })
  return client
}

/** Sends a message with this content and waits for every handler it reaches. */
async function send(client: Client, content: string, author = { bot: false, id: 'user-1' }): Promise<Message> {
  const message = createMockMessage({ content })
  Object.assign(message.author, author)
  await Promise.all(client.rawListeners('messageCreate').map(listener => (listener as (m: unknown) => unknown)(message)))
  return message
}

function schema<Output>(check: (input: Record<string, unknown>) => Output | undefined): StandardSchemaV1<unknown, Output> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: value => {
        const output = check(value as Record<string, unknown>)
        return output === undefined ? { issues: [{ message: 'Invalid', path: ['sides'] }] } : { value: output }
      },
    },
  }
}

const dice = schema<{ sides: number; note?: string }>(({ sides, note }) => {
  const count = Number(sides)
  return Number.isInteger(count) && count > 1 ? { sides: count, note: note as string | undefined } : undefined
})

@Interceptor()
class ParamsRecorder implements InterceptorInterface {
  async intercept(context: ExecutionContext, next: CallHandler) {
    calls.push(['before', context.getHandlerParams()])
    const result = await next.handle()
    calls.push(['after', context.getHandlerParams(), context.getArgs()[1]])
    return result
  }
}

@Controller()
class DiceController {
  @MessageHandler('roll {sides} {note...?}')
  @Validate(dice)
  async roll(_message: Message, params: { sides: number; note?: string }) {
    calls.push(['roll', params])
  }

  @MessageHandler('roll 20')
  async rollTwenty(_message: Message, params: Record<string, string>) {
    calls.push(['rollTwenty', params])
  }

  @MessageHandler('hello', { prefix: false })
  async hello() {
    calls.push(['hello'])
  }

  @MessageHandler('ping')
  async ping() {
    calls.push(['ping'])
  }
}

@Controller()
class ListenerController {
  @MessageHandler()
  async everything(message: Message) {
    calls.push(['listener', message.content])
  }
}

beforeEach(() => {
  calls.length = 0
  logged.error.length = 0
  logged.warn.length = 0
})

afterEach(() => vi.restoreAllMocks())

describe('message commands', () => {
  it('runs only the most specific matching handler, across controllers, then every listener', async () => {
    const client = await startApp({ controllers: [ListenerController, DiceController], messages: { prefix: '!' } })

    await send(client, '!roll 20')
    expect(calls).toEqual([['rollTwenty', {}], ['listener', '!roll 20']])

    calls.length = 0
    await send(client, '!ROLL 6 for luck')
    expect(calls).toEqual([['roll', { sides: 6, note: 'for luck' }], ['listener', '!ROLL 6 for luck']])
  })

  it('still ignores messages from bots and empty messages, listeners included', async () => {
    const client = await startApp({ controllers: [ListenerController, DiceController], messages: { prefix: '!' } })

    await send(client, '!roll 20', { bot: true, id: 'bot-2' })
    await send(client, '   ')
    expect(calls).toEqual([])
  })

  it('applies a configured prefix to a plain keyword, unless the handler sets prefix: false', async () => {
    const client = await startApp({ controllers: [DiceController], messages: { prefix: '!' } })

    await send(client, 'ping')
    await send(client, '!hello')
    expect(calls).toEqual([])

    await send(client, '!ping')
    await send(client, 'Hello')
    expect(calls).toEqual([['ping'], ['hello']])
  })

  it('matches keywords as the whole message, without a prefix, when none is configured', async () => {
    const client = await startApp({ controllers: [DiceController] })

    await send(client, 'PING')
    await send(client, 'ping now')
    expect(calls).toEqual([['ping']])
  })

  it('keeps literal words case-sensitive when the app asks', async () => {
    const client = await startApp({ controllers: [DiceController], messages: { prefix: '!', caseSensitive: true } })

    await send(client, '!PING')
    await send(client, '!ping')
    expect(calls).toEqual([['ping']])
  })

  it('reads the prefixes from a function of the message, which may be async', async () => {
    const prefix = vi.fn(async (message: Message) => (message.guildId === 'g1' ? ['?', '$'] : '!'))
    const client = await startApp({ controllers: [DiceController], messages: { prefix } })

    const inGuild = createMockMessage({ content: '$ping' })
    Object.assign(inGuild, { guildId: 'g1' })
    Object.assign(inGuild.author, { bot: false })
    await Promise.all(client.rawListeners('messageCreate').map(listener => (listener as (m: unknown) => unknown)(inGuild)))
    expect(prefix).toHaveBeenCalledWith(inGuild)

    await send(client, '!ping')
    expect(calls).toEqual([['ping'], ['ping']])
  })

  it('hands a failing prefix function to the global filters, and runs no handler', async () => {
    const failure = new Error('settings are down')
    const caught: unknown[] = []

    @Catch()
    class Recorder implements ExceptionFilter {
      catch(error: unknown) {
        caught.push(error)
      }
    }

    const client = await startApp({
      controllers: [DiceController],
      messages: {
        prefix: () => {
          throw failure
        },
      },
      filters: [Recorder],
    })

    await send(client, '!ping')
    expect(caught).toEqual([failure])
    expect(calls).toEqual([])
  })

  it('treats a message no pattern matches as ordinary chat: no error, no warning, nothing for the filters', async () => {
    const caught: unknown[] = []

    @Catch()
    class Recorder implements ExceptionFilter {
      catch(error: unknown) {
        caught.push(error)
      }
    }

    const client = await startApp({ controllers: [DiceController], messages: { prefix: '!' }, filters: [Recorder] })
    // Only what the messages cause, not the startup warning about intents
    logged.warn.length = 0

    await send(client, '!unknown command')
    await send(client, 'just chatting')
    expect([calls, caught, logged.error, logged.warn]).toEqual([[], [], [], []])
  })

  it('accepts a mention of the bot in place of the prefix when mention is on', async () => {
    const client = await startApp({ controllers: [DiceController], messages: { prefix: '!', mention: true } })

    await send(client, `<@${BOT_ID}> ping`)
    await send(client, `<@!${BOT_ID}>ping`)
    await send(client, '<@999> ping')
    expect(calls).toEqual([['ping'], ['ping']])
  })

  it('validates message params and shows them to every stage through getHandlerParams', async () => {
    @Controller()
    class Recorded {
      @MessageHandler('roll {sides}')
      @UseInterceptor(ParamsRecorder)
      @Validate(dice)
      async roll(_message: Message, params: { sides: number }) {
        calls.push(['roll', params])
      }
    }
    const client = await startApp({ controllers: [Recorded] })

    await send(client, 'roll 6')
    expect(calls).toEqual([
      ['before', { sides: '6' }],
      ['roll', { sides: 6, note: undefined }],
      ['after', { sides: 6, note: undefined }, { sides: 6, note: undefined }],
    ])

    calls.length = 0
    await send(client, 'roll lots')
    expect(calls.map(([name]) => name)).toEqual(['before'])
  })

  it('counts a cooldown apart by a message param', async () => {
    @Controller()
    class Cooled {
      @MessageHandler('vote {option}')
      @Cooldown({ seconds: 60, by: (_context, { option }: { option: string }) => option })
      async vote(_message: Message, { option }: { option: string }) {
        calls.push(['vote', option])
      }
    }
    const client = await startApp({ controllers: [Cooled] })

    await send(client, 'vote a')
    await send(client, 'vote a')
    await send(client, 'vote b')
    expect(calls).toEqual([
      ['vote', 'a'],
      ['vote', 'b'],
    ])
  })
})

describe('message command startup errors', () => {
  const create = (...controllers: any[]) => {
    @MeoCord({ controllers, clientOptions: { intents: [] } })
    class App {}
    return () => MeoCordFactory.create(App)
  }

  it('refuses a pattern that cannot be read, naming the handler', () => {
    @Controller()
    class Broken {
      @MessageHandler('say {text...} now')
      say() {}
    }
    expect(create(Broken)).toThrow(/Broken\.say.*\{text\.\.\.\} takes the rest of the message, so it must be last/)
  })

  it('refuses two handlers whose patterns match the same messages', () => {
    @Controller()
    class First {
      @MessageHandler('roll {sides}')
      roll() {}
    }
    @Controller()
    class Second {
      @MessageHandler('roll {count}')
      roll() {}
    }
    expect(create(First, Second)).toThrow(/match the same messages/)
  })

  it('refuses a messages option of the wrong type where the app is declared', () => {
    const declare = (messages: unknown) => () =>
      MeoCord({ controllers: [], clientOptions: { intents: [] }, messages: messages as MessageCommandOptions })(class App {})

    expect(declare({ prefix: 1 })).toThrow('@MeoCord({ messages: { prefix } }) takes a string, a list of strings, or a function')
    expect(declare({ prefix: ['!', 2] })).toThrow('@MeoCord({ messages: { prefix } })')
    expect(declare({ mention: 'yes' })).toThrow('@MeoCord({ messages: { mention } }) takes true or false.')
    expect(declare({ prefix: ['!', '?'], mention: true, caseSensitive: false })).not.toThrow()
  })

  it('still refuses @Validate on a listener, which has no params', () => {
    @Controller()
    class Listening {
      @MessageHandler()
      @Validate(dice)
      all() {}
    }
    expect(create(Listening)).toThrow(/Listening\.all is a message handler without a pattern/)
  })
})
