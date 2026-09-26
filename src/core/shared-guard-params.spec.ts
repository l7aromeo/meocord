import { vi } from 'vitest'
import { ButtonInteraction, Client } from 'discord.js'
import { Command, Controller, Guard, MeoCord, UseGuard } from '@src/decorator/index.js'
import { MeoCordFactory } from '@src/core/meocord-factory.js'
import { CommandType } from '@src/enum/index.js'
import { type GuardInterface } from '@src/interface/index.js'
import { createMockInteraction, MeoCordTestingModule } from '@src/testing/index.js'

vi.mock('@src/util/meocord-config-loader.util.js', () => ({ loadMeoCordConfig: () => ({ discordToken: 'token' }) }))
vi.mock('@src/util/platform.util.js', () => ({ assertBuiltForThisPlatform: () => {} }))

const seen: string[] = []
const pause = () => new Promise(resolve => setTimeout(resolve, 5))

@Guard()
class RoleGuard implements GuardInterface {
  declare readonly params?: { role: string }
  role?: string
  checks = 0
  #denied = new Set<string>()

  async canActivate(): Promise<boolean> {
    const before = `${this.role}/${this.params?.role}`
    this.checks++
    await pause()
    seen.push(`${before}->${this.role}/${this.params?.role}`)
    return !this.#denied.has(this.role!)
  }

  deny(role: string) {
    this.#denied.add(role)
  }
}

class Audit {
  constructor(readonly guard: RoleGuard) {}
}
Reflect.defineMetadata('design:paramtypes', [RoleGuard], Audit)

@Controller()
class Panel {
  @Command('admin', CommandType.BUTTON)
  @UseGuard({ provide: RoleGuard, params: { role: 'admin' } })
  async admin() {}

  @Command('mod', CommandType.BUTTON)
  @UseGuard({ provide: RoleGuard, params: { role: 'mod' } })
  async mod() {}

  @Command('open', CommandType.BUTTON)
  @UseGuard(RoleGuard)
  async open() {}
}

const press = (customId: string) => createMockInteraction(ButtonInteraction, { customId })

beforeEach(() => {
  seen.length = 0
})
afterEach(() => vi.restoreAllMocks())

describe('a guard shared as one instance, given params by several handlers', () => {
  it('reads each call\'s own params while calls overlap, bound as a provider', async () => {
    const module = MeoCordTestingModule.create({ controllers: [Panel], providers: [{ provide: RoleGuard, useClass: RoleGuard }] }).compile()

    await Promise.all([module.invoke(Panel, 'admin', press('admin')), module.invoke(Panel, 'mod', press('mod')), module.invoke(Panel, 'open', press('open'))])

    expect(seen.sort()).toEqual(['admin/admin->admin/admin', 'mod/mod->mod/mod', 'undefined/undefined->undefined/undefined'])
  })

  it('reads each call\'s own params in a running app, listed in services', async () => {
    const clients: Client[] = []
    vi.spyOn(Client.prototype, 'login').mockImplementation(function (this: Client) {
      clients.push(this)
      return Promise.resolve('token')
    })
    @MeoCord({ controllers: [Panel], services: [RoleGuard], clientOptions: { intents: [] } })
    class App {}
    await MeoCordFactory.create(App).start()
    const dispatch = (customId: string) =>
      Promise.all(clients[0].rawListeners('interactionCreate').map(listener => (listener as (i: unknown) => unknown)(press(customId))))

    await Promise.all([dispatch('admin'), dispatch('mod')])

    expect(seen.sort()).toEqual(['admin/admin->admin/admin', 'mod/mod->mod/mod'])
  })

  it('stays the one instance a service injects, its own state and private fields shared', async () => {
    const module = MeoCordTestingModule.create({ controllers: [Panel], providers: [{ provide: Audit, useClass: Audit }] }).compile()
    const { guard } = module.get(Audit)
    guard.deny('mod')

    const [admin, mod] = await Promise.all([module.invoke(Panel, 'admin', press('admin')), module.invoke(Panel, 'mod', press('mod'))])

    expect([admin.ran, mod.ran, guard.checks]).toEqual([true, false, 2])
    expect(seen.sort()).toEqual(['admin/admin->admin/admin', 'mod/mod->mod/mod'])
    // Outside a call, the instance keeps what it had before any params were given
    expect([guard.role, guard.params]).toEqual([undefined, undefined])
  })
})

describe('a guard whose instance is frozen or sealed', () => {
  @Guard()
  class FrozenGuard implements GuardInterface {
    constructor() {
      Object.freeze(this)
    }

    canActivate() {
      return true
    }
  }

  @Guard()
  class SealedGuard implements GuardInterface {
    role?: string = undefined

    constructor() {
      Object.seal(this)
    }

    canActivate() {
      seen.push(`sealed ${this.role}`)
      return true
    }
  }

  @Controller()
  class Locked {
    @Command('frozen', CommandType.BUTTON)
    @UseGuard({ provide: FrozenGuard, params: { role: 'admin' } })
    async frozen() {}

    @Command('sealed', CommandType.BUTTON)
    @UseGuard({ provide: SealedGuard, params: { role: 'admin' } })
    async sealed() {}
  }

  const frozenError = 'FrozenGuard cannot take the params its { provide, params } entry gives: its instance is frozen or sealed'

  it('fails the call with an error that says why, made for each call or shared', async () => {
    const perCall = MeoCordTestingModule.create({ controllers: [Locked] }).compile()
    const shared = MeoCordTestingModule.create({ controllers: [Locked], providers: [{ provide: FrozenGuard, useClass: FrozenGuard }] }).compile()

    await expect(perCall.invoke(Locked, 'frozen', press('frozen'))).rejects.toThrow(frozenError)
    await expect(shared.invoke(Locked, 'frozen', press('frozen'))).rejects.toThrow(frozenError)
  })

  it('takes them on a sealed instance that has the property, made for each call or shared', async () => {
    const perCall = MeoCordTestingModule.create({ controllers: [Locked] }).compile()
    const shared = MeoCordTestingModule.create({ controllers: [Locked], providers: [{ provide: SealedGuard, useClass: SealedGuard }] }).compile()

    await perCall.invoke(Locked, 'sealed', press('sealed'))
    await shared.invoke(Locked, 'sealed', press('sealed'))

    expect(seen).toEqual(['sealed admin', 'sealed admin'])
  })
})

describe('shared guards that call each other', () => {
  @Guard()
  class InnerGuard implements GuardInterface {
    level = 'inner-own'

    async canActivate() {
      seen.push(`inner ${this.level}`)
      return true
    }
  }

  @Guard()
  class OuterGuard implements GuardInterface {
    level?: string

    constructor(readonly inner: InnerGuard) {}

    async canActivate() {
      seen.push(`outer ${this.level}`)
      return this.inner.canActivate()
    }
  }
  Reflect.defineMetadata('design:paramtypes', [InnerGuard], OuterGuard)

  @Controller()
  class Composed {
    @Command('inner', CommandType.BUTTON)
    @UseGuard({ provide: InnerGuard, params: { level: 'inner-param' } })
    async inner() {}

    @Command('outer', CommandType.BUTTON)
    @UseGuard({ provide: OuterGuard, params: { level: 'outer-param' } })
    async outer() {}
  }

  it('each read only the params their own entry gives, not those of the guard that calls them', async () => {
    const module = MeoCordTestingModule.create({
      controllers: [Composed],
      providers: [
        { provide: InnerGuard, useClass: InnerGuard },
        { provide: OuterGuard, useClass: OuterGuard },
      ],
    }).compile()

    await module.invoke(Composed, 'inner', press('inner'))
    await module.invoke(Composed, 'outer', press('outer'))

    expect(seen).toEqual(['inner inner-param', 'outer outer-param', 'inner inner-own'])
  })
})
