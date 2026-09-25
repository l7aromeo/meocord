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

/** A message's words, where text in quotes is one word, each with where it starts in the text. */
function splitWords(text: string): { value: string; start: number }[] {
  const words: { value: string; start: number }[] = []
  let i = 0
  while (i < text.length) {
    if (/\s/.test(text[i])) {
      i++
      continue
    }
    const start = i
    const closers = QUOTES.get(text[i])
    if (closers) {
      let end = i + 1
      while (end < text.length && !(closers.includes(text[end]) && (end + 1 === text.length || /\s/.test(text[end + 1])))) end++
      // A quote never closed is an ordinary character
      if (end < text.length) {
        words.push({ value: text.slice(i + 1, end), start })
        i = end + 1
        continue
      }
    }
    while (i < text.length && !/\s/.test(text[i])) i++
    words.push({ value: text.slice(start, i), start })
  }
  return words
}

/** The params a route's words capture from the text after its start, or `undefined` when they do not match. */
function matchWords(route: MessageRoute, text: string): Record<string, string> | undefined {
  const words = splitWords(text)
  const params: Record<string, string> = {}
  for (let i = 0; i < route.tokens.length; i++) {
    const token = route.tokens[i]
    const word = words[i]
    if ('literal' in token) {
      if (!word || (route.caseSensitive ? word.value !== token.literal : word.value.toLowerCase() !== token.literal.toLowerCase())) {
        return undefined
      }
      continue
    }
    if (!word) return token.optional ? params : undefined
    if (token.rest) {
      params[token.param] = text.slice(word.start).trimEnd()
      return params
    }
    params[token.param] = word.value
  }
  return words.length === route.tokens.length ? params : undefined
}

/**
 * The route dispatch runs for a message's content: the first, in rank order, that the content matches
 * after the route's start, with the captured params.
 */
export function matchMessageRoute(
  routes: readonly MessageRoute[],
  content: string,
  starts: MessageStarts,
): { route: MessageRoute; params: Record<string, string> } | undefined {
  const text = content.trim()
  for (const route of routes) {
    const rest =
      route.prefix === false
        ? text
        : afterStart(text, route.prefix ?? starts.prefixes, starts.mention, route.caseSensitive)
    if (!rest) continue
    const params = matchWords(route, rest)
    if (params) return { route, params }
  }
  return undefined
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
