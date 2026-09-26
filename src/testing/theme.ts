import { type DeepReadonly, type MeoCordTheme, type RootTheme } from '@src/interface/index.js'
import { assertValidTheme } from '@src/core/theme-validation.js'
import { copyLayer, defaultTheme, mergeTheme, runWithTheme, type ResolvedTheme } from '@src/core/theme-scope.js'

/** A theme's parts, as the app's root theme takes them: required when the app has added tokens, since those have no default. */
type MockThemeArgs = Partial<RootTheme> extends RootTheme ? [overrides?: RootTheme] : [overrides: RootTheme]

// Themes createMockTheme made, which withTheme uses as they are
const mocks = new WeakSet<object>()

function mockTheme(overrides: unknown, where: string): ResolvedTheme {
  if (overrides === undefined) return defaultTheme()
  assertValidTheme(overrides, where)
  const theme = mergeTheme(defaultTheme(), copyLayer(overrides) as RootTheme)
  mocks.add(theme)
  return theme
}

/**
 * Makes a whole theme for a test: MeoCord's defaults with `overrides` merged over them, frozen, as `useTheme()` reads
 * one in a call. Pass it where code takes a theme, run code in it with {@link withTheme}, or compare against it.
 *
 * The defaults include what the deprecated `Theme` statics set, so `createMockTheme()` is the theme a testing module
 * with no theme reads. When the app adds tokens to the theme, `overrides` gives them, as `@MeoCord({ theme })` does,
 * since MeoCord has no default for them.
 *
 * @param overrides - The roles to change, in any group, checked as `@MeoCord({ theme })` checks them.
 * @returns The theme, with every role present.
 * @throws Error naming each token that is not valid.
 *
 * @example
 * ```ts
 * const theme = createMockTheme({ colors: { danger: '#E3606D' } })
 * const embed = withTheme(theme, () => receipts.refundEmbed(order))
 *
 * expect(embed.color).toBe(0xe3606d)
 * ```
 */
export function createMockTheme(...[overrides]: MockThemeArgs): DeepReadonly<MeoCordTheme> {
  return mockTheme(overrides, 'createMockTheme')
}

/**
 * Runs `fn` with `theme` as the theme of the call, as a handler's call runs: `useTheme()` in it, and in everything it
 * awaits or starts, reads `theme`. For a service or presenter tested without a testing module.
 *
 * @param theme - A theme {@link createMockTheme} made, used as it is, or the roles to change, merged over the defaults
 *   as `createMockTheme` merges them.
 * @param fn - The code to run.
 * @returns What `fn` returns, a promise included.
 * @throws Error naming each token that is not valid.
 *
 * @example
 * ```ts
 * const line = await withTheme(createMockTheme({ emojis: { success: '🎉' } }), () => formatter.saved('Profile'))
 *
 * expect(line).toBe('🎉 Profile saved')
 * ```
 */
export function withTheme<T>(theme: DeepReadonly<MeoCordTheme> | RootTheme, fn: () => T): T {
  const resolved = mocks.has(theme) || theme === defaultTheme() ? (theme as ResolvedTheme) : mockTheme(theme, 'withTheme')
  return runWithTheme(resolved, fn)
}
