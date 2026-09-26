import { Collection, type GuildMember, type Message } from 'discord.js'
import { MessageUsageError, type MessageUsageIssue } from '@src/common/errors.js'
import { type MessageParamType } from '@src/interface/index.js'
import { type MessageRoute, type PatternToken } from '@src/core/message-routes.js'

type ParamToken = Extract<PatternToken, { param: string }>

const number = (word: string, whole: boolean): number | undefined => {
  if (!(whole ? /^[+-]?\d+$/ : /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i).test(word)) return undefined
  const value = Number(word)
  return Number.isFinite(value) && (!whole || Number.isSafeInteger(value)) ? value : undefined
}

const BOOLEANS: Record<string, boolean> = { yes: true, true: true, on: true, no: false, false: false, off: false }

const UNIT_MS: Record<string, number> = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }

/** A length of time written as amounts and units, such as `90s`, `2h30m` or `1.5d`, in milliseconds. */
function duration(word: string): number | undefined {
  const parts = word.toLowerCase().match(/(\d+(?:\.\d+)?)(ms|s|m|h|d|w)/g)
  if (!parts || parts.join('') !== word.toLowerCase()) return undefined
  return parts.reduce((total, part) => {
    const [, amount, unit] = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/.exec(part)!
    return total + Number(amount) * UNIT_MS[unit]
  }, 0)
}

/** The ID a mention or a bare snowflake names, for the mention's kind. */
function idOf(word: string, mention: RegExp): string | undefined {
  return (mention.exec(word) ?? /^(\d{17,20})$/.exec(word))?.[1]
}

const USER_MENTION = /^<@!?(\d{17,20})>$/
const ROLE_MENTION = /^<@&(\d{17,20})>$/
const CHANNEL_MENTION = /^<#(\d{17,20})>$/

/** The scalar types, each turning a word into its value or `undefined`, and the Discord ones, which resolve below. */
export const BUILT_IN_TYPES = {
  string: (word: string) => word,
  int: (word: string) => number(word, true),
  number: (word: string) => number(word, false),
  bool: (word: string) => BOOLEANS[word.toLowerCase()],
  duration,
  member: undefined,
  user: undefined,
  role: undefined,
  channel: undefined,
} as const

/** What the usage and its issues call a value of each built-in type. */
const LABELS: Record<string, string> = {
  string: 'text',
  int: 'whole number',
  number: 'number',
  bool: 'yes or no',
  duration: 'length of time, such as 10m',
  member: 'member',
  user: 'user',
  role: 'role',
  channel: 'channel',
}

/** The types that exist only in a server. */
const GUILD_TYPES = new Set(['member', 'role', 'channel'])

/** Whether a param type is found only in a server. */
export const isGuildType = (type: string): boolean => GUILD_TYPES.has(type)

const choicesOf = (type: string) => (type.includes('|') ? type.split('|') : undefined)

/** Whether a pattern's `{name:type}` names a type: built in, words to choose from, or one the app adds. */
export function isKnownParamType(type: string, types: Record<string, MessageParamType> | undefined): boolean {
  return type in BUILT_IN_TYPES || Boolean(choicesOf(type)) || Boolean(types && type in types)
}

/**
 * Whether a word has the form of a value of a built-in type, telling without the message whether an optional
 * param that another follows takes the word. Members, users, roles and channels take a mention or an ID.
 */
export function fitsParamType(type: string, word: string, caseSensitive: boolean): boolean {
  const choices = choicesOf(type)
  if (choices) return choices.some(choice => (caseSensitive ? choice === word : choice.toLowerCase() === word.toLowerCase()))
  switch (type) {
    case 'member':
    case 'user':
      return idOf(word, USER_MENTION) !== undefined
    case 'role':
      return idOf(word, ROLE_MENTION) !== undefined
    case 'channel':
      return idOf(word, CHANNEL_MENTION) !== undefined
    default:
      return (BUILT_IN_TYPES[type as keyof typeof BUILT_IN_TYPES] as (word: string) => unknown)(word) !== undefined
  }
}

/** How the usage shows one param: `<name>`, `[name]` when optional, with `…` for the rest of the message. */
function usageWord(token: ParamToken): string {
  const name = `${token.param}${token.rest ? '…' : ''}`
  return token.optional ? `[${name}]` : `<${name}>`
}

/** A route's usage as the user types it, after the start the message used, spacing included: `!ban <target> [reason…]`. */
export function usageOf(route: Pick<MessageRoute, 'tokens'>, start: string): string {
  return start + route.tokens.map(token => ('literal' in token ? token.literal : usageWord(token))).join(' ')
}

/** The issue for a word that is not a value of its param's type. */
function wrongType(token: ParamToken, word: string, types: Record<string, MessageParamType> | undefined): MessageUsageIssue {
  const type = token.type!
  const choices = choicesOf(type)
  const expected = choices ? `one of ${choices.join(', ')}` : `a ${types?.[type]?.label ?? LABELS[type] ?? type}`
  return { param: token.param, message: `${token.param}: "${word}" is not ${expected}` }
}

/**
 * Refuses a message sent where its command does not work: a `'guild'` command in a DM, or a `'dm'` one in a
 * server. A message with no prefix or mention is refused quietly, as it may be chat.
 *
 * @throws MessageUsageError saying where the command works.
 */
export function assertMessageScope(route: MessageRoute, message: Message, start: string): void {
  const inGuild = message.guildId !== null && message.guildId !== undefined
  if (route.scope === 'guild' && !inGuild) {
    throw new MessageUsageError(usageOf(route, start), [{ message: 'This command works in a server only.' }], { serverOnly: true, quiet: start === '' })
  }
  if (route.scope === 'dm' && inGuild) {
    throw new MessageUsageError(usageOf(route, start), [{ message: 'This command works in direct messages only.' }], { dmOnly: true, quiet: start === '' })
  }
}

/**
 * The params a matched route's handler receives: each typed param's word turned into its value, mentions and
 * IDs into the server's members, users, roles and channels. Nothing is fetched that a cache holds: a
 * mentioned member arrives with the message, and roles and channels are cached with the Guilds intent. The
 * members not cached are fetched together, in one request.
 *
 * @throws MessageUsageError naming each word that is not a value of its type, or saying the command works
 *   only in a server, when a param's type needs one and the message was sent elsewhere.
 */
export async function resolveMessageParams(
  route: MessageRoute,
  raw: Record<string, string>,
  message: Message,
  start: string,
  types: Record<string, MessageParamType> | undefined,
): Promise<Record<string, unknown>> {
  const typed = route.tokens.filter((token): token is ParamToken => 'param' in token && token.type !== undefined)
  if (typed.length === 0) return raw

  const usage = usageOf(route, start)
  const guild = message.guild
  if (!guild && typed.some(token => GUILD_TYPES.has(token.type!))) {
    throw new MessageUsageError(usage, [{ message: 'This command works in a server only.' }], { serverOnly: true, quiet: start === '' })
  }

  const params: Record<string, unknown> = { ...raw }
  const issues: MessageUsageIssue[] = []
  const members = new Map<string, string[]>()
  const users = new Map<string, string[]>()

  for (const token of typed) {
    const word = raw[token.param]
    if (word === undefined) continue
    const type = token.type!
    const choices = choicesOf(type)
    const own = types?.[type]
    let value: unknown
    if (choices) {
      value = route.caseSensitive ? choices.find(choice => choice === word) : choices.find(choice => choice.toLowerCase() === word.toLowerCase())
    } else if (own) {
      value = await own.parse(word, message)
    } else if (type === 'member' || type === 'user') {
      const id = idOf(word, USER_MENTION)
      if (id) {
        const cached = type === 'member' ? guild!.members.cache.get(id) : message.client.users.cache.get(id)
        if (cached) value = cached
        else {
          const pending = type === 'member' ? members : users
          pending.set(id, [...(pending.get(id) ?? []), token.param])
          continue
        }
      }
    } else if (type === 'role') {
      const id = idOf(word, ROLE_MENTION)
      value = id ? guild!.roles.cache.get(id) : guild!.roles.cache.find(role => role.name.toLowerCase() === word.toLowerCase())
    } else if (type === 'channel') {
      const id = idOf(word, CHANNEL_MENTION)
      value = id ? (guild!.channels.cache.get(id) ?? (await guild!.channels.fetch(id).catch(() => null)) ?? undefined) : undefined
    } else {
      value = (BUILT_IN_TYPES[type as keyof typeof BUILT_IN_TYPES] as (word: string) => unknown)(word)
    }
    if (value === undefined) issues.push(wrongType(token, word, types))
    else params[token.param] = value
  }

  for (const [id, member] of await fetchMembers(message, [...members.keys()])) {
    for (const param of members.get(id)!) {
      if (member) params[param] = member
      else issues.push({ param, message: `${param}: <@${id}> is not a member of this server` })
    }
  }
  const fetchedUsers = await Promise.all([...users.keys()].map(id => message.client.users.fetch(id).catch(() => undefined)))
  ;[...users.keys()].forEach((id, i) => {
    for (const param of users.get(id)!) {
      if (fetchedUsers[i]) params[param] = fetchedUsers[i]
      else issues.push({ param, message: `${param}: no user has the ID ${id}` })
    }
  })

  if (issues.length > 0) throw new MessageUsageError(usage, issues, { quiet: start === '' })
  return params
}

/**
 * The server's members with these IDs, none of them cached: one request for several, answered over the
 * gateway, or one fetch for a single one. A member that does not exist comes back as `undefined`.
 */
async function fetchMembers(message: Message, ids: string[]): Promise<Map<string, GuildMember | undefined>> {
  const found = new Map<string, GuildMember | undefined>()
  if (ids.length === 0) return found
  const guild = message.guild!
  if (ids.length > 1) {
    const batch = await guild.members.fetch({ user: ids }).catch(() => undefined)
    if (batch instanceof Collection) {
      for (const id of ids) found.set(id, batch.get(id))
      return found
    }
  }
  // One ID, or a batch the gateway refused: each is fetched on its own
  const single = await Promise.all(ids.map(id => guild.members.fetch(id).catch(() => undefined)))
  ids.forEach((id, i) => found.set(id, single[i] as GuildMember | undefined))
  return found
}

/**
 * What is wrong with a command whose words a message named but whose pattern it does not fit, given how many
 * words followed the command words: each required param it left out, or words beyond what the pattern takes.
 */
export function missingParams(route: MessageRoute, given: number): MessageUsageIssue[] {
  const firstParam = route.tokens.findIndex(token => !('literal' in token))
  const after = firstParam === -1 ? [] : route.tokens.slice(firstParam)
  const missing = after
    .slice(given)
    .filter((token): token is ParamToken => 'param' in token && !token.optional)
    .map(token => ({ param: token.param, message: `${token.param} is missing` }))
  if (missing.length > 0) return missing
  return [{ message: 'The command has more words than it takes' }]
}

/** Whether a route's params need resolving: it declares a type for one. */
export const hasTypedParams = (route: MessageRoute): boolean => route.tokens.some(token => 'param' in token && token.type !== undefined)

