import { describe, expectTypeOf, it } from 'vitest'
import { type DeepReadonly, type MeoCordTheme } from '@src/interface/index.js'
import { type ExecutionContext, useTheme } from '@src/common/index.js'
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
})
