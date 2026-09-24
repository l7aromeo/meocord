import { Container } from 'inversify'
import { ButtonInteraction, ChatInputCommandInteraction, Message } from 'discord.js'
import { vi } from 'vitest'
import { Command, Controller, Guard, MessageHandler, UseGuard } from '@src/decorator/index.js'
import { CommandType, MetadataKey } from '@src/enum/index.js'
import { type GuardInterface } from '@src/interface/index.js'
import { MeoCordApp } from '@src/core/meocord.app.js'
import {
  createChatInputOptions,
  createMockInteraction,
  createMockMessage,
  inspectHandler,
  MeoCordTestingModule,
} from '@src/testing/index.js'

const log: string[] = []

function logGuard(name: string, allow = true) {
  @Guard()
  class LogGuard implements GuardInterface {
    canActivate() {
      log.push(name)
      return allow
    }
  }
  Object.defineProperty(LogGuard, 'name', { value: name })
  return LogGuard
}

const BaseClassGuard = logGuard('base class')
const BaseMethodGuard = logGuard('base method')
const ChildGuard = logGuard('child')
const GrandchildGuard = logGuard('grandchild')
const DenyGuard = logGuard('deny', false)

@Controller()
@UseGuard(BaseClassGuard)
class BaseController {
  @Command('ping', CommandType.SLASH)
  @UseGuard(BaseMethodGuard)
  async ping(_interaction: ChatInputCommandInteraction) {
    log.push('ping')
  }

  @Command('open/{id}', CommandType.BUTTON)
  async open(_interaction: ButtonInteraction, { id }: { id: string }) {
    log.push(`open:${id}`)
  }

  @MessageHandler('hello')
  async hello(_message: Message) {
    log.push('hello')
  }
}

@Controller()
@UseGuard(ChildGuard)
class ChildController extends BaseController {
  @Command('own', CommandType.SLASH)
  async own(_interaction: ChatInputCommandInteraction) {
    log.push('own')
  }
}

@Controller()
@UseGuard(GrandchildGuard)
class GrandchildController extends ChildController {}

@Controller()
@UseGuard(DenyGuard)
class DenyingChildController extends BaseController {}

function createClient() {
  const listeners = new Map<string, ((...args: any[]) => Promise<void>)[]>()
  return {
    on: vi.fn((event: string, handler: (...args: any[]) => Promise<void>) => {
      listeners.set(event, [...(listeners.get(event) ?? []), handler])
    }),
    login: vi.fn().mockResolvedValue('token'),
    user: { setActivity: vi.fn() },
    application: null,
    emit: (event: string, ...args: unknown[]) => Promise.all((listeners.get(event) ?? []).map(h => h(...args))),
  }
}

async function startApp(controller: new () => object) {
  const container = new Container()
  container.bind(controller).toSelf().inSingletonScope()
  Reflect.defineMetadata(MetadataKey.Container, container, controller)
  const client = createClient()
  await new MeoCordApp([controller], container, client as any, 'token').start()
  return { container, client }
}

const slash = (commandName: string) => {
  const interaction = createMockInteraction(ChatInputCommandInteraction, { commandName })
  interaction.options = createChatInputOptions({})
  return interaction
}

describe('class-level @UseGuard on inherited handlers', () => {
  beforeEach(() => {
    log.length = 0
  })

  it('guards an inherited handler under dispatch, subclass guards first', async () => {
    const { client } = await startApp(ChildController)

    await client.emit('interactionCreate', slash('ping'))
    expect(log).toEqual(['child', 'base class', 'base method', 'ping'])
  })

  it('guards inherited component and message handlers', async () => {
    const { client } = await startApp(ChildController)

    await client.emit('interactionCreate', createMockInteraction(ButtonInteraction, { customId: 'open/7' }))
    const message = createMockMessage()
    Object.assign(message, { content: 'hello' })
    Object.assign(message.author, { bot: false })
    await client.emit('messageCreate', message)

    expect(log).toEqual(['child', 'base class', 'open:7', 'child', 'base class', 'hello'])
  })

  it('stops an inherited handler when the subclass guard denies', async () => {
    const { client } = await startApp(DenyingChildController)

    await client.emit('interactionCreate', slash('ping'))
    expect(log).toEqual(['deny'])
  })

  it('applies every level of a deeper hierarchy, outermost class first', async () => {
    const { client } = await startApp(GrandchildController)

    await client.emit('interactionCreate', slash('own'))
    await client.emit('interactionCreate', slash('ping'))

    expect(log).toEqual(['grandchild', 'child', 'own', 'grandchild', 'child', 'base class', 'base method', 'ping'])
  })

  it('runs the same guards, once each, on a direct call and under invoke', async () => {
    const module = MeoCordTestingModule.create({ controllers: [ChildController] }).compile()

    await module.get(ChildController).ping(slash('ping'))
    await module.invoke(ChildController, 'ping', slash('ping'))

    const run = ['child', 'base class', 'base method', 'ping']
    expect(log).toEqual([...run, ...run])
  })

  it('leaves the base controller guarded as before', async () => {
    const { client } = await startApp(BaseController)

    await client.emit('interactionCreate', slash('ping'))
    expect(log).toEqual(['base class', 'base method', 'ping'])
  })

  it('reports the guards in the order they run', () => {
    expect(inspectHandler(ChildController, 'ping').guards).toEqual([ChildGuard, BaseClassGuard, BaseMethodGuard])
    expect(inspectHandler(BaseController, 'ping').guards).toEqual([BaseClassGuard, BaseMethodGuard])
    expect(Reflect.getMetadata(MetadataKey.Guards, GrandchildController.prototype, 'open')).toEqual([
      GrandchildGuard,
      ChildGuard,
      BaseClassGuard,
    ])
  })
})
