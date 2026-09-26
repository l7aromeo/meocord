/**
 * What checking handlers against their message patterns costs the type checker: 200 handlers with typed
 * patterns, and the same 200 with patterns whose params are untyped, compiled against the repository's
 * own decorators. Instantiations are a count, the same on every machine, unlike check time.
 */
import { spawnSync } from 'child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import path from 'path'

const ROOT = path.resolve(import.meta.dirname, '../..')

const KINDS = [
  ['ban {target:member} {reason...?}', '{ target: GuildMember; reason?: string }'],
  ['pay {to:member} {amount:int} {note...?}', '{ to: GuildMember; amount: number; note?: string }'],
  ['remind {after:duration} {what...}', '{ after: number; what: string }'],
  ['role add {who:member} {role:role}', '{ who: GuildMember; role: Role }'],
  ['config set {key:prefix|lang} {value...}', "{ key: 'prefix' | 'lang'; value: string }"],
  ['purge {count:int} {--bots} {--from:user?}', '{ count: number; bots: boolean; from?: User }'],
  ['kick {targets:member...}', '{ targets: GuildMember[] }'],
] as const

function handlers(typed: boolean): string {
  const lines = [
    `import { type GuildMember, type Message, type Role, type User } from 'discord.js'`,
    `import { MessageHandler } from '@src/decorator/index.js'`,
    'export type Resolved = [GuildMember, Role, User]',
    'export class Commands {',
  ]
  for (let i = 0; i < 200; i++) {
    const [pattern, params] = KINDS[i % KINDS.length]
    const named = pattern.replace(/^(\w+)/, `$1${i}`)
    const written = typed ? named : named.replace(/:[\w|]+/g, '')
    const declared = typed ? params : 'Record<string, string>'
    lines.push(`  @MessageHandler('${written}')`, `  async h${i}(_message: Message, _params: ${declared}) { return undefined }`)
  }
  lines.push('}')
  return lines.join('\n') + '\n'
}

/** Instantiations the checker makes for the typed handlers beyond the untyped ones. */
export function typedPatternInstantiations(): { typed: number; untyped: number } {
  // Inside the repository, so the handlers resolve its node_modules and inherit its `@src` paths
  const cache = path.join(ROOT, 'node_modules/.cache')
  mkdirSync(cache, { recursive: true })
  const dir = mkdtempSync(path.join(cache, 'meocord-types-bench-'))
  try {
    const count = (typed: boolean) => {
      writeFileSync(path.join(dir, 'handlers.ts'), handlers(typed))
      writeFileSync(
        path.join(dir, 'tsconfig.json'),
        JSON.stringify({
          extends: path.join(ROOT, 'tsconfig.json'),
          compilerOptions: { noEmit: true },
          files: [path.join(dir, 'handlers.ts')],
        }),
      )
      const tsc = spawnSync(process.execPath, [path.join(ROOT, 'node_modules/typescript/bin/tsc'), '-p', dir, '--extendedDiagnostics'], {
        encoding: 'utf8',
      })
      const match = /Instantiations:\s+(\d+)/.exec(tsc.stdout)
      if (tsc.status !== 0 || !match) throw new Error(`The type checker failed on the ${typed ? 'typed' : 'untyped'} handlers:\n${tsc.stdout}${tsc.stderr}`)
      return Number(match[1])
    }
    return { typed: count(true), untyped: count(false) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}
