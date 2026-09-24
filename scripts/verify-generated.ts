/**
 * Generates an application and every component with the built CLI, installs it from the packed
 * framework, and runs the application's own checks: both tsconfigs, tests, coverage, both builds and
 * lint without `--fix`. Run after `bun run build`; packing covers the `files` list and `exports` map.
 */

import { spawnSync } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { fileURLToPath } from 'url'
import { ControllerType } from '../src/enum/controller.enum.js'
import { AppGeneratorHelper } from '../src/bin/helper/app-generator.helper.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const builtCli = path.join(repoRoot, 'dist', 'esm', 'bin', 'meocord.js')

/**
 * Outside the repository, so module resolution cannot climb into the repository's node_modules and
 * find a package the application forgot to declare.
 */
const workDir = mkdtempSync(path.join(tmpdir(), 'meocord-verify-'))
const appDir = path.join(workDir, 'app')

/** The CLI as the application installed it, from the packed tarball. */
const installedCli = path.join(appDir, 'node_modules', 'meocord', 'dist', 'esm', 'bin', 'meocord.js')

/**
 * The environment every step runs in. `NODE_ENV` is dropped because the CLI keeps an inherited one,
 * which would make `build --dev` build for production; colour is off so failures read cleanly.
 */
const stepEnv: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1' }
delete stepEnv.FORCE_COLOR
delete stepEnv.NODE_ENV

/** Runs a command, printing one line on success and the command's full output on failure. */
function run(label: string, command: string, args: string[], cwd: string, { quiet = false } = {}): void {
  const started = performance.now()
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: stepEnv })
  const seconds = ((performance.now() - started) / 1000).toFixed(1)

  if (result.status !== 0) {
    // Escape sequences stripped: the CLI clears the screen, which would wipe what came before.
    const output = [result.stdout, result.stderr]
      .filter(Boolean)
      .join('\n')
      .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
      .trim()
    throw new Error(
      `${label} failed (${[command, ...args].join(' ')}, in ${path.relative(workDir, cwd) || '.'}):\n\n` +
        (output || String(result.error ?? `exit code ${result.status}`)),
    )
  }

  if (!quiet) console.log(`  ok  ${label} (${seconds}s)`)
}

/** Runs a script or bin of the application the way `bun run` does, honouring each bin's shebang. */
function inApp(label: string, ...args: string[]): void {
  run(label, process.execPath, ['run', ...args], appDir)
}

/** Every file under a directory, skipping installed and built output. Symlinks are not followed. */
function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return []
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? filesIn(full) : [full]
  })
}

/**
 * Packs the framework as npm would publish it, so the application installs the tarball rather than
 * a link to the repository: only what `files` ships, resolved through `exports`.
 */
function pack(): string {
  run('pack the framework', 'npm', ['pack', '--ignore-scripts', '--silent', '--pack-destination', workDir], repoRoot)
  const tarball = readdirSync(workDir).find(name => name.endsWith('.tgz'))
  if (!tarball) throw new Error(`npm pack wrote no tarball into ${workDir}`)
  return path.join(workDir, tarball)
}

/**
 * Runs the built CLI once per argument list, reported as one step.
 *
 * Always before the project has node_modules: a generator formats what it writes with the project's
 * own `eslint --fix` when it finds one, which would hide the lint failures this check looks for.
 */
function generate(label: string, cwd: string, commands: string[][]): void {
  if (existsSync(path.join(cwd, 'node_modules'))) throw new Error(`${label}: generate before installing`)

  const started = performance.now()
  for (const args of commands) run(`${label}: meocord ${args.join(' ')}`, process.execPath, [builtCli, ...args], cwd, { quiet: true })
  console.log(`  ok  ${label}: ${commands.length} generated (${((performance.now() - started) / 1000).toFixed(1)}s)`)
}

/** Renders the application template and points its framework dependency at the packed build. */
function createApp(tarball: string): void {
  mkdirSync(appDir, { recursive: true })

  new AppGeneratorHelper().generateApp(appDir, {
    appName: 'generated-check',
    displayName: 'Generated Check',
    version: '0.0.0',
    packageManager: 'bun',
    runtimePrefix: '',
  })

  const manifestPath = path.join(appDir, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dependencies.meocord = `file:${tarball}`
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

/**
 * Runs every generator inside the application, so its lint, tsconfigs and tests cover the
 * generated guards, interceptors, filters, pipes, services and controllers too.
 */
function generateComponents(): void {
  const commands = ['Generated', 'admin/generated'].flatMap(name => [
    ...Object.values(ControllerType).map(type => ['g', 'co', type, name]),
    ['g', 's', name],
    ['g', 'gu', name],
    ['g', 'i', name],
    ['g', 'f', name],
    ['g', 'pi', name],
  ])
  generate('components in the application', appDir, commands)
  run('install the application', process.execPath, ['install'], appDir)
  if (!existsSync(installedCli)) throw new Error(`The packed framework has no CLI at ${path.relative(appDir, installedCli)}`)
}

/**
 * Generates every controller type under one name shape in a project of its own, and typechecks it.
 * Each shape stands alone: flat names write the top-level builder, which would let a nested
 * controller's wrong import to it resolve. The project borrows the application's installed packages.
 */
function verifyShape(label: string, name: string): void {
  const dir = path.join(workDir, label)
  mkdirSync(dir, { recursive: true })
  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: label, type: 'module', private: true }, null, 2)}\n`)
  const tsconfig = {
    extends: '../app/tsconfig.test.json',
    compilerOptions: { rootDir: '.', paths: { '@src/*': ['./src/*'] } },
    include: ['src/**/*.ts'],
    exclude: ['node_modules'],
  }
  writeFileSync(path.join(dir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`)

  generate(`${label} controllers`, dir, Object.values(ControllerType).map(type => ['g', 'co', type, name]))
  symlinkSync(path.join(appDir, 'node_modules'), path.join(dir, 'node_modules'), 'dir')
  run(`typecheck ${label} controllers`, process.execPath, ['run', 'tsc', '-p', 'tsconfig.json'], dir)
}

/** The application's own checks. */
function runAppScripts(): void {
  // Without --noEmit: the tsconfigs set it, and a user running plain `tsc` must not find
  // compiled files -- a meocord.config.js above all -- written beside their sources.
  const before = new Set(filesIn(appDir))
  inApp('tsc -p tsconfig.json', 'tsc', '-p', 'tsconfig.json')
  inApp('tsc -p tsconfig.test.json', 'tsc', '-p', 'tsconfig.test.json')
  const emitted = filesIn(appDir).filter(file => !before.has(file))
  if (emitted.length > 0) throw new Error(`tsc wrote files into the application: ${emitted.join(', ')}`)

  inApp('test', 'test')
  inApp('test:coverage', 'test:coverage')
  inApp('build --dev', 'build:dev')
  inApp('build --prod', 'build:prod')
  if (!existsSync(path.join(appDir, 'dist', 'main.js'))) throw new Error('build --prod wrote no dist/main.js')

  // Without --fix, since generated code has to pass lint as written, and with no warnings allowed.
  // Last, so it also proves the lint config skips the coverage report and build output written above.
  inApp('eslint, without --fix', 'eslint', '--max-warnings=0')
}

/**
 * Checks the CLI's interpreter line is `#!/usr/bin/env <prog>`, the only form npm's `cmd-shim`
 * turns into a `.cmd` that Windows can run.
 */
function verifyShebang(): void {
  const [interpreter] = readFileSync(installedCli, 'utf8').split('\n', 1)

  if (interpreter !== '#!/usr/bin/env node') {
    throw new Error(`CLI interpreter line is "${interpreter}", which npm cannot shim on Windows.`)
  }

  console.log('  ok  CLI interpreter line is shimmable on Windows')
}

function cleanUp(): void {
  rmSync(workDir, { recursive: true, force: true })
}

function main(): void {
  if (!existsSync(builtCli)) {
    console.error(`Built CLI not found at ${path.relative(repoRoot, builtCli)}. Run "bun run build" first.`)
    cleanUp()
    process.exit(1)
  }

  // An interrupted run would otherwise leave a full install behind in the temp directory.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      cleanUp()
      process.exit(130)
    })
  }

  const started = performance.now()
  try {
    console.log(`Verifying a generated application in ${workDir}\n`)
    createApp(pack())
    generateComponents()
    console.log('')
    runAppScripts()
    console.log('')
    // A nested name moves the controller and its builder together, so the import
    // between them has to move with them.
    verifyShape('flat', 'Sample')
    verifyShape('nested', 'admin/nested')
    verifyShebang()

    console.log(`\nThe generated application passes its own checks (${((performance.now() - started) / 1000).toFixed(0)}s).`)
  } catch (error) {
    console.error(`\n${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  } finally {
    cleanUp()
  }
}

main()
