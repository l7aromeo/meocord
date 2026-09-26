import { createRegexFromPattern } from '@src/decorator/controller.decorator.js'

/** The longest customId Discord accepts. */
export const MAX_CUSTOM_ID_LENGTH = 100

/** The `{name}` params a pattern names, as a union of their names; `never` for a pattern with none. */
export type RouteParams<T extends string> = T extends `${string}{${infer Param}}${infer Rest}` ? Param | RouteParams<Rest> : never

/** A value a route's param takes: its text, or a number or snowflake written as its digits. */
export type RouteValue = string | number | bigint

/** The values a route's `build` takes: one for each of its params, and no others. */
export type RouteValues<T extends string> = Record<RouteParams<T>, RouteValue>

/**
 * A component's customId pattern, as `route` makes it: pass it to `@Command` in place of the pattern's text,
 * and `build` the customIds that reach it.
 */
export interface Route<T extends string = string> {
  /** The pattern, as written. */
  readonly pattern: T
  /**
   * A customId this route matches, with each param's value in its segment. `/` and `%` in a value are
   * encoded, and the handler receives the value as it was given.
   *
   * @throws TypeError for a missing, empty or unknown value, and RangeError for an id over 100 characters.
   */
  build(...values: [RouteParams<T>] extends [never] ? [] : [values: RouteValues<T>]): string
  /** The pattern, so a route reads as its pattern in a template string. */
  toString(): T
}

const PLACEHOLDER = /\{(\w+)}/g

/** Encodes the characters that would end a param's segment, or read as an encoding, in a customId. */
const encodeSegment = (value: string): string => value.replace(/%/g, '%25').replace(/\//g, '%2F')

/**
 * A captured customId param as the handler receives it: `%2F` and `%25`, which `Route.build` writes for
 * `/` and `%`, read back as those characters.
 */
const decodeSegment = (value: string): string =>
  value.replace(/%(25|2F)/gi, (_, code: string) => (code === '25' ? '%' : '/'))

/** Every captured param of a customId, decoded as `decodeSegment` decodes one. */
export function decodeRouteParams(groups: Record<string, string> | undefined): Record<string, string> {
  return Object.fromEntries(Object.entries(groups ?? {}).map(([name, value]) => [name, decodeSegment(value)]))
}

/**
 * Makes a typed route from a customId pattern, so one declaration serves the handler and the ids that
 * reach it. `@Command(route, type)` takes it as it takes the pattern's text, with the same ranking and
 * duplicate rules, and `route.build({ ... })` writes a customId, with each param's value in its segment.
 * A missing or unknown param fails to compile.
 *
 * @param pattern - The customId pattern, where `{name}` captures one `/`-separated segment.
 * @returns A route whose `build` takes a value for each param.
 * @throws When the pattern cannot be read, as `@Command` would throw for it.
 *
 * @example
 * ```ts
 * import { route } from 'meocord/common'
 *
 * export const closeTicket = route('ticket/{id}/close')
 *
 * @Command(closeTicket, CommandType.BUTTON)
 * async close(interaction: ButtonInteraction, { id }: { id: string }) {
 *   await interaction.reply(`Closed ticket ${id}`)
 * }
 *
 * new ButtonBuilder().setCustomId(closeTicket.build({ id: 42 })).setLabel('Close') // 'ticket/42/close'
 * ```
 */
export function route<const T extends string>(pattern: T): Route<T> {
  const { params } = createRegexFromPattern(pattern)
  const names = new Set(params)

  const build = (values: Record<string, RouteValue> = {}): string => {
    const unknown = Object.keys(values).filter(name => !names.has(name))
    if (unknown.length > 0) throw new TypeError(`route('${pattern}') has no param ${unknown.map(name => `{${name}}`).join(', ')}.`)
    const id = pattern.replace(PLACEHOLDER, (_, name: string) => {
      const value = values[name]
      if (value === undefined || value === null) throw new TypeError(`route('${pattern}').build() needs a value for {${name}}.`)
      const text = String(value)
      if (text === '') throw new TypeError(`route('${pattern}').build() got an empty {${name}}, which no customId segment can hold.`)
      return encodeSegment(text)
    })
    if (id.length > MAX_CUSTOM_ID_LENGTH) {
      throw new RangeError(`route('${pattern}').build() made a customId of ${id.length} characters, over Discord's ${MAX_CUSTOM_ID_LENGTH}: "${id}".`)
    }
    return id
  }

  return Object.freeze({
    pattern,
    build: build as Route<T>['build'],
    toString: () => pattern,
  })
}

