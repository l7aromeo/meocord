import { vi } from 'vitest'
import { ButtonInteraction } from 'discord.js'
import { Logger, Theme, useTheme } from '@src/common/index.js'
import { resetThemeStatics } from '@src/common/theme.js'
import { defaultPresenter } from '@src/common/response/presenter.js'
import { DEFAULT_THEME } from '@src/core/theme-defaults.js'
import { Command, Controller, MeoCord, UseTheme } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { type ResponseContext } from '@src/interface/index.js'
import { createMockInteraction, MeoCordTestingModule } from '@src/testing/index.js'

const read: unknown[] = []

@Controller()
@UseTheme({ colors: { primary: '#000001', danger: '#000002' } })
class Scoped {
  @Command('scoped', CommandType.BUTTON)
  scoped() {
    read.push(Theme.primaryColor, Theme.errorColor)
  }
}

@Controller()
class Plain {
  @Command('plain', CommandType.BUTTON)
  plain() {
    read.push(Theme.primaryColor, Theme.successColor)
  }
}

const press = (customId: string) => createMockInteraction(ButtonInteraction, { customId })
const warnings = () => vi.mocked(Logger.prototype.warn).mock.calls.map(([line]) => String(line))

beforeEach(() => {
  read.length = 0
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
})
afterEach(() => {
  resetThemeStatics()
  vi.restoreAllMocks()
})

describe('Theme, deprecated', () => {
  it("reads MeoCord's default roles outside a call, errorColor as danger", () => {
    const { colors } = DEFAULT_THEME
    expect([Theme.primaryColor, Theme.successColor, Theme.infoColor, Theme.errorColor, Theme.warningColor]).toEqual([
      colors.primary,
      colors.success,
      colors.info,
      colors.danger,
      colors.warning,
    ])
  })

  it('reads the theme of the call it is read in, @UseTheme included', async () => {
    await MeoCordTestingModule.create({ controllers: [Scoped] }).compile().invoke(Scoped, 'scoped', press('scoped'))

    expect(read).toEqual(['#000001', '#000002'])
  })

  it('sets a role beneath every theme an app sets: read back where nothing overrides it', async () => {
    Theme.primaryColor = '#123456'
    Theme.successColor = '#654321'
    @MeoCord({ controllers: [Plain], clientOptions: { intents: [] }, theme: { colors: { success: '#00FF00' } } })
    class App {}

    await MeoCordTestingModule.create({ app: App, controllers: [Plain] }).compile().invoke(Plain, 'plain', press('plain'))

    expect([Theme.primaryColor, useTheme().colors.primary]).toEqual(['#123456', '#123456'])
    // In the app's call: primary from the assignment, success from the app's theme over it
    expect(read).toEqual(['#123456', '#00FF00'])
  })

  it('recolours the default presenter by assignment, as it did in 4.0', () => {
    const context = {} as ResponseContext
    Theme.primaryColor = '#0A0B0C'
    Theme.errorColor = '#0D0E0F'

    expect(defaultPresenter.loading?.(context)).toMatchObject({ color: '#0A0B0C' })
    expect(defaultPresenter.error?.(context, { message: 'x', error: new Error('x') } as never)).toMatchObject({ color: '#0D0E0F' })
  })

  it('warns once for each property set, and never when one is read', () => {
    Theme.primaryColor = '#111111'
    Theme.primaryColor = '#222222'
    Theme.errorColor = '#333333'
    void [Theme.primaryColor, Theme.successColor, Theme.infoColor]

    expect(warnings()).toEqual([
      expect.stringContaining('Theme.primaryColor is deprecated: set colors.primary in @MeoCord({ theme })'),
      expect.stringContaining('Theme.errorColor is deprecated: set colors.danger in @MeoCord({ theme })'),
    ])
  })

  it('never throws on an assignment: a colour that is not one is reported and left unset', () => {
    expect(() => {
      Theme.warningColor = '#GGG' as never
    }).not.toThrow()

    expect(Theme.warningColor).toBe(DEFAULT_THEME.colors.warning)
    expect(warnings()).toContainEqual(expect.stringMatching(/Theme\.warningColor.*#GGG/))
  })
})
