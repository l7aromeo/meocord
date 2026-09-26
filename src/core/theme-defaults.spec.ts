import { ButtonStyle, resolveColor } from 'discord.js'
import { DEFAULT_THEME } from '@src/core/theme-defaults.js'
import { themeProblems } from '@src/core/theme-validation.js'

/**
 * Discord's own surfaces an embed's stripe or a container's accent sits against, read from its web client's CSS:
 * the computed theme variables of each theme, rendered to sRGB.
 */
const DISCORD_SURFACES: Record<string, number> = {
  'light chat and embed': 0xffffff,
  'light base-lower': 0xfbfbfb,
  'dark chat-default and embed': 0x393a41,
  'dark chat': 0x313338,
  'dark base-lower': 0x323339,
  'darker chat-default': 0x222327,
  'darker embed': 0x242429,
  'darker base-lower': 0x1a1a1e,
  'darker chat': 0x31323b,
  'midnight chat-default': 0x101013,
  'midnight embed': 0x0a0a0c,
  'midnight chat and base-lower': 0x000000,
}

/** WCAG 2.1 relative luminance of an sRGB colour. */
function luminance(rgb: number): number {
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((rgb >> 16) & 0xff) + 0.7152 * channel((rgb >> 8) & 0xff) + 0.0722 * channel(rgb & 0xff)
}

/** WCAG 2.1 contrast ratio between two colours. */
function contrast(a: number, b: number): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

describe('the default theme', () => {
  // WCAG 2.1 SC 1.4.11: a graphic that carries meaning needs 3:1 against what is next to it
  it.each(Object.entries(DEFAULT_THEME.colors))('gives %s at least 3:1 against every Discord surface', (_role, color) => {
    const rgb = resolveColor(color as never)
    const below = Object.entries(DISCORD_SURFACES)
      .map(([surface, background]) => ({ surface, ratio: Math.round(contrast(rgb, background) * 100) / 100 }))
      .filter(({ ratio }) => ratio < 3)

    expect(below).toEqual([])
  })

  it('holds the agreed values', () => {
    expect(DEFAULT_THEME).toEqual({
      colors: { primary: '#7680F4', neutral: '#888B95', success: '#26A042', warning: '#B08400', danger: '#E3606D', info: '#1699AE' },
      emojis: { loading: '⏳', success: '✅', warning: '⚠️', danger: '⛔', info: 'ℹ️' },
      buttons: { primary: ButtonStyle.Primary, neutral: ButtonStyle.Secondary, success: ButtonStyle.Success, danger: ButtonStyle.Danger },
    })
  })

  // One theme is shared by every call, so no call may change it for the others
  it('is frozen at every depth', () => {
    expect(Object.isFrozen(DEFAULT_THEME)).toBe(true)
    for (const group of Object.values(DEFAULT_THEME)) expect(Object.isFrozen(group)).toBe(true)
    expect(() => {
      ;(DEFAULT_THEME.colors as { primary: string }).primary = '#000000'
    }).toThrow(TypeError)
  })

  it('passes its own validation', () => {
    expect(themeProblems(DEFAULT_THEME)).toEqual([])
  })
})
