import { expectTypeOf } from 'vitest'
import { type RootTheme } from '@src/interface/index.js'

/** An app that takes a name MeoCord reserves for a role of its own, in two groups. Checked by `bun run lint`. */
declare module '@src/interface/index.js' {
  interface ThemeColors {
    accent: string
  }
  interface ThemeEmojis {
    brand: string
  }
}

declare function root(theme: RootTheme): void

// @ts-expect-error the root theme names the reserved roles instead of taking a theme
root({ colors: { accent: '#000000' }, emojis: { brand: '⭐' } })

// What it says instead: each reserved role, with its group
expectTypeOf<RootTheme>().toEqualTypeOf<{ 'MeoCord reserves these theme roles; rename yours': 'colors.accent' | 'emojis.brand' }>()
