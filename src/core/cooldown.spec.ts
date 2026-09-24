import { ButtonInteraction, ChatInputCommandInteraction, Message, type MessageReaction } from 'discord.js'
import { vi } from 'vitest'
import { Command, Controller, Cooldown, MessageHandler, On, Once, Pipe, ReactionHandler, UsePipe, Validate } from '@src/decorator/index.js'
import { handlerCooldowns, methodCooldowns } from '@src/core/cooldown-runner.js'
import { CommandType } from '@src/enum/index.js'
import { type PipeInterface, type StandardSchemaV1 } from '@src/interface/index.js'
import { CooldownError, cooldownMessage, CooldownStore, type CooldownLimit, MemoryCooldownStore } from '@src/common/index.js'
import { createChatInputOptions, createMockInteraction, inspectHandler, MeoCordTestingModule } from '@src/testing/index.js'

const ran: string[] = []

const positive: StandardSchemaV1<unknown, { amount: number }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: value =>
      (value as { amount: number }).amount > 0
        ? { value: value as { amount: number } }
        : { issues: [{ message: 'Must be positive', path: ['amount'] }] },
  },
}

@Pipe()
class FailingPipe implements PipeInterface<string, string> {
  transform(): string {
    throw new Error('no such account')
  }
}

const OWNER = 'owner-id'

@Controller()
class DailyController {
  @Command('daily', CommandType.SLASH)
  @Cooldown({ seconds: 10 })
  async daily(_interaction: ChatInputCommandInteraction) {
    ran.push('daily')
  }

  @Command('burst', CommandType.SLASH)
  @Cooldown({ seconds: 3 })
  @Cooldown({ uses: 3, seconds: 60 })
  async burst(_interaction: ChatInputCommandInteraction) {
    ran.push('burst')
  }

  @Command('server', CommandType.SLASH)
  @Cooldown({ seconds: 10, per: 'guild' })
  async server(_interaction: ChatInputCommandInteraction) {
    ran.push('server')
  }

  @Command('everyone', CommandType.SLASH)
  @Cooldown({ seconds: 10, per: 'global' })
  async everyone(_interaction: ChatInputCommandInteraction) {
    ran.push('everyone')
  }

  @Command('room', CommandType.SLASH)
  @Cooldown({ seconds: 10, per: 'channel' })
  async room(_interaction: ChatInputCommandInteraction) {
    ran.push('room')
  }

  @Command('admin', CommandType.SLASH)
  @Cooldown({ seconds: 10, bypass: context => context.getInteraction()?.user.id === OWNER })
  async admin(_interaction: ChatInputCommandInteraction) {
    ran.push('admin')
  }

  @Command('pay', CommandType.SLASH)
  @Validate(positive)
  @Cooldown({ seconds: 10 })
  async pay(_interaction: ChatInputCommandInteraction, _params: { amount: number }) {
    ran.push('pay')
  }

  @Command('lookup/{uid}', CommandType.BUTTON)
  @UsePipe('uid', FailingPipe)
  @Cooldown({ seconds: 10 })
  async lookup(_interaction: ButtonInteraction, _params: { uid: string }) {
    ran.push('lookup')
  }

  @MessageHandler('!hi')
  @Cooldown({ seconds: 10, per: 'channel' })
  async hi(_message: Message) {
    ran.push('hi')
  }
}

const slash = (overrides: { user?: string; guild?: string | null; channel?: string } = {}, options = {}) =>
  createMockInteraction(ChatInputCommandInteraction, {
    user: { id: overrides.user ?? 'ada' } as never,
    guildId: (overrides.guild === undefined ? 'guild-1' : overrides.guild) as never,
    channelId: overrides.channel ?? 'channel-1',
    options: createChatInputOptions(options) as never,
  })

let module: ReturnType<typeof compile>
const compile = () => MeoCordTestingModule.create({ controllers: [DailyController] }).compile()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  ran.length = 0
  module = compile()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('@Cooldown', () => {
  it('blocks a second call within the window, saying how long to wait', async () => {
    await module.invoke(DailyController, 'daily', slash())
    vi.advanceTimersByTime(4_000)

    const blocked = module.invoke(DailyController, 'daily', slash())

    await expect(blocked).rejects.toBeInstanceOf(CooldownError)
    await expect(blocked).rejects.toMatchObject({ retryAfterMs: 6_000, per: 'user', message: 'Slow down: try again in 6s.' })
    expect(ran).toEqual(['daily'])
  })

  it('allows the call again once the window has passed', async () => {
    await module.invoke(DailyController, 'daily', slash())
    vi.advanceTimersByTime(10_000)

    await module.invoke(DailyController, 'daily', slash())

    expect(ran).toEqual(['daily', 'daily'])
  })

  it('counts each user separately by default', async () => {
    await module.invoke(DailyController, 'daily', slash({ user: 'ada' }))
    await module.invoke(DailyController, 'daily', slash({ user: 'bo' }))

    expect(ran).toEqual(['daily', 'daily'])
  })

  it('applies stacked windows together, each sliding on its own', async () => {
    for (const _ of [1, 2, 3]) {
      await module.invoke(DailyController, 'burst', slash())
      vi.advanceTimersByTime(3_000)
    }
    await expect(module.invoke(DailyController, 'burst', slash())).rejects.toMatchObject({ retryAfterMs: 51_000 })

    vi.advanceTimersByTime(51_000)
    await module.invoke(DailyController, 'burst', slash())
    expect(ran).toHaveLength(4)
  })

  describe('scopes', () => {
    it("'guild' counts a server's users together, and each user alone outside a server", async () => {
      await module.invoke(DailyController, 'server', slash({ user: 'ada' }))
      await expect(module.invoke(DailyController, 'server', slash({ user: 'bo' }))).rejects.toMatchObject({ per: 'guild' })

      await module.invoke(DailyController, 'server', slash({ user: 'ada', guild: null }))
      await module.invoke(DailyController, 'server', slash({ user: 'bo', guild: null }))
      expect(ran).toEqual(['server', 'server', 'server'])
    })

    it("'channel' counts a channel's users together", async () => {
      await module.invoke(DailyController, 'room', slash({ user: 'ada', channel: 'a' }))
      await module.invoke(DailyController, 'room', slash({ user: 'bo', channel: 'b' }))
      await expect(module.invoke(DailyController, 'room', slash({ user: 'cy', channel: 'a' }))).rejects.toBeInstanceOf(
        CooldownError,
      )
    })

    it("'global' counts every call together", async () => {
      await module.invoke(DailyController, 'everyone', slash({ user: 'ada', guild: 'g1' }))
      await expect(module.invoke(DailyController, 'everyone', slash({ user: 'bo', guild: 'g2' }))).rejects.toMatchObject({
        per: 'global',
      })
    })
  })

  it('lets a bypassed caller through without spending a use', async () => {
    await module.invoke(DailyController, 'admin', slash({ user: OWNER }))
    await module.invoke(DailyController, 'admin', slash({ user: OWNER }))
    await module.invoke(DailyController, 'admin', slash({ user: 'ada' }))

    expect(ran).toEqual(['admin', 'admin', 'admin'])
  })

  // Counted last, so a caller whose input is refused can fix it and try again at once.
  it('spends nothing on input that fails validation or a pipe', async () => {
    await expect(module.invoke(DailyController, 'pay', slash({}, { amount: 0 }))).rejects.toThrow('Must be positive')
    await module.invoke(DailyController, 'pay', slash({}, { amount: 5 }))

    const click = () => createMockInteraction(ButtonInteraction, { customId: 'lookup/1', user: { id: 'ada' } as never })
    await expect(module.invoke(DailyController, 'lookup', click())).rejects.toThrow('no such account')
    await expect(module.invoke(DailyController, 'lookup', click())).rejects.toThrow('no such account')

    expect(ran).toEqual(['pay'])
  })

  it('limits message handlers too', async () => {
    const message = () =>
      Object.assign(Object.create(Message.prototype) as Message, {
        author: { id: 'ada' },
        guildId: 'g',
        channelId: 'c',
        content: '!hi',
      })

    await module.invoke(DailyController, 'hi', message())
    await expect(module.invoke(DailyController, 'hi', message())).rejects.toBeInstanceOf(CooldownError)
  })

  it('refuses a method-level @Cooldown on a reaction handler at startup', () => {
    @Controller()
    class ReactionController {
      @ReactionHandler('👍')
      @Cooldown({ seconds: 5 })
      async thumbs(_reaction: MessageReaction) {}
    }

    expect(() => MeoCordTestingModule.create({ controllers: [ReactionController] }).compile()).toThrow(
      'ReactionController.thumbs is a reaction handler; @Cooldown applies only to interaction and message handlers',
    )
  })

  it('refuses options it cannot count', () => {
    expect(() => Cooldown({ seconds: 0 })).toThrow('positive number of seconds')
    expect(() => Cooldown({ seconds: 5, uses: 1.5 })).toThrow('whole number of uses')
    expect(() => Cooldown({ seconds: 5, per: 'server' as never })).toThrow("not 'server'")
  })

  it('is reported by inspectHandler, with its defaults', () => {
    expect(inspectHandler(DailyController, 'burst').cooldowns).toEqual([
      { seconds: 3, uses: 1, per: 'user', bypass: false },
      { seconds: 60, uses: 3, per: 'user', bypass: false },
    ])
    expect(inspectHandler(DailyController, 'admin').cooldowns[0].bypass).toBe(true)
  })

  it('applies a controller-level @Cooldown to each handler separately', async () => {
    @Controller()
    @Cooldown({ seconds: 10 })
    class ProfileController {
      @Command('profile', CommandType.SLASH)
      async profile(_interaction: ChatInputCommandInteraction) {
        ran.push('profile')
      }

      @Command('stats', CommandType.SLASH)
      async stats(_interaction: ChatInputCommandInteraction) {
        ran.push('stats')
      }
    }
    const profiles = MeoCordTestingModule.create({ controllers: [ProfileController] }).compile()

    await profiles.invoke(ProfileController, 'profile', slash())
    await profiles.invoke(ProfileController, 'stats', slash())
    await expect(profiles.invoke(ProfileController, 'profile', slash())).rejects.toBeInstanceOf(CooldownError)
    expect(ran).toEqual(['profile', 'stats'])
  })

  it('counts in a store a test provides', async () => {
    const consume = vi.fn(async (_key: string, _limit: CooldownLimit) => ({ allowed: false, retryAfterMs: 2_500 }))
    const stubbed = MeoCordTestingModule.create({
      controllers: [DailyController],
      providers: [{ provide: CooldownStore, useValue: { consume } }],
    }).compile()

    await expect(stubbed.invoke(DailyController, 'daily', slash())).rejects.toMatchObject({ retryAfterMs: 2_500 })
    expect(consume).toHaveBeenCalledWith('DailyController.daily#0:user:user:ada', { uses: 1, windowMs: 10_000 })
  })
})

describe('MemoryCooldownStore', () => {
  // Nothing is awaited between checking and recording, so the last use goes to exactly one call.
  it('lets exactly `uses` of many concurrent calls through', async () => {
    const store = new MemoryCooldownStore()

    const verdicts = await Promise.all(Array.from({ length: 10 }, () => store.consume('k', { uses: 3, windowMs: 1_000 })))

    expect(verdicts.filter(verdict => verdict.allowed)).toHaveLength(3)
  })

  it('drops keys whose calls have all left their window', async () => {
    const store = new MemoryCooldownStore()
    await store.consume('short', { uses: 1, windowMs: 1_000 })
    await store.consume('long', { uses: 1, windowMs: 120_000 })

    vi.advanceTimersByTime(60_000)

    expect(store.size).toBe(1)
  })
})

describe('cooldownMessage', () => {
  it('rounds up to whole seconds, and reads minutes past a minute', () => {
    expect(cooldownMessage(200)).toBe('Slow down: try again in 1s.')
    expect(cooldownMessage(12_000)).toBe('Slow down: try again in 12s.')
    expect(cooldownMessage(125_000)).toBe('Slow down: try again in 2m 5s.')
    expect(cooldownMessage(120_000)).toBe('Slow down: try again in 2m.')
  })
})


describe('classes that share a name', () => {
  // Cooldown counts and @Once tracking are keyed by class name, so two same-named classes would share them.
  const shopWithCooldown = () => {
    @Controller()
    class Shop {
      @Command('buy', CommandType.SLASH)
      @Cooldown({ seconds: 5 })
      async buy(_interaction: ChatInputCommandInteraction) {}
    }
    return Shop
  }
  const plainShop = () => {
    @Controller()
    class Shop {
      @Command('sell', CommandType.SLASH)
      async sell(_interaction: ChatInputCommandInteraction) {}
    }
    return Shop
  }
  const shopWithOnce = () => {
    @Controller()
    class Shop {
      @Once('clientReady')
      async ready() {}
    }
    return Shop
  }

  it('refuse to start when either counts a cooldown', () => {
    expect(() => MeoCordTestingModule.create({ controllers: [shopWithCooldown(), plainShop()] }).compile()).toThrow(
      'Two classes are named Shop, and @Cooldown and @Once tell classes apart by name, so they would share counts. Rename one of them.',
    )
  })

  it('refuse to start when either has a @Once handler', () => {
    expect(() => MeoCordTestingModule.create({ controllers: [plainShop(), shopWithOnce()] }).compile()).toThrow('Two classes are named Shop')
  })

  it('start when neither has a cooldown or a @Once handler', () => {
    expect(() => MeoCordTestingModule.create({ controllers: [plainShop(), plainShop()] }).compile()).not.toThrow()
  })
})

describe('@Cooldown, rule by rule', () => {
  it('finds no cooldowns for a method a class does not have', () => {
    expect(handlerCooldowns(DailyController.prototype, 'missing')).toEqual([])
    expect(methodCooldowns(DailyController.prototype, 'missing')).toEqual([])
  })

  it("applies the class cooldowns from the bound class up to the one declaring the handler, and none above it", () => {
    @Cooldown({ seconds: 1 })
    class Root {
      rooted() {}
    }
    @Cooldown({ seconds: 2 })
    class Middle extends Root {
      declared() {}
    }
    @Cooldown({ seconds: 3 })
    class Leaf extends Middle {}

    expect(handlerCooldowns(Leaf.prototype, 'declared').map(({ seconds }) => seconds)).toEqual([2, 3])
    expect(handlerCooldowns(Leaf.prototype, 'rooted').map(({ seconds }) => seconds)).toEqual([1, 2, 3])
  })

  it('counts under the key of each scope, and a caller without a user as unknown', async () => {
    const keys: string[] = []
    const consume = vi.fn(async (key: string) => {
      keys.push(key)
      return { allowed: true, retryAfterMs: 0 }
    })

    @Controller()
    class Scoped {
      @Command('server', CommandType.SLASH)
      @Cooldown({ seconds: 5, per: 'guild' })
      async server(_interaction: ChatInputCommandInteraction) {}

      @Command('everyone', CommandType.SLASH)
      @Cooldown({ seconds: 5, per: 'global' })
      async everyone(_interaction: ChatInputCommandInteraction) {}

      @MessageHandler('!who')
      @Cooldown({ seconds: 5 })
      async who(_message: Message) {}
    }
    const scoped = MeoCordTestingModule.create({ controllers: [Scoped], providers: [{ provide: CooldownStore, useValue: { consume } }] }).compile()
    const anonymous = Object.assign(Object.create(Message.prototype) as Message, { author: undefined, guildId: 'g', channelId: 'c', content: '!who' })

    await scoped.invoke(Scoped, 'server', slash({ guild: 'g1' }))
    await scoped.invoke(Scoped, 'everyone', slash())
    await scoped.invoke(Scoped, 'who', anonymous)

    expect(keys).toEqual(['Scoped.server#0:guild:guild:g1', 'Scoped.everyone#0:global:global', 'Scoped.who#0:user:user:unknown'])
  })

  it("counts each message author separately by default", async () => {
    @Controller()
    class Greeter {
      @MessageHandler('!hello')
      @Cooldown({ seconds: 10 })
      async hello(_message: Message) {
        ran.push('hello')
      }
    }
    const greeter = MeoCordTestingModule.create({ controllers: [Greeter] }).compile()
    const from = (id: string) => Object.assign(Object.create(Message.prototype) as Message, { author: { id }, guildId: 'g', channelId: 'c', content: '!hello' })

    await greeter.invoke(Greeter, 'hello', from('ada'))
    await greeter.invoke(Greeter, 'hello', from('bo'))

    expect(ran).toEqual(['hello', 'hello'])
  })

  it("never counts a controller's cooldown against its event handlers", async () => {
    @Controller()
    @Cooldown({ seconds: 60 })
    class Members {
      @On('guildMemberAdd')
      greet() {
        ran.push('greet')
      }
    }
    const members = MeoCordTestingModule.create({ controllers: [Members] }).compile()

    await members.emit('guildMemberAdd', {} as never)
    await members.emit('guildMemberAdd', {} as never)

    expect(ran).toEqual(['greet', 'greet'])
  })

  it('refuses no uses, or fewer', () => {
    expect(() => Cooldown({ seconds: 5, uses: 0 })).toThrow('whole number of uses of at least 1, not 0')
    expect(() => Cooldown({ seconds: 5, uses: -2 })).toThrow('not -2')
  })
})

describe('MemoryCooldownStore, sweeping', () => {
  it('keeps a key while any of its calls is inside its window, and drops it the moment the last one leaves', async () => {
    const store = new MemoryCooldownStore()
    const start = Date.now()
    await store.consume('k', { uses: 3, windowMs: 60_000 })
    vi.advanceTimersByTime(50_000)
    await store.consume('k', { uses: 3, windowMs: 60_000 })

    store.sweep(start + 61_000)
    expect(store.size).toBe(1)
    store.sweep(start + 50_000 + 60_000 - 1)
    expect(store.size).toBe(1)
    store.sweep(start + 50_000 + 60_000)
    expect(store.size).toBe(0)
  })

  it('runs one sweeper however many keys it counts', async () => {
    const store = new MemoryCooldownStore()
    const before = vi.getTimerCount()

    for (const key of ['a', 'b', 'c']) await store.consume(key, { uses: 1, windowMs: 1_000 })

    expect(vi.getTimerCount()).toBe(before + 1)
  })
})
