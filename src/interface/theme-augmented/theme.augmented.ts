import { type ColorResolvable } from 'discord.js'
import { type DeepReadonly, type MeoCordTheme, type RootTheme, type ThemeOverride } from '@src/interface/index.js'

/** An app's own tokens: a role in a group MeoCord defines, and a group of its own. Checked by `bun run lint`. */
declare module '@src/interface/index.js' {
  interface ThemeColors {
    vip: ColorResolvable
  }
  interface MeoCordTheme {
    charts: { axis: ColorResolvable; series: ColorResolvable[] }
  }
}

declare function root(theme: RootTheme): void
declare function override(theme: ThemeOverride): void
declare const resolved: DeepReadonly<MeoCordTheme>

// The root theme gives every token MeoCord has no default for, and may set MeoCord's
root({ colors: { vip: '#FFD700' }, charts: { axis: '#888B95', series: ['#7680F4'] } })
root({ colors: { vip: '#FFD700', primary: '#5865F2' }, charts: { axis: 0, series: [] } })
// @ts-expect-error the app's own group has no default
root({ colors: { vip: '#FFD700' } })
// @ts-expect-error nor does the app's own role
root({ colors: {}, charts: { axis: 0, series: [] } })
// @ts-expect-error so a group of MeoCord's that holds one is required too
root({ charts: { axis: 0, series: [] } })
// @ts-expect-error nor any role of the app's own group
root({ colors: { vip: 0 }, charts: { axis: 0 } })

// A scope overrides any of them, the app's included
override({ colors: { vip: '#C0C0C0' } })
override({ charts: { series: ['#26A042'] } })
// @ts-expect-error still nothing unknown
override({ charts: { axes: 0 } })

// And every one is there to read
export const vip: DeepReadonly<ColorResolvable> = resolved.colors.vip
export const series: readonly DeepReadonly<ColorResolvable>[] = resolved.charts.series
