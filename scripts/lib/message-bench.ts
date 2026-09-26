/**
 * Measures what matching one message costs dispatch, for message patterns in the shapes bots use, at 10,
 * 100 and 1000 routes, and what a fixed reference workload costs on the same machine in the same run.
 * Prints one JSON line of nanoseconds. It runs under whichever runtime starts it;
 * `scripts/bench-messages.ts` runs it under Bun and Node and checks the budgets.
 */
import 'reflect-metadata'
import { MessageHandler } from '../../src/decorator/controller.decorator.js'
import { buildMessageRoutes, matchMessageCommand, matchMessageRoute } from '../../src/core/message-routes.js'

export const ROUTE_COUNTS = [10, 100, 1000] as const
export const CASES = ['chatter', 'unknown', 'matching'] as const
export type Case = (typeof CASES)[number]
export type Results = Record<(typeof ROUTE_COUNTS)[number], Record<Case, number>>
/** Nanoseconds per message for each route count and case, and per call of the reference workload. */
export interface Measured {
  referenceNs: number
  results: Results
}

/** A command word, sometimes a subcommand, then params, rests and optionals. */
function patternFor(i: number): string {
  switch (i % 5) {
    case 0:
      return `cmd${i} {a}`
    case 1:
      return `cmd${i} {a} {b...}`
    case 2:
      return `cmd${i} sub {x} {y?}`
    case 3:
      return `grp${i % 37} cmd${i} {z} {rest...?}`
    default:
      return `cmd${i} {a} {b} {c}`
  }
}

function routesFor(count: number) {
  const controllers: (new () => unknown)[] = []
  for (let start = 0; start < count; start += 50) {
    const controller = class {}
    Object.defineProperty(controller, 'name', { value: `Commands${start}` })
    for (let i = start; i < Math.min(start + 50, count); i++) {
      const method = `command${i}`
      ;(controller.prototype as Record<string, unknown>)[method] = () => undefined
      MessageHandler(patternFor(i))(controller.prototype, method, Object.getOwnPropertyDescriptor(controller.prototype, method) as never)
    }
    controllers.push(controller)
  }
  return buildMessageRoutes(controllers)
}

/**
 * Nanoseconds per call, after warming up, over enough calls for the timer's resolution: the fastest of a few
 * rounds, since a busy machine only ever slows a round down.
 */
function time(match: (content: string) => unknown, inputs: readonly string[], iterations: number): number {
  for (let i = 0; i < 5_000; i++) match(inputs[i % inputs.length])
  let fastest = Infinity
  for (let round = 0; round < 3; round++) {
    const started = process.hrtime.bigint()
    for (let i = 0; i < iterations; i++) match(inputs[i % inputs.length])
    fastest = Math.min(fastest, Number(process.hrtime.bigint() - started) / iterations)
  }
  return fastest
}

const KNOWN_WORDS = new Map(['help', 'ping', 'roll', 'ban', 'kick', 'mute', 'play', 'skip'].map((word, i) => [word, i]))
/** Written by the reference workload and exported, so the runtime cannot drop the work as unused. */
export let referenceSink = 0

/**
 * The reference workload: the kind of work matching does, splitting a message into words and looking each up,
 * written plainly and apart from the matcher, so a change to the matcher cannot move it. Budgets are multiples
 * of what it costs on the machine running the check.
 */
function reference(content: string): number {
  let found = 0
  let i = 0
  while (i < content.length) {
    while (i < content.length && content.charCodeAt(i) === 32) i++
    const start = i
    while (i < content.length && content.charCodeAt(i) !== 32) i++
    if (i > start) found += KNOWN_WORDS.get(content.slice(start, i).toLowerCase()) ?? i - start
  }
  return (referenceSink = found)
}

export function run(): Measured {
  const chatter = ['hey what is up everyone lol', 'did anyone see the game last night?', 'ok', 'brb getting food 🍕']
  const unknown = ['!unknowncmd foo bar', '!help me please']
  const referenceNs = time(reference, [...chatter, ...unknown, '!roll 20 for luck', '!ban someone for spam'], 400_000)
  const results = {} as Results
  for (const count of ROUTE_COUNTS) {
    const routes = routesFor(count)
    const starts = { prefixes: ['!'] }
    // As dispatch does: the route a message matches, or else the command it names, for its usage
    const match = (content: string) => matchMessageRoute(routes, content, starts) ?? matchMessageCommand(routes, content, starts)
    const hit = Math.floor(count / 2) + 1
    const matching = [`!cmd${hit} alpha beta gamma`, `!CMD${hit} "two words" beta gamma`]
    if (!match(matching[0])) throw new Error(`The benchmark's matching message reaches no route at ${count} routes.`)
    results[count] = {
      chatter: time(match, chatter, 400_000),
      unknown: time(match, unknown, 200_000),
      matching: time(match, matching, 200_000),
    }
  }
  return { referenceNs, results }
}

if (import.meta.main ?? process.argv[1]?.endsWith('message-bench.mjs')) console.log(JSON.stringify(run()))
