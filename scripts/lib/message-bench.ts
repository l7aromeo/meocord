/**
 * Measures what matching one message costs dispatch, for message patterns in the shapes bots use, at 10,
 * 100 and 1000 routes. Prints one JSON line of nanoseconds per message. It runs under whichever runtime
 * starts it; `scripts/bench-messages.ts` runs it under Bun and Node and checks the budgets.
 */
import 'reflect-metadata'
import { MessageHandler } from '../../src/decorator/controller.decorator.js'
import { buildMessageRoutes, matchMessageRoute } from '../../src/core/message-routes.js'

export const ROUTE_COUNTS = [10, 100, 1000] as const
export const CASES = ['chatter', 'unknown', 'matching'] as const
export type Case = (typeof CASES)[number]
export type Results = Record<(typeof ROUTE_COUNTS)[number], Record<Case, number>>

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

/** Nanoseconds per call, after warming up, over enough calls for the timer's resolution. */
function time(match: (content: string) => unknown, inputs: readonly string[], iterations: number): number {
  for (let i = 0; i < 5_000; i++) match(inputs[i % inputs.length])
  const started = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) match(inputs[i % inputs.length])
  return Number(process.hrtime.bigint() - started) / iterations
}

export function run(): Results {
  const chatter = ['hey what is up everyone lol', 'did anyone see the game last night?', 'ok', 'brb getting food 🍕']
  const unknown = ['!unknowncmd foo bar', '!help me please']
  const results = {} as Results
  for (const count of ROUTE_COUNTS) {
    const routes = routesFor(count)
    const starts = { prefixes: ['!'] }
    const match = (content: string) => matchMessageRoute(routes, content, starts)
    const hit = Math.floor(count / 2) + 1
    const matching = [`!cmd${hit} alpha beta gamma`, `!CMD${hit} "two words" beta gamma`]
    if (!match(matching[0])) throw new Error(`The benchmark's matching message reaches no route at ${count} routes.`)
    results[count] = {
      chatter: time(match, chatter, 400_000),
      unknown: time(match, unknown, 200_000),
      matching: time(match, matching, 200_000),
    }
  }
  return results
}

if (import.meta.main ?? process.argv[1]?.endsWith('message-bench.mjs')) console.log(JSON.stringify(run()))
