/**
 * Generates every component through the built CLI and typechecks the result, since a template
 * that renders fine can still produce code that does not compile.
 * Run after `bun run build`: it drives `dist`, so it covers the `exports` map and the template copy too.
 */

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ControllerType } from '../src/enum/controller.enum.js'
import { AppGeneratorHelper } from '../src/bin/helper/app-generator.helper.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workDir = path.join(repoRoot, '.generated-check')
const cli = path.join(repoRoot, 'dist', 'esm', 'bin', 'meocord.js')
const tsc = path.join(repoRoot, 'node_modules', '.bin', 'tsc')

/**
 * Resolves bare `meocord/...` imports the way a real application does.
 *
 * A `paths` mapping in the scratch tsconfig would work too, but it would resolve
 * straight to the declaration files and skip the package `exports` map -- which is
 * itself something that can be wrong, and is worth covering.
 */
const linkedPackage = path.join(repoRoot, 'node_modules', 'meocord')

function link(): boolean {
  if (existsSync(linkedPackage)) return false
  symlinkSync(repoRoot, linkedPackage, 'dir')
  return true
}

function cleanUp(ownsLink: boolean): void {
  rmSync(workDir, { recursive: true, force: true })
  if (ownsLink) unlinkSync(linkedPackage)
}

function scaffold(dir: string): void {
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  writeFileSync(path.join(dir, 'package.json'), `${JSON.stringify({ name: 'generated-check', type: 'module', private: true }, null, 2)}\n`)

  // Mirrors what a generated application compiles as: ESM, bundler resolution (the
  // app is built by Rsbuild, which resolves the extensionless `@src/...` imports in the
  // templates), decorators on.
  const tsconfig = {
    compilerOptions: {
      module: 'ESNext',
      target: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
      verbatimModuleSyntax: true,
      skipLibCheck: true,
      noImplicitAny: false,
      paths: { '@src/*': ['./src/*'] },
      types: ['node', 'reflect-metadata', 'vitest/globals'],
    },
    include: ['src/**/*.ts'],
  }
  writeFileSync(path.join(dir, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`)
}

function generate(dir: string, type: ControllerType, name: string): void {
  execFileSync(process.execPath, [cli, 'g', 'co', type, name], { cwd: dir, stdio: 'pipe' })
}

/**
 * Generates every controller type under one name shape, in its own project, and typechecks it.
 * Each shape stands alone: flat names write the top-level builder, which would let a nested
 * controller's wrong import to it resolve.
 */
function verify(label: string, name: string, types: ControllerType[]): void {
  const dir = path.join(workDir, label)
  scaffold(dir)

  for (const type of types) generate(dir, type, name)

  execFileSync(tsc, ['--noEmit', '-p', 'tsconfig.json'], { cwd: dir, stdio: 'inherit' })
  console.log(`  ${label}: ${types.length} controller types typecheck clean`)
}

/**
 * Every file under a directory, skipping node_modules -- which here links back to the repository,
 * so walking into it would never end.
 */
function filesIn(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name === 'node_modules') return []
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? filesIn(full) : [full]
  })
}

/**
 * Renders the packaged application template and typechecks the result.
 *
 * The template ships with the framework, so a change to either can break the other. The
 * application is generated from `dist`, and its dependencies are the ones the consumer
 * would resolve, so nothing here passes on the repository's own installs.
 */
function verifyApp(): void {
  const dir = path.join(workDir, 'app')
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })

  new AppGeneratorHelper().generateApp(dir, {
    appName: 'generated-check',
    displayName: 'Generated Check',
    // The manifest is what a real install would resolve; a range is not needed to
    // typecheck against the framework already linked into the check.
    version: '0.0.0',
    packageManager: 'npm',
    runtimePrefix: '',
  })

  // The framework is linked rather than installed: the version the template pins is not
  // published yet, and it is this build the template has to work against.
  mkdirSync(path.join(dir, 'node_modules'), { recursive: true })
  symlinkSync(repoRoot, path.join(dir, 'node_modules', 'meocord'), 'dir')
  symlinkSync(path.join(repoRoot, 'node_modules', 'discord.js'), path.join(dir, 'node_modules', 'discord.js'), 'dir')

  // Every generator runs inside the application, and the result is checked with the application's
  // own tsconfigs rather than the scaffold above: those are stricter (noUnusedParameters,
  // verbatimModuleSyntax), and they are what a user's `lint` script runs. Controllers alone, in the
  // scaffold, would let a guard or service template that fails them through.
  const cliIn = (...args: string[]) => execFileSync(process.execPath, [cli, ...args], { cwd: dir, stdio: 'pipe' })
  for (const name of ['Generated', 'admin/generated']) {
    for (const type of Object.values(ControllerType)) cliIn('g', 'co', type, name)
    cliIn('g', 's', name)
    cliIn('g', 'gu', name)
  }

  // Without --noEmit: the application's tsconfig sets it, and a user running plain `tsc` must not
  // find compiled files -- a meocord.config.js above all -- written beside their sources.
  const before = new Set(filesIn(dir))
  for (const project of ['tsconfig.json', 'tsconfig.test.json']) {
    execFileSync(tsc, ['-p', project], { cwd: dir, stdio: 'inherit' })
  }
  const emitted = filesIn(dir).filter(file => !before.has(file))
  if (emitted.length > 0) throw new Error(`tsc wrote files into the application: ${emitted.join(', ')}`)

  console.log('  app: template, meocord.config.ts and every generated component typecheck clean; nothing emitted')
}

/**
 * Checks the CLI's interpreter line is `#!/usr/bin/env <prog>`, the only form npm's `cmd-shim`
 * turns into a `.cmd` that Windows can run.
 */
function verifyShebang(): void {
  const [interpreter] = readFileSync(cli, 'utf8').split('\n', 1)

  if (interpreter !== '#!/usr/bin/env node') {
    throw new Error(`CLI interpreter line is "${interpreter}", which npm cannot shim on Windows.`)
  }

  console.log('  cli: interpreter line is shimmable on Windows')
}

function main(): void {
  if (!existsSync(cli)) {
    console.error(`Built CLI not found at ${path.relative(repoRoot, cli)}. Run "bun run build" first.`)
    process.exit(1)
  }

  const ownsLink = link()

  try {
    rmSync(workDir, { recursive: true, force: true })
    mkdirSync(workDir, { recursive: true })

    const types = Object.values(ControllerType)
    verify('flat', 'Sample', types)
    // A nested name moves the controller and its builder together, so the import
    // between them has to move with them.
    verify('nested', 'admin/nested', types)
    verifyApp()
    verifyShebang()

    console.log('Generated applications build.')
  } catch (error) {
    console.error('\nGenerated application failed to build. The output above names the file.')
    if (!(error instanceof Error) || !('status' in error)) console.error(error)
    process.exitCode = 1
  } finally {
    cleanUp(ownsLink)
  }
}

main()
