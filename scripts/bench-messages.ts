/**
 * Checks that matching a message stays within its budget, under Bun and under Node: every message in every
 * server is matched, so an accidental cost per route would slow a busy bot's whole event loop. Budgets are
 * several times what a laptop measures, so CI noise passes and a regression to a scan over the routes, which
 * costs hundreds of times more at 1000 routes, fails.
 */
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { CASES, type Case, ROUTE_COUNTS, type Results, run } from './lib/message-bench.js'

/** Nanoseconds per message, at any number of routes. */
const BUDGET_NS: Record<Case, number> = { chatter: 100, unknown: 1_000, matching: 2_000 }
/** How much more a message may cost at 1000 routes than at 10: the index keeps it flat. */
const MAX_GROWTH = 3

function underNode(): Results {
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
    return JSON.parse(ran.stdout.trim().split('\n').at(-1)!) as Results
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const failures: string[] = []
for (const [runtime, results] of [
  ['bun', run()],
  ['node', underNode()],
] as const) {
  console.log(`${runtime}:`)
  for (const count of ROUTE_COUNTS) {
    console.log(`  ${String(count).padStart(4)} routes  ${CASES.map(c => `${c} ${results[count][c].toFixed(0).padStart(5)} ns`).join('   ')}`)
  }
  for (const c of CASES) {
    for (const count of ROUTE_COUNTS) {
      if (results[count][c] > BUDGET_NS[c]) {
        failures.push(`${runtime}: ${c} at ${count} routes took ${results[count][c].toFixed(0)} ns, over its ${BUDGET_NS[c]} ns budget`)
      }
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
