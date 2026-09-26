/**
 * Checks that matching a message stays within its budget, under Bun and under Node: every message in every
 * server is matched, so an accidental cost per route would slow a busy bot's whole event loop. A message's
 * cost is measured against a reference workload run on the same machine in the same run, so the budgets
 * hold on a laptop and on a shared CI runner alike. A scan over the routes, which costs hundreds of times
 * more at 1000 routes than at 10, fails the flatness check whatever the machine.
 */
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { CASES, type Case, type Measured, ROUTE_COUNTS, run } from './lib/message-bench.js'

/**
 * What a message may cost, at any number of routes, in calls of the reference workload, for each runtime.
 * The reference tracks Bun's matching closely on any machine, but on CI runners Node's matching slows about
 * twice as much as Node's reference does, so Node's budgets sit at 1.6x the highest it measured there.
 */
const BUDGET_REFERENCES: Record<'bun' | 'node', Record<Case, number>> = {
  bun: { chatter: 1, unknown: 8, matching: 10 },
  node: { chatter: 1, unknown: 10, matching: 16 },
}
/** What a message may cost on any machine, in nanoseconds, so a slowdown the reference shares still fails. */
const CAP_NS = 10_000
/** How much more a message may cost at 1000 routes than at 10: the index keeps it flat. */
const MAX_GROWTH = 3

function underNode(): Measured {
  const dir = mkdtempSync(path.join(tmpdir(), 'meocord-bench-'))
  try {
    const built = spawnSync(
      process.execPath,
      ['build', path.join(import.meta.dirname, 'lib/message-bench.ts'), '--target=node', '--outfile', path.join(dir, 'message-bench.mjs')],
      { encoding: 'utf8' },
    )
    if (built.status !== 0) throw new Error(`Could not bundle the benchmark for Node:\n${built.stderr}`)
    const ran = spawnSync('node', [path.join(dir, 'message-bench.mjs')], { encoding: 'utf8' })
    if (ran.status !== 0) throw new Error(`The benchmark failed under Node:\n${ran.stderr}`)
    return JSON.parse(ran.stdout.trim().split('\n').at(-1)!) as Measured
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const failures: string[] = []
for (const [runtime, { referenceNs, results }] of [
  ['bun', run()],
  ['node', underNode()],
] as const) {
  // Each cost is printed in nanoseconds and in calls of the reference workload, `ref`
  const inRefs = (ns: number) => ns / referenceNs
  console.log(`${runtime}: reference ${referenceNs.toFixed(0)} ns`)
  for (const count of ROUTE_COUNTS) {
    const cells = CASES.map(c => `${c} ${results[count][c].toFixed(0).padStart(5)} ns ${inRefs(results[count][c]).toFixed(2).padStart(6)} ref`)
    console.log(`  ${String(count).padStart(4)} routes  ${cells.join('   ')}`)
  }
  for (const c of CASES) {
    for (const count of ROUTE_COUNTS) {
      const ns = results[count][c]
      const budget = BUDGET_REFERENCES[runtime][c]
      if (inRefs(ns) > budget) {
        failures.push(`${runtime}: ${c} at ${count} routes took ${inRefs(ns).toFixed(2)} ref (${ns.toFixed(0)} ns), over its ${budget} ref budget`)
      }
      if (ns > CAP_NS) failures.push(`${runtime}: ${c} at ${count} routes took ${ns.toFixed(0)} ns, over the ${CAP_NS} ns cap`)
    }
    const growth = results[1000][c] / results[10][c]
    if (growth > MAX_GROWTH) {
      failures.push(`${runtime}: ${c} costs ${growth.toFixed(1)}x more at 1000 routes than at 10 (at most ${MAX_GROWTH}x)`)
    }
  }
}

if (failures.length > 0) {
  console.error(`\nMessage matching is over budget:\n${failures.map(f => `  ${f}`).join('\n')}`)
  process.exit(1)
}
console.log('\nMessage matching is within budget.')
