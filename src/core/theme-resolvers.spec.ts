import { vi } from 'vitest'
import { ButtonInteraction, type Message, type MessageReaction } from 'discord.js'
import {
  Catch,
  Command,
  Controller,
  Defer,
  Guard,
  MeoCord,
  MessageHandler,
  ReactionHandler,
  Service,
  UseGuard,
  UseTheme,
} from '@src/decorator/index.js'
import { Logger, ThemeCache, useTheme } from '@src/common/index.js'
import { CommandType } from '@src/enum/index.js'
import { type ExceptionFilter, type GuildThemeTarget, type ThemeOverride, type ThemeResolvers } from '@src/interface/index.js'
import { DEFAULT_THEME } from '@src/core/theme-defaults.js'
import { createMockInteraction, createMockMessage, createMockUser, MeoCordTestingModule } from '@src/testing/index.js'

const seen: unknown[] = []
const primary = () => useTheme().colors.primary
const GUILD = '100000000000000001'
const OTHER_GUILD = '100000000000000002'
const USER = '200000000000000001'
const OTHER_USER = '200000000000000002'

/** A button pressed by `userId` in `guildId`, or in a DM without one. */
function press(customId: string, { guildId, userId = USER }: { guildId?: string | null; userId?: string } = {}) {
  const interaction = createMockInteraction(ButtonInteraction, { customId })
  Object.assign(interaction, { guildId: guildId === undefined ? GUILD : guildId })
  Object.assign(interaction.user, { id: userId })
  return interaction
}

const colour = (primary: `#${string}`): ThemeOverride => ({ colors: { primary } })
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

@Guard()
class RecordsTheme {
  canActivate() {
    seen.push(['guard', primary()])
    return true
  }
}

@Controller()
class Panel {
  @Command('panel', CommandType.BUTTON)
  @UseGuard(RecordsTheme)
  panel() {
    seen.push(['handler', primary(), useTheme().colors.info, useTheme().colors.success])
  }

  @Command('themed', CommandType.BUTTON)
  @UseTheme({ colors: { primary: '#00000A', info: '#00000B', success: '#00000C' } })
  themed() {
    seen.push(['themed', primary(), useTheme().colors.info, useTheme().colors.success])
  }

  @Command('deferred', CommandType.BUTTON)
  @Defer({ mode: 'eager' })
  deferred() {
    seen.push(['deferred', primary()])
  }
}

/** A testing module whose app looks themes up with `themeFor`. */
function moduleWith(themeFor: ThemeResolvers, extra: { themeCache?: object; themeForTimeoutMs?: number; controllers?: any[]; filters?: any[] } = {}) {
  const controllers = extra.controllers ?? [Panel]
  @MeoCord({ controllers, clientOptions: { intents: [] }, themeFor, ...extra } as never)
  class App {}
  return MeoCordTestingModule.create({ app: App, controllers }).compile()
}

beforeEach(() => {
  seen.length = 0
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('the layers themeFor adds', () => {
  it('puts the server\'s theme over the handler\'s and the user\'s over the server\'s, before the guards', async () => {
    const module = moduleWith({
      guild: async () => ({ colors: { primary: '#00000D', info: '#00000E' } }),
      user: () => colour('#00000F'),
    })

    await module.invoke(Panel, 'panel', press('panel'))
    await module.invoke(Panel, 'themed', press('themed'))

    expect(seen).toEqual([
      ['guard', '#00000F'],
      ['handler', '#00000F', '#00000E', DEFAULT_THEME.colors.success],
      // A handler's @UseTheme is beneath the server's and the user's
      ['themed', '#00000F', '#00000E', '#00000C'],
    ])
  })

  it('applies a user\'s theme in a DM, where no server theme is asked for', async () => {
    const guild = vi.fn(() => colour('#000010'))
    const module = moduleWith({ guild, user: () => colour('#000011') })

    await module.invoke(Panel, 'panel', press('panel', { guildId: null }))

    expect(guild).not.toHaveBeenCalled()
    expect(seen).toContainEqual(['handler', '#000011', DEFAULT_THEME.colors.info, DEFAULT_THEME.colors.success])
  })

  it('gives overlapping calls from two users in one server each their own theme', async () => {
    const module = moduleWith({
      guild: () => ({ colors: { info: '#000012' } }),
      user: async ({ user }) => {
        await pause(user.id === USER ? 10 : 1)
        return colour(user.id === USER ? '#000013' : '#000014')
      },
    })

    await Promise.all([module.invoke(Panel, 'panel', press('panel')), module.invoke(Panel, 'panel', press('panel', { userId: OTHER_USER }))])

    expect(seen.filter(entry => (entry as string[])[0] === 'handler').sort()).toEqual([
      ['handler', '#000013', '#000012', DEFAULT_THEME.colors.success],
      ['handler', '#000014', '#000012', DEFAULT_THEME.colors.success],
    ])
  })

  it('finds the server and user of a message and of a reaction', async () => {
    @Controller()
    class Talk {
      @MessageHandler('hi')
      hi(_message: Message) {
        seen.push(['message', primary(), useTheme().colors.info])
      }

      @ReactionHandler('👍')
      thumbs() {
        seen.push(['reaction', primary(), useTheme().colors.info])
      }
    }
    const module = moduleWith(
      { guild: ({ guild }) => ({ colors: { info: guild.id === GUILD ? '#000015' : '#000016' } }), user: ({ user }) => (user.id === USER ? colour('#000017') : undefined) },
      { controllers: [Talk] },
    )
    const message = createMockMessage({ content: 'hi' })
    Object.assign(message, { guildId: GUILD })
    Object.assign(message.author, { id: USER })
    const reacted = createMockMessage({ content: 'target' })
    Object.assign(reacted, { guildId: OTHER_GUILD })
    const reaction = { emoji: { name: '👍' }, message: reacted, partial: false } as unknown as MessageReaction
    const reactor = createMockUser()
    Object.assign(reactor, { id: USER })

    await module.invoke(Talk, 'hi', message as never)
    await module.invoke(Talk, 'thumbs', reaction as never, { user: reactor, action: 'ADD' } as never)

    expect(seen).toEqual([
      ['message', '#000017', '#000015'],
      ['reaction', '#000017', '#000016'],
    ])
  })

  it('reaches the global filters of an error no route took with the server\'s and user\'s themes', async () => {
    @Catch()
    class Records implements ExceptionFilter {
      catch() {
        seen.push(['filter', primary()])
      }
    }
    const module = moduleWith({ guild: () => colour('#000018') }, { filters: [Records] })

    await module.dispatch(press('nowhere'))

    expect(seen).toEqual([['filter', '#000018']])
  })

  it('does not hold @Defer\'s acknowledgement for a lookup still in flight', async () => {
    let answer!: (theme: ThemeOverride) => void
    const module = moduleWith({ guild: () => new Promise<ThemeOverride>(resolve => (answer = resolve)) })
    const interaction = press('deferred')

    const call = module.invoke(Panel, 'deferred', interaction)
    await pause(5)
    // A button is acknowledged with deferUpdate
    const acknowledgedFirst = vi.mocked(interaction.deferUpdate).mock.calls.length + vi.mocked(interaction.deferReply).mock.calls.length
    answer(colour('#000019'))
    await call

    expect(acknowledgedFirst).toBe(1)
    expect(seen).toEqual([['deferred', '#000019']])
  })
})

describe('the cache of themeFor\'s results', () => {
  it('looks each server and user up once, for calls in flight and after, and both at the same time', async () => {
    const guild = vi.fn(async () => {
      await pause(40)
      return colour('#00001A')
    })
    const user = vi.fn(async (): Promise<ThemeOverride> => {
      await pause(40)
      return { colors: { info: '#00001B' } }
    })
    const module = moduleWith({ guild, user })

    const started = performance.now()
    await Promise.all(Array.from({ length: 50 }, () => module.invoke(Panel, 'panel', press('panel'))))
    const tookMs = performance.now() - started
    await module.invoke(Panel, 'panel', press('panel'))

    expect([guild.mock.calls.length, user.mock.calls.length]).toEqual([1, 1])
    // The two lookups ran together: about 40 ms, not 80
    expect(tookMs).toBeLessThan(75)
    expect(seen.filter(entry => (entry as string[])[0] === 'handler')).toHaveLength(51)
  })

  it('looks a result up again once it expires, and drops the oldest past the limit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
    const guild = vi.fn(({ guild: { id } }: { guild: { id: string } }) => colour(id === GUILD ? '#00001C' : '#00001D'))
    const module = moduleWith({ guild }, { themeCache: { ttlSeconds: 60, maxGuilds: 1 } })

    await module.invoke(Panel, 'panel', press('panel'))
    await module.invoke(Panel, 'panel', press('panel'))
    vi.advanceTimersByTime(61_000)
    await module.invoke(Panel, 'panel', press('panel'))
    // A second server over the limit of one drops the first, which is then looked up again
    await module.invoke(Panel, 'panel', press('panel', { guildId: OTHER_GUILD }))
    await module.invoke(Panel, 'panel', press('panel'))

    expect(guild.mock.calls.map(([target]) => target.guild.id)).toEqual([GUILD, GUILD, OTHER_GUILD, GUILD])
  })

  it('forgets a server\'s or a user\'s result when told, and keeps no lookup that was in flight then', async () => {
    @Service()
    class Settings {
      constructor(readonly themes: ThemeCache) {}
    }
    Reflect.defineMetadata('design:paramtypes', [ThemeCache], Settings)
    let guildColour: `#${string}` = '#00001E'
    const guild = vi.fn(async (_target: GuildThemeTarget) => {
      await pause(5)
      return colour(guildColour)
    })
    const user = vi.fn((): ThemeOverride => ({ colors: { info: '#00001F' } }))
    @MeoCord({ controllers: [Panel], clientOptions: { intents: [] }, themeFor: { guild, user }, providers: [{ provide: Settings, useClass: Settings }] })
    class App {}
    const module = MeoCordTestingModule.create({ app: App, controllers: [Panel], providers: [{ provide: Settings, useClass: Settings }] }).compile()
    await module.init()
    const { themes } = module.get(Settings)

    await module.invoke(Panel, 'panel', press('panel'))
    // Invalidated while its lookup is in flight: the old colour it finds is not kept
    const inFlight = module.invoke(Panel, 'panel', press('panel', { guildId: OTHER_GUILD }))
    await vi.waitFor(() => expect(guild).toHaveBeenCalledTimes(2))
    themes.invalidateGuild(OTHER_GUILD)
    await inFlight
    guildColour = '#000020'
    themes.invalidateGuild(GUILD)
    await module.invoke(Panel, 'panel', press('panel'))
    await module.invoke(Panel, 'panel', press('panel', { guildId: OTHER_GUILD }))
    themes.invalidateUser()
    await module.invoke(Panel, 'panel', press('panel'))

    expect(guild.mock.calls.map(([target]) => target.guild.id)).toEqual([GUILD, OTHER_GUILD, GUILD, OTHER_GUILD])
    expect(user).toHaveBeenCalledTimes(2)
    expect(seen.filter(entry => (entry as string[])[0] === 'handler').map(entry => (entry as string[])[1])).toEqual([
      '#00001E',
      '#00001E',
      '#000020',
      '#000020',
      '#000020',
    ])
  })

  it('does nothing when made by hand, with no app to clear', () => {
    expect(() => new ThemeCache().invalidateGuild('1')).not.toThrow()
  })
})

describe('a resolver that fails', () => {
  it('leaves its theme out, logs once until it answers again, and is not asked again for a while', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
    const errors = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    const logs = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    let failing = true
    const guild = vi.fn(() => {
      if (failing) throw new Error('database down')
      return colour('#000021')
    })
    const module = moduleWith({ guild, user: () => ({ colors: { info: '#000022' } }) })

    await module.invoke(Panel, 'panel', press('panel'))
    await module.invoke(Panel, 'panel', press('panel', { guildId: OTHER_GUILD }))
    await module.invoke(Panel, 'panel', press('panel'))
    vi.advanceTimersByTime(10_001)
    failing = false
    await module.invoke(Panel, 'panel', press('panel'))

    // The first server twice, then again after the backoff; the second once
    expect(guild).toHaveBeenCalledTimes(3)
    expect(seen.filter(entry => (entry as string[])[0] === 'handler')).toEqual([
      ['handler', DEFAULT_THEME.colors.primary, '#000022', DEFAULT_THEME.colors.success],
      ['handler', DEFAULT_THEME.colors.primary, '#000022', DEFAULT_THEME.colors.success],
      ['handler', DEFAULT_THEME.colors.primary, '#000022', DEFAULT_THEME.colors.success],
      ['handler', '#000021', '#000022', DEFAULT_THEME.colors.success],
    ])
    // Once for each server whose lookups started failing, and once when the first answers again
    expect(errors.mock.calls.filter(([text]) => String(text).includes('themeFor.guild'))).toEqual([
      [expect.stringContaining(`themeFor.guild for guild ${GUILD} failed: database down. Its calls use the theme without it`)],
      [expect.stringContaining(`themeFor.guild for guild ${OTHER_GUILD} failed: database down`)],
    ])
    expect(logs).toHaveBeenCalledWith(expect.stringContaining(`themeFor.guild for guild ${GUILD} answers again, after 1 failed lookup(s)`))
  })

  it('logs a server whose lookups keep failing once, and never a healthy one beside it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
    const errors = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    const logs = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {})
    const module = moduleWith(
      {
        guild: ({ guild }) => {
          if (guild.id === GUILD) throw new Error('bad row')
          return colour('#000041')
        },
      },
      { themeCache: { ttlSeconds: 1 } },
    )

    for (let round = 0; round < 3; round++) {
      await module.invoke(Panel, 'panel', press('panel'))
      await module.invoke(Panel, 'panel', press('panel', { guildId: OTHER_GUILD }))
      vi.advanceTimersByTime(10_001)
    }

    expect(errors.mock.calls.map(([text]) => String(text))).toEqual([expect.stringContaining(`themeFor.guild for guild ${GUILD} failed: bad row`)])
    expect(logs.mock.calls.filter(([text]) => String(text).includes('answers again'))).toEqual([])
  })

  it('gives up waiting after themeForTimeoutMs, and the call goes on', async () => {
    const errors = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {})
    const module = moduleWith({ guild: () => new Promise<ThemeOverride>(() => {}) }, { themeForTimeoutMs: 20 })

    const started = performance.now()
    await module.invoke(Panel, 'panel', press('panel'))

    expect(performance.now() - started).toBeLessThan(200)
    expect(seen).toContainEqual(['handler', DEFAULT_THEME.colors.primary, DEFAULT_THEME.colors.info, DEFAULT_THEME.colors.success])
    expect(errors).toHaveBeenCalledWith(expect.stringContaining(`themeFor.guild for guild ${GUILD} did not answer within 20 ms`))
  })

  it('leaves out a result that is not a valid theme, warning once for the server', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance', 'Date'] })
    const module = moduleWith({ guild: () => colour('#GGG' as `#${string}`) }, { themeCache: { ttlSeconds: 1 } })

    await module.invoke(Panel, 'panel', press('panel'))
    vi.advanceTimersByTime(1_001)
    await module.invoke(Panel, 'panel', press('panel'))

    expect(seen.filter(entry => (entry as string[])[0] === 'handler').map(entry => (entry as string[])[1])).toEqual([
      DEFAULT_THEME.colors.primary,
      DEFAULT_THEME.colors.primary,
    ])
    const warnings = warn.mock.calls.filter(([text]) => String(text).includes(`themeFor.guild for guild ${GUILD}`))
    expect(warnings).toHaveLength(1)
    expect(String(warnings[0][0])).toContain('theme.colors.primary')
  })
})

describe('a resolver with no theme to give', () => {
  it('returns null or undefined, as a database does for a missing row, and nothing is warned about', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    const module = moduleWith({ guild: async () => null, user: () => undefined })

    await module.invoke(Panel, 'panel', press('panel'))

    expect(seen).toContainEqual(['handler', DEFAULT_THEME.colors.primary, DEFAULT_THEME.colors.info, DEFAULT_THEME.colors.success])
    expect(warn).not.toHaveBeenCalled()
  })
})

describe('a result that is not a plain object', () => {
  it('is left out with a warning rather than becoming the theme, and @MeoCord refuses one too', async () => {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {})
    class Row {
      colors = { primary: '#000031' }
    }
    class Colours {
      primary = '#000032'
    }
    const module = moduleWith({ guild: () => new Row() as never, user: () => ({ colors: new Colours() }) as never })

    await module.invoke(Panel, 'panel', press('panel'))

    expect(seen).toContainEqual(['handler', DEFAULT_THEME.colors.primary, DEFAULT_THEME.colors.info, DEFAULT_THEME.colors.success])
    const warnings = warn.mock.calls.map(([text]) => String(text))
    expect(warnings).toEqual([
      expect.stringContaining(`themeFor.guild for guild ${GUILD}: theme must be a plain object of groups (got a Row): return a plain object`),
      expect.stringContaining(`themeFor.user for user ${USER}: theme.colors must be a plain object of roles (got a Colours)`),
    ])
    expect(() => {
      @MeoCord({ controllers: [], clientOptions: { intents: [] }, theme: new Row() as never })
      class FromRow {}
      return FromRow
    }).toThrow('@MeoCord({ theme }) on FromRow: theme must be a plain object of groups (got a Row)')
  })
})

describe('@MeoCord\'s theme options', () => {
  const declare = (options: object) => () => {
    @MeoCord({ controllers: [], clientOptions: { intents: [] }, ...options } as never)
    class Checked {}
    return Checked
  }

  it('refuses a resolver it does not know, one that is not a function, and cache options out of range', () => {
    expect(declare({ themeFor: { server: () => undefined } })).toThrow("@MeoCord({ themeFor }) on Checked has no resolver 'server'")
    expect(declare({ themeFor: { guild: 'blue' } })).toThrow('@MeoCord({ themeFor }) on Checked: guild must be a function')
    expect(declare({ themeCache: { maxGuilds: 0 } })).toThrow('@MeoCord({ themeCache }) on Checked: maxGuilds must be a whole number above 0')
    expect(declare({ themeCache: { ttl: 5 } })).toThrow("@MeoCord({ themeCache }) on Checked has no option 'ttl'")
    expect(declare({ themeForTimeoutMs: -1 })).toThrow('@MeoCord({ themeForTimeoutMs }) on Checked must be a number of milliseconds above 0')
    // Past setTimeout's limit, Node would wait 1 ms and time every lookup out at once
    expect(declare({ themeForTimeoutMs: 3_000_000_000 })).toThrow('and at most 2147483647 (got 3000000000)')
    expect(declare({ themeForTimeoutMs: 2_147_483_647 })).not.toThrow()
  })
})
