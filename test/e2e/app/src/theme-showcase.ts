/**
 * The smoke app's theme layers, which scripts/e2e.ts reads back from Discord: the app's, the showcase
 * listener class's `@UseTheme`, the test server's and the helper bot's. Each sets roles the others leave, so the
 * reply shows which layer each value came from, a server's over the class's and a user's over the server's.
 */
export const APP_THEME = { colors: { primary: '#5865F2', vip: '#C27C0E' } } as const
export const CLASS_THEME = { colors: { success: '#1F8B4C' }, emojis: { warning: '🚧' } } as const
export const GUILD_THEME = { colors: { primary: '#B04A9C', neutral: '#6D6F78' } } as const
export const USER_THEME = { colors: { info: '#206694' } } as const

/** What the helper bot sends: a reply coloured from the call's theme, or a refusal answered with its emoji. */
export const SHOWCASE_PREFIX = '!e2e-theme'
export const SWATCHES = `${SHOWCASE_PREFIX} swatches`
export const REFUSE = `${SHOWCASE_PREFIX} refuse`
export const REFUSAL = 'The theme showcase refused this, as asked.'

/** The roles a swatch shows, one embed each, and the emojis its content lists. */
export const COLOR_ROLES = ['primary', 'neutral', 'success', 'warning', 'danger', 'info', 'vip'] as const
export const EMOJI_ROLES = ['loading', 'success', 'warning', 'danger', 'info'] as const
