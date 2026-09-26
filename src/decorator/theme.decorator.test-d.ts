import { describe, expectTypeOf, it } from 'vitest'
import { type DeepReadonly, type GuildThemeTarget, type MeoCordTheme, type ThemeOverride, type ThemeResolvers, type UserThemeTarget } from '@src/interface/index.js'
import { type ExecutionContext, ThemeCache, useTheme } from '@src/common/index.js'
import { MeoCord, UseTheme } from '@src/decorator/index.js'

describe('theme types', () => {
  it('reads a whole, readonly theme', () => {
    expectTypeOf(useTheme()).toEqualTypeOf<DeepReadonly<MeoCordTheme>>()
    expectTypeOf<ReturnType<ExecutionContext['getTheme']>>().toEqualTypeOf<DeepReadonly<MeoCordTheme>>()
    const theme = useTheme()
    // @ts-expect-error A resolved theme is readonly: it is shared by every call it applies to
    theme.colors.primary = '#000000'
  })

  it('takes part of a theme in @UseTheme, and nothing unknown', () => {
    UseTheme({ colors: { primary: '#26A042' }, emojis: { loading: '⌛' } })
    // @ts-expect-error A misspelt role beside a real one
    UseTheme({ colors: { primary: '#26A042', primry: '#26A042' } })
    // @ts-expect-error A group the theme does not have
    UseTheme({ fonts: { body: 'serif' } })
  })

  it('takes the app\'s theme in @MeoCord, and nothing unknown', () => {
    MeoCord({ controllers: [], clientOptions: { intents: [] }, theme: { colors: { primary: '#7680F4' } } })
    // @ts-expect-error A group the theme does not have
    MeoCord({ controllers: [], clientOptions: { intents: [] }, theme: { fonts: { body: 'serif' } } })
  })

  it('takes resolvers that return part of a theme, at once or as a promise, and nothing unknown', () => {
    const app = { controllers: [], clientOptions: { intents: [] } }
    MeoCord({ ...app, themeFor: { guild: () => ({ colors: { primary: '#7680F4' } }), user: async () => undefined } })
    MeoCord({ ...app, themeFor: { guild: async ({ guild }) => (guild.id === '1' ? { emojis: { loading: '⌛' } } : undefined) } })
    // @ts-expect-error A resolver the theme has no layer for
    MeoCord({ ...app, themeFor: { server: () => undefined } })
    // @ts-expect-error A misspelt role in what a resolver returns
    MeoCord({ ...app, themeFor: { guild: () => ({ colors: { primry: '#7680F4' } }) } })
    // @ts-expect-error A user resolver is given the user, not the server
    MeoCord({ ...app, themeFor: { user: ({ guild }: { guild: { id: string } }) => (guild.id ? undefined : undefined) } })
    expectTypeOf<Parameters<NonNullable<ThemeResolvers['guild']>>[0]>().toEqualTypeOf<GuildThemeTarget>()
    expectTypeOf<Parameters<NonNullable<ThemeResolvers['user']>>[0]>().toEqualTypeOf<UserThemeTarget>()
    expectTypeOf<ReturnType<NonNullable<ThemeResolvers['guild']>>>().toEqualTypeOf<ThemeOverride | undefined | Promise<ThemeOverride | undefined>>()
  })

  it('clears a server\'s or a user\'s theme with ThemeCache', () => {
    expectTypeOf<ThemeCache['invalidateGuild']>().toEqualTypeOf<(guildId?: string) => void>()
    expectTypeOf<ThemeCache['invalidateUser']>().toEqualTypeOf<(userId?: string) => void>()
  })
})
