import { describe, expectTypeOf, it } from 'vitest'
import { ButtonStyle, type ColorResolvable } from 'discord.js'
import {
  type DeepPartial,
  type DeepReadonly,
  type MeoCordTheme,
  type RootTheme,
  type ThemeButtons,
  type ThemeButtonStyle,
  type ThemeColors,
  type ThemeEmojis,
  type ThemeOverride,
} from '@src/interface/index.js'

/**
 * Runs under `vitest --typecheck`, for an app that augments nothing; `theme-augmented/` checks one that does. The
 * theme APIs take these types as plain parameters, as `root` and `override` do here: inferring a type parameter from
 * the theme would let unknown keys through.
 */

declare function root(theme: RootTheme): void
declare function override(theme: ThemeOverride): void
declare const resolved: DeepReadonly<MeoCordTheme>

describe('MeoCordTheme', () => {
  it('has three groups of roles, each an interface an app can augment', () => {
    expectTypeOf<keyof MeoCordTheme>().toEqualTypeOf<'colors' | 'emojis' | 'buttons'>()
    expectTypeOf<keyof ThemeColors>().toEqualTypeOf<'primary' | 'neutral' | 'success' | 'warning' | 'danger' | 'info'>()
    expectTypeOf<keyof ThemeEmojis>().toEqualTypeOf<'loading' | 'success' | 'warning' | 'danger' | 'info'>()
    expectTypeOf<keyof ThemeButtons>().toEqualTypeOf<'primary' | 'neutral' | 'success' | 'danger'>()
  })

  it('types each token: a colour, an emoji, and one of the four coloured button styles', () => {
    expectTypeOf<ThemeColors['primary']>().toEqualTypeOf<ColorResolvable>()
    expectTypeOf<ThemeEmojis['loading']>().toEqualTypeOf<string>()
    expectTypeOf<ThemeButtonStyle>().toEqualTypeOf<ButtonStyle.Primary | ButtonStyle.Secondary | ButtonStyle.Success | ButtonStyle.Danger>()
    expectTypeOf<ThemeButtons['neutral']>().toEqualTypeOf<ThemeButtonStyle>()
  })
})

describe('the resolved theme', () => {
  it('has every role, and none can be assigned', () => {
    expectTypeOf(resolved.colors.primary).toEqualTypeOf<DeepReadonly<ColorResolvable>>()
    expectTypeOf(resolved.buttons.danger).toEqualTypeOf<ThemeButtonStyle>()
    // @ts-expect-error the resolved theme is shared by every call
    resolved.colors.primary = '#000000'
    // @ts-expect-error at every depth
    resolved.colors = resolved.colors
  })

  it('keeps an RGB colour one token, a readonly tuple', () => {
    expectTypeOf<DeepReadonly<readonly [number, number, number]>>().toEqualTypeOf<readonly [number, number, number]>()
  })
})

describe('RootTheme, for @MeoCord({ theme })', () => {
  it('needs nothing from an app that adds no roles, since MeoCord has a default for each', () => {
    root({})
    root({ colors: { primary: '#7680F4' } })
    root({ colors: { danger: [227, 96, 109] }, emojis: { loading: '<a:loading:123456789012345678>' }, buttons: { neutral: ButtonStyle.Secondary } })
  })

  it('refuses an unknown group, an unknown role and a token of the wrong type', () => {
    // @ts-expect-error no group `sizes`
    root({ sizes: {} })
    // @ts-expect-error no colour role `brand`: an app augments ThemeColors first
    root({ colors: { brand: '#ff0000' } })
    // @ts-expect-error an emoji is a string
    root({ emojis: { success: 1 } })
    // @ts-expect-error a link or premium button has no colour to theme
    root({ buttons: { primary: ButtonStyle.Link } })
  })
})

describe('ThemeOverride, for @UseTheme and the resolvers', () => {
  it('takes any part of the theme', () => {
    override({})
    override({ colors: { warning: 0xb08400 } })
    override({ emojis: { info: 'ℹ️' } })
  })

  it('refuses a typo beside a real key, which a check for any overlap alone would let through', () => {
    // @ts-expect-error `eror` is not a role
    override({ colors: { danger: '#E3606D', eror: '#000000' } })
    // @ts-expect-error nor a group
    override({ colors: { danger: '#E3606D' }, emoji: {} })
  })

  it('is DeepPartial of MeoCordTheme, which leaves arrays and tuples whole', () => {
    expectTypeOf<ThemeOverride>().toEqualTypeOf<DeepPartial<MeoCordTheme>>()
    expectTypeOf<DeepPartial<{ series: string[]; rgb: readonly [number, number, number] }>>().toEqualTypeOf<{
      series?: string[]
      rgb?: readonly [number, number, number]
    }>()
  })
})
