/**
 * Measures what theming adds to one handler call through the pipeline: nothing set, an app theme, a `@UseTheme`
 * scope, and a scope whose handler reads the theme. A plain call with no theme at all, measured in the same run, is
 * the reference, so the budgets hold on any machine. Prints one JSON line of nanoseconds; `scripts/bench-theme.ts`
 * runs it under Bun and Node and checks the budgets.
 */
import 'reflect-metadata'
import { Container } from 'inversify'
import { Controller } from '../../src/decorator/controller-class.decorator.js'
import { UseTheme } from '../../src/decorator/theme.decorator.js'
import { bindGlobalStages, prepareHandlerStages, runHandler } from '../../src/core/handler-pipeline.js'
import { claimAmbientAppTheme } from '../../src/core/theme-runtime.js'
import { useTheme } from '../../src/core/theme-scope.js'

export const CASES = ['app', 'scoped', 'read'] as const
export type Case = (typeof CASES)[number]
export interface Measured {
  plainNs: number
  results: Record<Case, number>
}

/** Written by the handlers, so the runtime cannot drop their work as unused. */
export let sink = 0

@Controller()
class Plain {
  run() {
    sink++
  }
}

@Controller()
class AppThemed {
  run() {
    sink++
  }
}

@Controller()
@UseTheme({ colors: { primary: '#000001' } })
class Scoped {
  run() {
    sink++
  }
}

@Controller()
@UseTheme({ colors: { primary: '#000002' } })
class Reads {
  run() {
    const theme = useTheme()
    sink += String(theme.colors.primary).length + theme.emojis.loading.length
  }
}

function containerFor(cls: new () => unknown, theme?: object): { container: Container; instance: Record<string, (...args: unknown[]) => unknown> } {
  const container = new Container()
  bindGlobalStages(container, { guards: [], interceptors: [], filters: [], ...(theme && { theme }) })
  prepareHandlerStages(container, [cls])
  return { container, instance: new cls() as Record<string, (...args: unknown[]) => unknown> }
}

/** Each target's fastest of several rounds, in nanoseconds per call, the targets taking turns within each round. */
async function time<K extends string>(targets: Record<K, ReturnType<typeof containerFor>>, iterations: number): Promise<Record<K, number>> {
  const fastest = {} as Record<K, number>
  const entries = Object.entries(targets) as [K, ReturnType<typeof containerFor>][]
  for (let round = 0; round < 9; round++) {
    for (const [name, target] of entries) {
      const started = process.hrtime.bigint()
      for (let i = 0; i < iterations; i++) await runHandler(target.container, target.instance, 'run', [{}], { type: 'event' })
      const ns = Number(process.hrtime.bigint() - started) / iterations
      // The first round warms every target up
      if (round > 0) fastest[name] = Math.min(fastest[name] ?? Infinity, ns)
    }
  }
  return fastest
}

export async function run(): Promise<Measured> {
  const app = containerFor(AppThemed, { colors: { primary: '#000003' } })
  // The bot's own app, whose theme is read outside a call, so its calls need no scope
  claimAmbientAppTheme(app.container)
  const { plain, ...results } = await time(
    { plain: containerFor(Plain), app, scoped: containerFor(Scoped), read: containerFor(Reads) },
    30_000,
  )
  return { plainNs: plain, results }
}

if (import.meta.main ?? process.argv[1]?.endsWith('theme-bench.mjs')) {
  run().then(measured => console.log(JSON.stringify(measured)))
}
