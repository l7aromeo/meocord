import { GatewayIntentBits, IntentsBitField, type BitFieldResolvable, type GatewayIntentsString } from 'discord.js'

/** A login failure no restart can fix. */
export type FatalLoginCode = 'TokenInvalid' | 'DisallowedIntents' | 'InvalidIntents'

/** The errors the gateway closes with, which discord.js passes on without a code. */
const GATEWAY_CLOSE_MESSAGES: Readonly<Record<string, FatalLoginCode>> = {
  'Used disallowed intents': 'DisallowedIntents',
  'Used invalid intents': 'InvalidIntents',
}

/** The intents Discord makes an application enable before it may request them. */
const PRIVILEGED_INTENTS = ['GuildMembers', 'GuildPresences', 'MessageContent'] as const

/** Why a login failed for good, from discord.js's error code or the gateway's close message; undefined otherwise. */
export function fatalLoginCode(error: unknown): FatalLoginCode | undefined {
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown }
  if (code === 'TokenInvalid' || code === 'DisallowedIntents') return code
  return typeof message === 'string' ? GATEWAY_CLOSE_MESSAGES[message] : undefined
}

/** What to do when Discord refuses the privileged intents a client requests, naming them. */
export function disallowedIntentsMessage(intents: BitFieldResolvable<GatewayIntentsString, number> | undefined): string {
  const requested = PRIVILEGED_INTENTS.filter(name => new IntentsBitField(intents ?? 0).has(GatewayIntentBits[name]))
  const refused = requested.length > 0 ? `the privileged intents the bot requests (${requested.join(', ')})` : 'a privileged intent the bot requests'
  return (
    `Discord refused ${refused}. Enable them in the Developer Portal → your application → Bot → Privileged ` +
    `Gateway Intents, then start again. A verified bot in 100 or more servers needs Discord's approval for them.`
  )
}

/** What to do when Discord refuses the intents a client requests as invalid. */
export const INVALID_INTENTS_MESSAGE =
  'Discord refused the intents the bot requests as invalid. Check clientOptions.intents in @MeoCord: every value ' +
  'must be one of discord.js GatewayIntentBits.'

/** Where a bot token comes from, for the messages that ask for one. */
const TOKEN_SOURCE = 'Copy one from the Developer Portal → your application → Bot → Reset Token'

/** What to do about a token Discord refuses, or about a missing one when `token` is empty. */
export function tokenMessage(token: string | undefined): string {
  if (!token?.trim()) {
    return `Discord token is missing: meocord.config.ts sets discordToken, and a new app reads it from DISCORD_TOKEN in .env. ${TOKEN_SOURCE}.`
  }
  return (
    `Discord refused the bot token. ${TOKEN_SOURCE} into discordToken in meocord.config.ts, which a new app reads ` +
    `from DISCORD_TOKEN in .env, then try again.`
  )
}

/** Whether Discord refused the token: discord.js's `TokenInvalid`, or a REST request answered 401. */
export function isRefusedToken(error: unknown): boolean {
  const { code, status } = (error ?? {}) as { code?: unknown; status?: unknown }
  return code === 'TokenInvalid' || status === 401
}

/** What to act on for a fatal login failure MeoCord can explain, or undefined for one it cannot. */
export function explainLoginFailure(
  code: FatalLoginCode | undefined,
  intents: BitFieldResolvable<GatewayIntentsString, number> | undefined,
  token: string | undefined,
): string | undefined {
  if (code === 'DisallowedIntents') return disallowedIntentsMessage(intents)
  if (code === 'InvalidIntents') return INVALID_INTENTS_MESSAGE
  if (code === 'TokenInvalid') return tokenMessage(token)
  return undefined
}
