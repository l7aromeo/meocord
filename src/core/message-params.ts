import { Collection, type GuildMember, type Message } from 'discord.js'
import { MessageUsageError, type MessageUsageIssue } from '@src/common/errors.js'
import { type MessageParamType } from '@src/interface/index.js'
import { type FlagToken, type MessageRoute, type PatternToken } from '@src/core/message-routes.js'
import { type GivenFlag, scanFlags, splitWords } from '@src/core/message-words.js'

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

/** How the usage shows a flag: `[--bots]`, `--limit=<limit>`, or `[--from=<from>]` when optional. */
function flagUsage(flag: FlagToken): string {
  if (flag.type === undefined) return `[--${flag.flag}]`
  const shown = `--${flag.flag}=<${flag.flag}>`
  return flag.optional ? `[${shown}]` : shown
}

/** A route's usage as the user types it, after the start the message used, spacing included: `!ban <target> [reason…]`. */
export function usageOf(route: Pick<MessageRoute, 'tokens' | 'flags'>, start: string): string {
  return start + [...route.tokens.map(token => ('literal' in token ? token.literal : usageWord(token))), ...route.flags.map(flagUsage)].join(' ')
}

/** The issue for a word that is not a value of its param's type. */
function wrongType(item: Item, types: Record<string, MessageParamType> | undefined): MessageUsageIssue {
  const choices = choicesOf(item.type)
  const expected = choices ? `one of ${choices.join(', ')}` : `a ${types?.[item.type]?.label ?? LABELS[item.type] ?? item.type}`
  return { param: item.key, message: `${item.label}: "${item.word}" is not ${expected}` }
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

/** One word to turn into a value, a param's, a flag's or a list item's, and where the value goes. */
interface Item {
  key: string
  /** How issues name it: the param's name, or the flag as typed, `--from`. */
  label: string
  type: string
  word: string
  /** Its place in a list. */
  index?: number
}

/**
 * The params a matched route's handler receives: each typed param's word turned into its value, each typed
 * list's words into a list of values, its flags into `true`, `false` or their values, and mentions and IDs
 * into the server's members, users, roles and channels. Nothing is fetched that a cache holds: a mentioned
 * member arrives with the message, and roles and channels are cached with the Guilds intent. The members
 * not cached are fetched together, in one request, however many params, lists and flags name them.
 *
 * @throws MessageUsageError naming each word that is not a value of its type, each flag the command does
 *   not have or that lacks its value, or saying the command works only in a server, when a param's type
 *   needs one and the message was sent elsewhere.
 */
export async function resolveMessageParams(
  route: MessageRoute,
  raw: Record<string, string>,
  message: Message,
  start: string,
  types: Record<string, MessageParamType> | undefined,
): Promise<Record<string, unknown>> {
  if (!hasTypedParams(route)) return raw

  const usage = usageOf(route, start)
  const params: Record<string, unknown> = { ...raw }
  const issues: MessageUsageIssue[] = []
  const items: Item[] = []
  for (const token of route.tokens) {
    if (!('param' in token) || token.type === undefined || raw[token.param] === undefined) continue
    if (!token.rest) {
      items.push({ key: token.param, label: token.param, type: token.type, word: raw[token.param] })
      continue
    }
    const words = splitWords(raw[token.param])
    params[token.param] = new Array(words.length)
    words.forEach(({ value }, index) => items.push({ key: token.param, label: token.param, type: token.type!, word: value, index }))
  }
  const flagIssues = route.flags.length > 0 ? readFlags(route, message, start, params, items) : []

  const guild = message.guild
  const needsGuild = route.tokens.some(token => 'param' in token && token.type !== undefined && GUILD_TYPES.has(token.type))
  if (!guild && (needsGuild || items.some(item => GUILD_TYPES.has(item.type)))) {
    throw new MessageUsageError(usage, [{ message: 'This command works in a server only.' }], { serverOnly: true, quiet: start === '' })
  }

  const put = (item: Item, value: unknown) => {
    if (item.index === undefined) params[item.key] = value
    else (params[item.key] as unknown[])[item.index] = value
  }
  const members = new Map<string, Item[]>()
  const users = new Map<string, Item[]>()

  for (const item of items) {
    const { type, word } = item
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
          pending.set(id, [...(pending.get(id) ?? []), item])
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
    if (value === undefined) issues.push(wrongType(item, types))
    else put(item, value)
  }

  for (const [id, member] of await fetchMembers(message, [...members.keys()])) {
    for (const item of members.get(id)!) {
      if (member) put(item, member)
      else issues.push({ param: item.key, message: `${item.label}: <@${id}> is not a member of this server` })
    }
  }
  const fetchedUsers = await Promise.all([...users.keys()].map(id => message.client.users.fetch(id).catch(() => undefined)))
  ;[...users.keys()].forEach((id, i) => {
    for (const item of users.get(id)!) {
      if (fetchedUsers[i]) put(item, fetchedUsers[i])
      else issues.push({ param: item.key, message: `${item.label}: no user has the ID ${id}` })
    }
  })

  issues.push(...flagIssues)
  if (issues.length > 0) throw new MessageUsageError(usage, issues, { quiet: start === '' })
  return params
}

/**
 * Reads a message's flags into params: a flag without a type as `true` or `false`, a typed one's value as a
 * word to resolve. The issues are the flags the command does not have, and a typed flag missing or given no
 * value. Given twice, a flag takes its last value.
 */
function readFlags(route: MessageRoute, message: Message, start: string, params: Record<string, unknown>, items: Item[]): MessageUsageIssue[] {
  const issues: MessageUsageIssue[] = []
  const key = (name: string) => (route.caseSensitive ? name : name.toLowerCase())
  const given = new Map<string, GivenFlag>()
  const text = (message.content ?? '').trim()
  for (const flag of scanFlags(text.slice(start.length)).flags) {
    const declared = route.flags.find(candidate => key(candidate.flag) === key(flag.name))
    if (declared) given.set(declared.flag, flag)
    else if (!issues.some(issue => issue.message.startsWith(`--${flag.name} `))) {
      issues.push({ message: `--${flag.name} is not an option of this command` })
    }
  }
  for (const flag of route.flags) {
    const label = `--${flag.flag}`
    const value = given.get(flag.flag)?.value
    delete params[flag.flag]
    if (flag.type === undefined) {
      const on = value === undefined ? given.has(flag.flag) : BOOLEANS[value.toLowerCase()]
      if (on === undefined) issues.push({ param: flag.flag, message: `${label}: "${value}" is not yes or no` })
      else params[flag.flag] = on
    } else if (!given.has(flag.flag)) {
      if (!flag.optional) issues.push({ param: flag.flag, message: `${label} is missing` })
    } else if (!value) {
      issues.push({ param: flag.flag, message: `${label} needs a value, such as ${label}=<${flag.flag}>` })
    } else {
      items.push({ key: flag.flag, label, type: flag.type, word: value })
    }
  }
  return issues
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

/** Whether a route's params need resolving: it declares a type for one, or has flags. */
export const hasTypedParams = (route: MessageRoute): boolean =>
  route.flags.length > 0 || route.tokens.some(token => 'param' in token && token.type !== undefined)

