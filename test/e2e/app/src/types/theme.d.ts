import { type ColorResolvable } from 'discord.js'
import 'meocord/interface'

// A role of the app's own, so the checks read one back beside MeoCord's
declare module 'meocord/interface' {
  interface ThemeColors {
    vip: ColorResolvable
  }
}
