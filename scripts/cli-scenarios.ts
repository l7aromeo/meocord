/**
 * Runs the real CLI, installed from the packed build, through scenarios that must succeed and scenarios
 * that must fail clearly: each asserts the exit code and what the output says. Run after `bun run build`.
 * `--tier fast` (the default) needs no network after one install; `--tier slow` adds installs and builds.
 * `--windows` runs the subset whose paths and shims differ there; `--only <text>` filters by name.
 */

import { spawnSync } from 'child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { cleanEnv, installedCliOf, mustRun, outputOf, pack, renderApp } from './lib/packed-app.js'

type Tier = 'fast' | 'slow'
type Runtime = 'node' | 'bun'

/** One CLI run and what it must produce. */
interface Scenario {
  name: string
  tier: Tier
  /** Also run by `--windows`, the subset where Windows paths and shims differ. */
  windows?: boolean
  /** Runs only on these platforms. */
  platforms?: NodeJS.Platform[]
  /** Where it runs: the installed app, an empty directory, or the directory holding the app. */
  cwd?: 'app' | 'empty' | 'parent'
  /** Files written before it runs, relative to cwd; `null` deletes. Restored afterwards. */
  files?: Record<string, string | null>
  argv: string[]
  runtime?: Runtime
  env?: NodeJS.ProcessEnv
  timeoutMs?: number
  expect: {
    code: number
    /** Text the output must contain. */
    says?: string[]
    /** Text the output must not contain. */
    never?: string[]
    /** Paths, relative to cwd, that must exist afterwards. */
    creates?: string[]
    /** Paths, relative to cwd, that must not exist afterwards. */
    leaves?: string[]
    /** Whether the run must leave the directory's files as they were, outside node_modules and dist. */
    writesNothing?: boolean
    /** Paths, relative to cwd, whose content must be what it was before the run. */
    keeps?: string[]
  }
}

const workDir = mkdtempSync(path.join(tmpdir(), 'meocord-cli-'))
const appDir = path.join(workDir, 'app')
const emptyDir = path.join(workDir, 'empty')
const cli = installedCliOf(appDir)

const validConfig = readFileSync(path.join(import.meta.dirname, '..', 'src', 'bin', 'app-template', 'meocord.config.ts.template'), 'utf8').replace(
  '{{displayName}}',
  'Generated Check',
)

const config = (body: string) => `export default ${body}\n`

/** The binary a runtime is launched with. */
function runtimeBinary(runtime: Runtime): string {
  if (runtime === 'bun') return process.versions.bun ? process.execPath : 'bun'
  return 'node'
}

const dirOf = (scenario: Scenario) => ({ app: appDir, empty: emptyDir, parent: workDir })[scenario.cwd ?? 'app']

/** Writes a scenario's files, returning what restores the directory afterwards. */
function applyFiles(dir: string, files: Record<string, string | null> = {}): () => void {
  const saved = Object.keys(files).map(file => {
    const full = path.join(dir, file)
    return { full, before: existsSync(full) ? readFileSync(full, 'utf8') : null }
  })
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(dir, file)
    if (content === null) rmSync(full, { recursive: true, force: true })
    else {
      mkdirSync(path.dirname(full), { recursive: true })
      writeFileSync(full, content)
    }
  }
  return () => {
    for (const { full, before } of saved) {
      if (before === null) rmSync(full, { recursive: true, force: true })
      else writeFileSync(full, before)
    }
  }
}

/** Every file under a directory, skipping installed and built output. */
function filesIn(dir: string, root = dir): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return []
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? filesIn(full, root) : [path.relative(root, full)]
  })
}

/** Runs one scenario, returning what went wrong, or nothing when it behaved. */
function check(scenario: Scenario): string[] {
  const dir = dirOf(scenario)
  const restore = applyFiles(dir, scenario.files)
  const createdBefore = new Set((scenario.expect.creates ?? []).filter(file => existsSync(path.join(dir, file))))
  const filesBefore = new Set(filesIn(dir))
  const kept = new Map((scenario.expect.keeps ?? []).map(file => [file, readFileSync(path.join(dir, file), 'utf8')]))

  try {
    const result = spawnSync(runtimeBinary(scenario.runtime ?? 'node'), [cli, ...scenario.argv], {
      cwd: dir,
      encoding: 'utf8',
      env: cleanEnv(scenario.env),
      timeout: scenario.timeoutMs ?? 120_000,
      maxBuffer: 64 * 1024 * 1024,
    })
    const output = outputOf(result)
    const problems: string[] = []

    if (result.error) problems.push(`did not finish: ${result.error.message}`)
    if (result.status !== scenario.expect.code) problems.push(`exited ${result.status}, expected ${scenario.expect.code}`)
    // Compared with forward slashes: the CLI prints paths with the platform's own separator.
    const said = output.replace(/\\/g, '/')
    for (const text of scenario.expect.says ?? []) if (!said.includes(text)) problems.push(`does not say "${text}"`)
    for (const text of scenario.expect.never ?? []) if (said.includes(text)) problems.push(`says "${text}"`)
    for (const file of scenario.expect.creates ?? []) {
      if (createdBefore.has(file) || !existsSync(path.join(dir, file))) problems.push(`did not create ${file}`)
    }
    for (const file of scenario.expect.leaves ?? []) if (existsSync(path.join(dir, file))) problems.push(`created ${file}`)
    for (const [file, content] of kept) {
      if (!existsSync(path.join(dir, file)) || readFileSync(path.join(dir, file), 'utf8') !== content) problems.push(`changed ${file}`)
    }
    if (scenario.expect.writesNothing) {
      const written = filesIn(dir).filter(file => !filesBefore.has(file))
      if (written.length > 0) problems.push(`wrote ${written.join(', ')}`)
    }

    if (problems.length > 0) problems.push(`output:\n${output.replace(/^/gm, '      ')}`)
    return problems
  } finally {
    // Anything the run wrote goes, so the next scenario starts from the same app.
    for (const file of filesIn(dir)) if (!filesBefore.has(file)) rmSync(path.join(dir, file), { force: true })
    restore()
  }
}

const scenarios: Scenario[] = [
  // Framework information
  { name: 'prints its version', tier: 'fast', argv: ['--version'], expect: { code: 0, says: ['4.'] } },
  { name: 'lists its commands', tier: 'fast', argv: ['--help'], expect: { code: 0, says: ['create', 'build', 'start', 'register', 'generate'] } },
  { name: 'refuses an unknown command, with help', tier: 'fast', argv: ['frobnicate'], expect: { code: 1, says: ["unknown command 'frobnicate'"] } },
  { name: 'shows the license', tier: 'fast', argv: ['show', '--license'], expect: { code: 0, says: ['MIT License'] } },
  { name: 'shows help for show without a flag', tier: 'fast', argv: ['show'], expect: { code: 1, says: ['--warranty', '--license'] } },

  // Starting and registering without a build
  {
    name: 'start --prod without a build says to build',
    tier: 'fast',
    files: { '.env': 'DISCORD_TOKEN=abc\n', dist: null },
    argv: ['start', '--prod'],
    expect: { code: 1, says: ['main.js) not found', 'build'] },
  },
  {
    name: 'register without a build says to build',
    tier: 'fast',
    files: { '.env': 'DISCORD_TOKEN=abc\n', dist: null },
    argv: ['register'],
    expect: { code: 1, says: ['main.js) not found', 'meocord register --build'] },
  },

  // Configuration
  {
    name: 'build without meocord.config.ts says it is missing',
    tier: 'fast',
    windows: true,
    files: { 'meocord.config.ts': null },
    argv: ['build', '--prod'],
    expect: { code: 1, says: ['meocord.config.ts', 'missing'] },
  },
  {
    name: 'build does not need a token',
    tier: 'fast',
    files: { '.env': 'DISCORD_TOKEN=\n', 'meocord.config.ts': validConfig, dist: null },
    argv: ['build', '--prod'],
    expect: { code: 0, creates: ['dist/main.js'] },
  },
  {
    name: 'start --prod without a token says where the token comes from',
    tier: 'fast',
    files: { '.env': 'DISCORD_TOKEN=\n' },
    argv: ['start', '--prod'],
    expect: { code: 1, says: ['Discord token is missing', 'discordToken', 'meocord.config.ts', '.env'] },
  },
  {
    name: 'build refuses a config of the wrong shape, listing every problem',
    tier: 'fast',
    windows: true,
    files: {
      'meocord.config.ts': config(
        "{ discordToken: 'x', sharding: { mode: 'bogus' }, commands: { guilds: 'not-a-list' }, optionalExternals: 'sharp' }",
      ),
      dist: null,
    },
    argv: ['build', '--prod'],
    expect: {
      code: 1,
      says: [
        'meocord.config.ts',
        "sharding.mode must be 'internal' or 'process' (got 'bogus')",
        'commands.guilds must be an array of guild ids',
        'optionalExternals must be an array of package names',
      ],
      never: ['Building production version'],
      leaves: ['dist/main.js'],
    },
  },
  {
    name: 'start and register refuse a config of the wrong shape too',
    tier: 'fast',
    files: { 'meocord.config.ts': config("{ discordToken: 'x', shutdownTimeout: 'soon' }") },
    argv: ['register'],
    expect: { code: 1, says: ['shutdownTimeout must be a number of milliseconds'] },
  },
  {
    name: 'build warns about a key it does not know, and builds',
    tier: 'fast',
    files: { 'meocord.config.ts': config("{ discordToken: 'x', bundleDependancies: true }"), dist: null },
    argv: ['build', '--prod'],
    expect: { code: 0, says: ['bundleDependancies', 'not a MeoCord option'], creates: ['dist/main.js'] },
  },
  {
    name: 'a config with a syntax error stops the build, naming the line',
    tier: 'fast',
    windows: true,
    files: { 'meocord.config.ts': "export default { discordToken: 'x',\n", dist: null },
    argv: ['build', '--prod'],
    expect: { code: 1, says: ['meocord.config.ts:2'], never: ['Building production version'], leaves: ['dist/meocord.config.mjs'] },
  },
  {
    name: 'a config that fails to compile leaves the last compiled one in place',
    tier: 'fast',
    files: {
      'meocord.config.ts': "import './does-not-exist'\nexport default { discordToken: 'x' }\n",
      'dist/meocord.config.mjs': "export default { discordToken: 'last good' }\n",
    },
    argv: ['build', '--prod'],
    expect: { code: 1, keeps: ['dist/meocord.config.mjs'] },
  },

  // Generators: every kind, and the alias of each
  ...[
    ['service', 's', 'service'],
    ['guard', 'gu', 'guard'],
    ['interceptor', 'i', 'interceptor'],
    ['filter', 'f', 'filter'],
    ['pipe', 'pi', 'pipe'],
  ].flatMap(([command, alias, kind]): Scenario[] => [
    {
      name: `generate ${command} writes the file and its spec`,
      tier: 'fast',
      argv: ['generate', command, 'Probe'],
      expect: { code: 0, creates: [`src/${kind}s/probe.${kind}.ts`, `src/${kind}s/probe.${kind}.spec.ts`] },
    },
    {
      name: `g ${alias} is generate ${command}, nested`,
      tier: 'fast',
      windows: true,
      argv: ['g', alias, 'admin/probe'],
      expect: { code: 0, creates: [`src/${kind}s/admin/probe.${kind}.ts`] },
    },
  ]),
  {
    name: 'g co slash writes the controller, its spec and its builder',
    tier: 'fast',
    windows: true,
    argv: ['g', 'co', 'slash', 'Probe'],
    expect: {
      code: 0,
      creates: ['src/controllers/slash/probe.slash.controller.ts', 'src/controllers/slash/probe.slash.controller.spec.ts', 'src/controllers/slash/builders/probe.builder.ts'],
    },
  },
  {
    name: 'g co button writes no builder',
    tier: 'fast',
    argv: ['g', 'co', 'button', 'Probe'],
    expect: { code: 0, creates: ['src/controllers/button/probe.button.controller.ts'], leaves: ['src/controllers/button/builders'] },
  },
  {
    name: 'generate refuses to overwrite, naming the files, and writes nothing',
    tier: 'fast',
    windows: true,
    files: { 'src/services/taken.service.ts': '// mine\n' },
    argv: ['g', 's', 'Taken'],
    expect: { code: 1, says: ['Refusing to overwrite', 'src/services/taken.service.ts'], writesNothing: true },
  },
  {
    name: 'generate refuses a name that is not a class name',
    tier: 'fast',
    windows: true,
    argv: ['g', 'co', 'slash', '!!!'],
    expect: { code: 1, says: ['Invalid class name "!!!"'], writesNothing: true },
  },
  ...['../escape', '../../escape', '/tmp/escape', 'C:/escape'].map(
    (name): Scenario => ({
      name: `generate refuses the path ${name}`,
      tier: 'fast',
      windows: true,
      argv: ['g', 's', name],
      expect: { code: 1, says: ['inside src/services/', 'admin/ban'], writesNothing: true },
    }),
  ),
  {
    name: 'generate takes a backslash as a folder separator on Windows',
    tier: 'fast',
    windows: true,
    platforms: ['win32'],
    argv: ['g', 's', 'admin\\probe'],
    expect: { code: 0, creates: ['src/services/admin/probe.service.ts'] },
  },
  {
    name: "generate outside a project says to run it from the project's root",
    tier: 'fast',
    windows: true,
    cwd: 'empty',
    argv: ['g', 's', 'Loose'],
    expect: { code: 1, says: ["from your project's root"], writesNothing: true },
  },
  {
    name: 'generate refuses an unknown controller type, listing the types',
    tier: 'fast',
    argv: ['g', 'co', 'wizard', 'Probe'],
    expect: { code: 1, says: ["'wizard' is invalid", 'button', 'primary-entry-point'] },
  },

  // Create: what it refuses before installing anything
  {
    name: 'create refuses a directory that exists',
    tier: 'fast',
    windows: true,
    cwd: 'parent',
    argv: ['create', 'app', '--use-bun'],
    expect: { code: 1, says: ['Directory "app" already exists'] },
  },
  {
    name: 'create refuses a name with no letters or digits',
    tier: 'fast',
    windows: true,
    cwd: 'parent',
    argv: ['create', '!!!', '--use-bun'],
    expect: { code: 1, says: ['needs a name', 'my-bot'], never: ['already exists'] },
  },
]

function main(): void {
  const tierArg = process.argv[process.argv.indexOf('--tier') + 1]
  const tiers: Tier[] = process.argv.includes('--tier') ? (tierArg === 'all' ? ['fast', 'slow'] : [tierArg as Tier]) : ['fast']
  const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : undefined
  const windowsOnly = process.argv.includes('--windows')
  const selected = scenarios.filter(
    scenario =>
      tiers.includes(scenario.tier) &&
      (!windowsOnly || scenario.windows) &&
      (!scenario.platforms || scenario.platforms.includes(process.platform)) &&
      (!only || scenario.name.includes(only)),
  )

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      rmSync(workDir, { recursive: true, force: true })
      process.exit(130)
    })
  }

  const started = performance.now()
  try {
    console.log(`Running ${selected.length} CLI scenarios in ${workDir}\n`)
    mkdirSync(emptyDir)
    renderApp(appDir, pack(workDir))
    mustRun('install the application', process.execPath, ['install'], appDir)
    cpSync(path.join(appDir, '.env.example'), path.join(appDir, '.env'))

    let failed = 0
    for (const scenario of selected) {
      const scenarioStarted = performance.now()
      const problems = check(scenario)
      const seconds = ((performance.now() - scenarioStarted) / 1000).toFixed(1)
      if (problems.length === 0) {
        console.log(`  ok    ${scenario.name} (${seconds}s)`)
      } else {
        failed++
        console.log(`  FAIL  ${scenario.name} (${seconds}s)\n${problems.map(problem => `    - ${problem}`).join('\n')}`)
      }
    }

    const total = ((performance.now() - started) / 1000).toFixed(0)
    console.log(failed === 0 ? `\nEvery scenario behaved (${total}s).` : `\n${failed} of ${selected.length} scenarios failed (${total}s).`)
    if (failed > 0) process.exitCode = 1
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

main()
