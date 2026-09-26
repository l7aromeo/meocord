import { type Message } from 'discord.js'
import { getMessageHandlers } from '@src/decorator/controller.decorator.js'
import { type ControllerClass } from '@src/core/component-routes.js'
import { routeSpecificity } from '@src/core/route-specificity.js'
import { type MessageCommandOptions, type MessagePrefix } from '@src/interface/index.js'

/** One word of a message pattern: a literal word, or a param. */
type PatternToken = { literal: string } | { param: string; rest: boolean; optional: boolean }

/** A `@MessageHandler` pattern read into its words, with its rank. */
export interface MessagePattern {
  tokens: PatternToken[]
  specificity: number
}

/** A patterned `@MessageHandler`, as dispatch ranks and matches it. */
export interface MessageRoute {
  controllerClass: ControllerClass
  method: string
  pattern: string
  tokens: PatternToken[]
  specificity: number
  /** The handler's own prefixes, `false` for none, or `undefined` for the app's. */
  prefix: false | readonly string[] | undefined
  caseSensitive: boolean
}

/** What a message may start with to reach a route that uses the app's prefixes. */
export interface MessageStarts {
  /** The app's prefixes; `''` stands for none. */
  prefixes: readonly string[]
  /** The bot's user id, when a mention of it counts as a start. */
  mention?: string
}

const PARAM = /^\{(\w+)(\.\.\.)?(\?)?\}$/

/**
 * Reads a pattern into its words. Throws for a param that is not a whole word, a name given twice, or
 * a rest or optional param that is not last.
 */
export function parseMessagePattern(pattern: string): MessagePattern {
  const words = pattern.trim().split(/\s+/)
  const tokens: PatternToken[] = []
  const names = new Set<string>()

  words.forEach((word, index) => {
    const match = PARAM.exec(word)
    if (!match) {
      if (/[{}]/.test(word)) {
        throw new Error(`"${word}" is not a param: a param is a whole word, such as {name}, {name...} or {name?}.`)
      }
      tokens.push({ literal: word })
      return
    }
    const [, name, rest, optional] = match
    if (names.has(name)) throw new Error(`{${name}} appears twice; give each param its own name.`)
    names.add(name)
    const last = index === words.length - 1
    if (rest && !last) throw new Error(`{${name}...} takes the rest of the message, so it must be last.`)
    if (optional && !last) throw new Error(`{${name}${rest ? '...' : ''}?} is optional, so it must be last.`)
    tokens.push({ param: name, rest: Boolean(rest), optional: Boolean(optional) })
  })

  const params = tokens.filter(token => 'param' in token)
  const specificity = routeSpecificity({
    literals: tokens.length - params.length,
    params: params.length,
    rest: params.some(token => token.rest),
    optional: params.some(token => token.optional),
  })
  return { tokens, specificity }
}

/** A prefix setting as a list, where `''` stands for none. */
function prefixList(prefix: MessagePrefix | undefined): readonly string[] {
  const list = typeof prefix === 'string' ? [prefix] : (prefix ?? [])
  return list.length > 0 ? list : ['']
}

/** Where two routes of equal rank part: the one with a literal word where the other has a param comes first. */
function compareShapes(a: PatternToken[], b: PatternToken[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const aLiteral = 'literal' in a[i]
    if (aLiteral !== 'literal' in b[i]) return aLiteral ? -1 : 1
  }
  return 0
}

/** Whether two routes accept exactly the same messages. */
function sameMessages(a: MessageRoute, b: MessageRoute): boolean {
  const startsOf = (route: MessageRoute) =>
    route.prefix === undefined ? 'app' : route.prefix === false ? 'none' : JSON.stringify([...route.prefix].sort())
  if (startsOf(a) !== startsOf(b) || a.tokens.length !== b.tokens.length) return false
  // A case-insensitive word matches every message the case-sensitive one does
  const exact = a.caseSensitive && b.caseSensitive
  return a.tokens.every((token, i) => {
    const other = b.tokens[i]
    if ('literal' in token) {
      return 'literal' in other && (exact ? token.literal === other.literal : token.literal.toLowerCase() === other.literal.toLowerCase())
    }
    return 'param' in other && token.rest === other.rest && token.optional === other.optional
  })
}

/**
 * Every patterned message handler of the given controllers, most specific first, read from metadata
 * alone. Throws for a pattern that cannot be read and for two that match the same messages.
 */
export function buildMessageRoutes(controllerClasses: readonly ControllerClass[], options: MessageCommandOptions = {}): MessageRoute[] {
  const routes: MessageRoute[] = []
  for (const controllerClass of controllerClasses) {
    for (const { pattern, method, options: own } of getMessageHandlers(controllerClass.prototype)) {
      if (pattern === undefined) continue
      let parsed: MessagePattern
      try {
        parsed = parseMessagePattern(pattern)
      } catch (error) {
        throw new Error(`@MessageHandler('${pattern}') in ${controllerClass.name}.${method}: ${(error as Error).message}`)
      }
      routes.push({
        controllerClass,
        method,
        pattern,
        ...parsed,
        prefix: own.prefix === undefined || own.prefix === false ? own.prefix : prefixList(own.prefix),
        caseSensitive: own.caseSensitive ?? options.caseSensitive ?? false,
      })
    }
  }

  routes.sort((a, b) => b.specificity - a.specificity || compareShapes(a.tokens, b.tokens))

  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const [a, b] = [routes[i], routes[j]]
      if (!sameMessages(a, b)) continue
      // One handler under two spellings, such as 'hello' and 'Hello', is one route
      if (a.controllerClass === b.controllerClass && a.method === b.method) {
        routes.splice(j--, 1)
        continue
      }
      throw new Error(
        `"${a.pattern}" in ${a.controllerClass.name}.${a.method} and "${b.pattern}" in ${b.controllerClass.name}.${b.method} ` +
          `match the same messages, so only one of them could ever run. Change one pattern, or give one its own prefix.`,
      )
    }
  }
  return routes
}

/** Whether a route uses the app's prefixes, so they have to be known before it can match. */
export function usesAppPrefix(routes: readonly MessageRoute[]): boolean {
  return routes.some(route => route.prefix === undefined)
}

/**
 * The starts the app accepts for this message: its prefixes, read from the function when it is one,
 * and a mention of the bot when `mention` is on.
 */
export async function messageStarts(options: MessageCommandOptions, message: Message, botId: string | undefined): Promise<MessageStarts> {
  const prefix = typeof options.prefix === 'function' ? await options.prefix(message) : options.prefix
  return { prefixes: prefixList(prefix), mention: options.mention ? botId : undefined }
}

/**
 * The same, for a caller that cannot run a prefix function: `prefix` stands in for what it returns.
 * @throws TypeError when the app's prefix is a function and no `prefix` is given.
 */
export function staticMessageStarts(
  app: { name: string },
  options: MessageCommandOptions,
  { prefix, botId }: { prefix?: MessagePrefix; botId?: string },
): MessageStarts {
  if (typeof options.prefix === 'function' && prefix === undefined) {
    throw new TypeError(`${app.name} reads its prefixes from a function; pass the prefix this message has, as { content, prefix }.`)
  }
  return { prefixes: prefixList(prefix ?? (options.prefix as MessagePrefix | undefined)), mention: options.mention ? botId : undefined }
}

/** The text after the longest start the message begins with, or `undefined` when it begins with none. */
function afterStart(text: string, prefixes: readonly string[], mention: string | undefined, caseSensitive: boolean): string | undefined {
  const starts = [
    ...prefixes.map(prefix => ({ start: prefix, exact: caseSensitive })),
    ...(mention ? [`<@${mention}>`, `<@!${mention}>`].map(start => ({ start, exact: true })) : []),
  ].sort((a, b) => b.start.length - a.start.length)

  for (const { start, exact } of starts) {
    const head = text.slice(0, start.length)
    if (exact ? head !== start : head.toLowerCase() !== start.toLowerCase()) continue
    const rest = text.slice(start.length).trimStart()
    if (rest) return rest
  }
  return undefined
}

const QUOTES = new Map([
  ['"', ['"', '”']],
  ['“', ['”', '"']],
])

/** Whether a character is whitespace, as `/\s/` has it, testing the common ASCII cases without a regex. */
function isSpace(text: string, i: number): boolean {
  const code = text.charCodeAt(i)
  if (code === 32 || (code >= 9 && code <= 13)) return true
  return code > 127 && /\s/.test(text[i])
}

/** A message's words, where text in quotes is one word, each with where it starts in the text. One pass. */
function splitWords(text: string): { value: string; start: number }[] {
  const words: { value: string; start: number }[] = []
  let i = 0
  while (i < text.length) {
    if (isSpace(text, i)) {
      i++
      continue
    }
    const start = i
    const closers = QUOTES.get(text[i])
    if (closers) {
      let end = i + 1
      while (end < text.length && !(closers.includes(text[end]) && (end + 1 === text.length || isSpace(text, end + 1)))) end++
      // A quote never closed is an ordinary character
      if (end < text.length) {
        words.push({ value: text.slice(i + 1, end), start })
        i = end + 1
        continue
      }
    }
    while (i < text.length && !isSpace(text, i)) i++
    words.push({ value: text.slice(start, i), start })
  }
  return words
}

/** One step of a compiled pattern: literal words by key, one param edge, and the routes ending here. */
interface TrieNode {
  words: Map<string, TrieNode>
  param?: TrieNode
  /** Routes, by rank, whose words end here. */
  ends: number[]
  /** Routes, by rank, whose rest param starts here and takes one word or more. */
  rests: number[]
}

/** Routes that share how a message starts for them, and their words compiled into one trie. */
interface RouteGroup {
  /** The route's own prefixes, `false` for none, or `undefined` for the app's. */
  prefix: false | readonly string[] | undefined
  caseSensitive: boolean
  root: TrieNode
}

/** Routes compiled once for dispatch: grouped by how a message starts for them, each group a trie of words. */
interface MessageIndex {
  groups: RouteGroup[]
  /** Whether some route can match a message with no prefix, so no message can be turned away by its first character. */
  acceptsAnyStart: boolean
  /** Whether some route uses the app's prefixes, which each message brings. */
  usesAppStarts: boolean
  /** The characters the routes' own prefixes begin with, in either case. */
  ownFirsts: Set<string>
}

const trieNode = (): TrieNode => ({ words: new Map(), ends: [], rests: [] })
const wordKey = (word: string, caseSensitive: boolean) => (caseSensitive ? word : word.toLowerCase())

/** Compiles ranked routes into tries, one per group; a route keeps its rank, its position in `routes`. */
function compileIndex(routes: readonly MessageRoute[]): MessageIndex {
  const groups = new Map<string, RouteGroup>()
  routes.forEach((route, rank) => {
    const startKey = route.prefix === undefined ? 'app' : route.prefix === false ? 'none' : JSON.stringify(route.prefix)
    const key = `${startKey}|${route.caseSensitive}`
    let group = groups.get(key)
    if (!group) groups.set(key, (group = { prefix: route.prefix, caseSensitive: route.caseSensitive, root: trieNode() }))

    let node = group.root
    for (const token of route.tokens) {
      if ('literal' in token) {
        const key = wordKey(token.literal, route.caseSensitive)
        let next = node.words.get(key)
        if (!next) node.words.set(key, (next = trieNode()))
        node = next
        continue
      }
      // An optional param may be left out: the route also ends before it
      if (token.optional) node.ends.push(rank)
      if (token.rest) {
        node.rests.push(rank)
        return
      }
      node = node.param ??= trieNode()
    }
    node.ends.push(rank)
  })
  const all = [...groups.values()]
  const ownPrefixes = all.flatMap(group => (Array.isArray(group.prefix) ? group.prefix : []))
  return {
    groups: all,
    acceptsAnyStart:
      all.some(group => group.prefix === false) ||
      // Lowercasing a character outside ASCII can change its length, so such a prefix turns nothing away
      ownPrefixes.some(prefix => prefix === '' || prefix.charCodeAt(0) > 127),
    usesAppStarts: all.some(group => group.prefix === undefined),
    ownFirsts: new Set(ownPrefixes.flatMap(prefix => [prefix[0], prefix[0].toLowerCase(), prefix[0].toUpperCase()])),
  }
}

/** The ranks of every route the words reach from `node`. Each node sits at one word depth, so each is visited once. */
function reach(node: TrieNode, words: { value: string }[], i: number, caseSensitive: boolean, found: number[]): void {
  if (i === words.length) {
    for (const rank of node.ends) found.push(rank)
    return
  }
  for (const rank of node.rests) found.push(rank)
  const next = node.words.get(wordKey(words[i].value, caseSensitive))
  if (next) reach(next, words, i + 1, caseSensitive, found)
  if (node.param) reach(node.param, words, i + 1, caseSensitive, found)
}

/** The params a route's words capture, given words its pattern is known to match. */
function paramsOf(route: MessageRoute, words: { value: string; start: number }[], text: string): Record<string, string> {
  const params: Record<string, string> = {}
  for (let i = 0; i < route.tokens.length && i < words.length; i++) {
    const token = route.tokens[i]
    if ('literal' in token) continue
    if (token.rest) {
      params[token.param] = text.slice(words[i].start).trimEnd()
      break
    }
    params[token.param] = words[i].value
  }
  return params
}

/** Whether a message beginning with `first` can reach some route: a check of first characters, with no allocation. */
function mayStart(index: MessageIndex, starts: MessageStarts, first: string): boolean {
  if (index.acceptsAnyStart || index.ownFirsts.has(first)) return true
  if (starts.mention && first === '<') return true
  if (!index.usesAppStarts) return false
  for (const prefix of starts.prefixes) {
    if (prefix === '' || prefix.charCodeAt(0) > 127) return true
    const head = prefix[0]
    if (head === first || head.toLowerCase() === first.toLowerCase()) return true
  }
  return false
}

const indexes = new WeakMap<readonly MessageRoute[], MessageIndex>()

/**
 * The route dispatch runs for a message's content: the first, in rank order, that the content matches
 * after the route's start, with the captured params. The routes are compiled into tries once, so a message
 * costs one pass over its words whatever the number of routes, and one whose first character no start
 * begins with costs a lookup.
 */
export function matchMessageRoute(
  routes: readonly MessageRoute[],
  content: string,
  starts: MessageStarts,
): { route: MessageRoute; params: Record<string, string> } | undefined {
  let index = indexes.get(routes)
  if (!index) indexes.set(routes, (index = compileIndex(routes)))

  // Most messages are chatter: one that no start begins with is turned away before anything is copied or split
  let first = 0
  while (first < content.length && isSpace(content, first)) first++
  if (first === content.length || !mayStart(index, starts, content[first])) return undefined
  const text = content.trim()

  // Each distinct text after a start is split into words once
  const split = new Map<string, { value: string; start: number }[]>()
  let best: { rank: number; words: { value: string; start: number }[]; text: string } | undefined
  for (const group of index.groups) {
    const rest =
      group.prefix === false
        ? text
        : afterStart(text, group.prefix ?? starts.prefixes, starts.mention, group.caseSensitive)
    if (!rest) continue
    let words = split.get(rest)
    if (!words) split.set(rest, (words = splitWords(rest)))
    const found: number[] = []
    reach(group.root, words, 0, group.caseSensitive, found)
    for (const rank of found) if (!best || rank < best.rank) best = { rank, words, text: rest }
  }
  if (!best) return undefined
  const route = routes[best.rank]
  return { route, params: paramsOf(route, best.words, best.text) }
}

/**
 * What a test calling a handler with a message alone passes as its params, as dispatch would build
 * them: `undefined` for a listener, which takes none; `{}` for a message without content; otherwise
 * what the handler's pattern captures, or why the content does not reach it.
 */
export async function messageParamsFor(
  controllerClass: ControllerClass,
  methodName: string,
  message: Message,
  options: MessageCommandOptions,
): Promise<{ params: Record<string, string> } | { mismatch: string } | undefined> {
  const route = buildMessageRoutes([controllerClass], options).find(candidate => candidate.method === methodName)
  if (!route) return undefined
  if (typeof message.content !== 'string') return { params: {} }

  const botId = message.client?.user?.id
  const starts = await messageStarts(options, message, typeof botId === 'string' ? botId : undefined)
  const matched = matchMessageRoute([route], message.content, starts)
  if (matched) return { params: matched.params }
  return { mismatch: `message '${message.content}' does not match ${controllerClass.name}.${methodName}'s pattern '${route.pattern}'.` }
}
