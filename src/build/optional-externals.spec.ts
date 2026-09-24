import { execFileSync, spawnSync } from 'child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { createRsbuild } from '@rsbuild/core'
import { vi } from 'vitest'
import { createRsbuildConfig } from '@src/build/rsbuild-config.js'

/**
 * Bundles an application whose dependency, debug, probes for supports-color inside a try, as most
 * bundled bots do through axios. The fixture sits in a git-ignored directory in the repository, so
 * debug resolves from this package's node_modules; supports-color is not installed there.
 */
const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const fixture = path.join(repoRoot, '.rsbuild-optional-spec')

const MAIN = `
import debug from 'debug'

debug('bot')('started')
console.log('started')
`

async function build(externals: { optionalExternals?: string[]; externals?: string[] }): Promise<string> {
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(fixture)
  try {
    const rsbuild = await createRsbuild({
      cwd: fixture,
      config: {
        ...createRsbuildConfig({ mode: 'production', bundleDependencies: true, entry: path.join(fixture, 'src', 'main.ts'), ...externals }),
        performance: { printFileSize: false },
      },
    })
    await rsbuild.build()
  } finally {
    cwd.mockRestore()
  }
  return readFileSync(path.join(fixture, 'dist', 'main.js'), 'utf8')
}

/** Runs the bundle from a directory with no node_modules anywhere above it, as a deployed dist is. */
function runAlone(): ReturnType<typeof spawnSync> {
  const alone = mkdtempSync(path.join(tmpdir(), 'meocord-optional-'))
  try {
    cpSync(path.join(fixture, 'dist'), alone, { recursive: true })
    writeFileSync(path.join(alone, 'package.json'), JSON.stringify({ type: 'module' }))
    return spawnSync('node', [path.join(alone, 'main.js')], { cwd: alone, encoding: 'utf8' })
  } finally {
    rmSync(alone, { recursive: true, force: true })
  }
}

beforeAll(() => {
  rmSync(fixture, { recursive: true, force: true })
  mkdirSync(path.join(fixture, 'src'), { recursive: true })
  writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify({ name: 'optional-spec', private: true, type: 'module', dependencies: { debug: '*' } }),
  )
  writeFileSync(path.join(fixture, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'es2022' } }))
  writeFileSync(path.join(fixture, 'src', 'main.ts'), MAIN)
  // The spec relies on it: a bundle that imported supports-color would find it here otherwise
  expect(() => execFileSync('node', ['-e', "require.resolve('supports-color')"], { cwd: fixture, stdio: 'pipe' })).toThrow()
})

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true })
})

describe('optionalExternals, built and run with node', () => {
  it('keeps the require where debug calls it, with no import hoisted to the top', async () => {
    const output = await build({ optionalExternals: ['supports-color'] })

    // A require (minified to a short name) in a module debug loads inside its try, never an import
    expect(output).toMatch(/\b\w+\(["']supports-color["']\)/)
    expect(output).not.toMatch(/from\s*["']supports-color["']/)
  })

  it('starts without supports-color installed', async () => {
    await build({ optionalExternals: ['supports-color'] })

    const run = runAlone()

    expect(run.status).toBe(0)
    expect(run.stdout).toContain('started')
  })

  // The case optionalExternals exists for: externals hoists an import that fails before the bot runs
  it('is what keeps the bot starting: listed in externals instead, it fails at startup', async () => {
    const output = await build({ externals: ['supports-color'] })

    expect(output).toMatch(/from\s*["']supports-color["']/)
    const run = runAlone()
    expect(run.status).not.toBe(0)
    expect(run.stderr).toContain('supports-color')
  })
}, 120_000)
