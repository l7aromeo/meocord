import { ButtonInteraction, ChatInputCommandInteraction } from 'discord.js'
import { Command, Controller, Guard, Service, UseGuard } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { type GuardInterface } from '@src/interface/index.js'
import { createMetadata, ExecutionContext } from '@src/common/index.js'
import { createMockInteraction, MeoCordTestingModule } from '@src/testing/index.js'

const log: string[] = []
const Label = createMetadata<string>('label')

@Guard()
class AllowA implements GuardInterface {
  canActivate() {
    log.push('A')
    return true
  }
}

@Guard()
class AllowB implements GuardInterface {
  canActivate() {
    log.push('B')
    return true
  }
}

@Guard()
class Deny implements GuardInterface {
  canActivate() {
    log.push('deny')
    return false
  }
}

@Guard()
class ContextGuard implements GuardInterface {
  constructor(private readonly context: ExecutionContext) {}

  canActivate() {
    log.push(`context:${this.context.get(Label)}:${this.context.getParams()?.min}`)
    return true
  }
}

@Service()
class GreetingService {
  readonly greeted: string[] = []

  greet(name: string) {
    this.greeted.push(name)
  }
}

@Controller()
@UseGuard(AllowA)
class GreetingController {
  constructor(private readonly greetings: GreetingService) {}

  @Command('greet', CommandType.SLASH)
  @UseGuard(AllowB)
  async greet(_interaction: ChatInputCommandInteraction, { name }: { name: string }) {
    log.push('greet')
    this.greetings.greet(name)
  }

  @Command('denied', CommandType.SLASH)
  @UseGuard(AllowB, Deny, AllowB)
  async denied(_interaction: ChatInputCommandInteraction) {
    log.push('denied')
  }

  @Command('context', CommandType.SLASH)
  @Label('method label')
  @UseGuard({ provide: ContextGuard, params: { min: 1 } })
  async context(_interaction: ChatInputCommandInteraction) {
    log.push('context')
  }

  @Command('outer', CommandType.SLASH)
  async outer(interaction: ChatInputCommandInteraction) {
    log.push('outer')
    await this.inner(interaction)
  }

  @UseGuard(Deny)
  async inner(_interaction: ChatInputCommandInteraction) {
    log.push('inner')
  }

  @Command('fails', CommandType.SLASH)
  async fails(_interaction: ChatInputCommandInteraction) {
    throw new Error('handler failed')
  }
}

@Controller()
@UseGuard(AllowA)
class BaseButtonController {
  @Command('refresh', CommandType.BUTTON)
  @UseGuard(AllowB)
  async refresh(_interaction: ButtonInteraction) {
    log.push('refresh')
  }
}

@Controller()
class ProfileButtonController extends BaseButtonController {
  @Command('profile/{id}', CommandType.BUTTON)
  @UseGuard(AllowB)
  async profile(_interaction: ButtonInteraction, { id }: { id: string }) {
    log.push(`profile:${id}`)
  }
}

const slash = () => createMockInteraction(ChatInputCommandInteraction)
const compile = () =>
  MeoCordTestingModule.create({ controllers: [GreetingController, ProfileButtonController] }).compile()

describe('TestingModule.invoke', () => {
  beforeEach(() => {
    log.length = 0
  })

  it('runs class guards, then method guards, once each, then the handler', async () => {
    const module = compile()
    const outcome = await module.invoke(GreetingController, 'greet', slash(), { name: 'Alice' })

    expect(log).toEqual(['A', 'B', 'greet'])
    expect(outcome).toEqual({ ran: true })
    expect(module.get(GreetingService).greeted).toEqual(['Alice'])
  })

  it('stops at the first guard that denies, without running the handler', async () => {
    const outcome = await compile().invoke(GreetingController, 'denied', slash())

    expect(log).toEqual(['A', 'B', 'deny'])
    expect(outcome).toEqual({ ran: false })
  })

  it('resolves guards from the module, so overrideGuard stubs apply', async () => {
    const module = MeoCordTestingModule.create({ controllers: [GreetingController] })
      .overrideGuard(Deny)
      .useValue({ canActivate: () => true })
      .compile()

    await module.invoke(GreetingController, 'denied', slash())
    expect(log).toEqual(['A', 'B', 'B', 'denied'])
  })

  it('gives guards that inject ExecutionContext the call context', async () => {
    await compile().invoke(GreetingController, 'context', slash())
    expect(log).toEqual(['A', 'context:method label:1', 'context'])
  })

  it('runs the guards of a guarded method the handler calls directly', async () => {
    await compile().invoke(GreetingController, 'outer', slash())
    expect(log).toEqual(['A', 'outer', 'deny'])
  })

  it('leaves no pass behind, so a later direct call with the same interaction runs its guards', async () => {
    const module = compile()
    const interaction = slash()

    await module.invoke(GreetingController, 'greet', interaction, { name: 'Alice' })
    log.length = 0
    await module.get(GreetingController).greet(interaction, { name: 'Bob' })

    expect(log).toEqual(['A', 'B', 'greet'])
  })

  it('runs an inherited handler with the guards it was declared with', async () => {
    const button = createMockInteraction(ButtonInteraction)

    await compile().invoke(ProfileButtonController, 'refresh', button)
    await compile().invoke(ProfileButtonController, 'profile', button, { id: '42' })

    expect(log).toEqual(['A', 'B', 'refresh', 'B', 'profile:42'])
  })

  it('rejects with the error the handler throws', async () => {
    await expect(compile().invoke(GreetingController, 'fails', slash())).rejects.toThrow('handler failed')
  })

  it('rejects a controller the module was not created with', async () => {
    const module = MeoCordTestingModule.create({ controllers: [ProfileButtonController] }).compile()

    await expect(module.invoke(GreetingController, 'denied', slash())).rejects.toThrow(
      'GreetingController is not a controller of this testing module',
    )
  })
})
