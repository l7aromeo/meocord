import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import path from 'path'
import { createRsbuild } from '@rsbuild/core'
import { vi } from 'vitest'
import { createRsbuildConfig } from '@src/build/rsbuild-config.js'

/**
 * Builds a decorated application with the real pipeline and runs the output.
 *
 * Everything asserted here fails silently otherwise. Lost decorator metadata is not a compile
 * error -- inversify throws when the class is first defined, at import. A mangled class name
 * breaks injection in production while development stays fine. An asset under 4 KB, left to
 * Rsbuild's default, becomes a data URI that fs cannot read. A typecheck, and the unit tests on the config object, pass
 * through all three; only running the bundle shows them.
 *
 * The fixture lives inside the repository, in a directory git ignores, so `reflect-metadata`
 * resolves from this package's node_modules the way it would from an application's.
 */
const repoRoot = path.resolve(import.meta.dirname, '..', '..')
const fixture = path.join(repoRoot, '.rsbuild-spec')

// A 1x1 PNG, well under the 4 KB Rsbuild would otherwise inline as a data URI.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const MAIN = `
import 'reflect-metadata'
import icon from './icon.png'

function Injectable(): ClassDecorator {
  return () => {}
}

class Dependency {}

@Injectable()
class Consumer {
  constructor(readonly dependency: Dependency) {}
}

const paramTypes = Reflect.getMetadata('design:paramtypes', Consumer)

console.log(JSON.stringify({
  metadataResolves: Array.isArray(paramTypes) && paramTypes[0] === Dependency,
  consumerName: Consumer.name,
  dependencyName: Dependency.name,
  icon,
}))
`

interface RunResult {
  metadataResolves: boolean
  consumerName: string
  dependencyName: string
  icon: string
}

async function buildAndRun(mode: 'production' | 'development'): Promise<RunResult> {
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(fixture)
  try {
    const rsbuild = await createRsbuild({
      cwd: fixture,
      config: { ...createRsbuildConfig({ mode }), performance: { printFileSize: false } },
    })
    await rsbuild.build()
  } finally {
    cwd.mockRestore()
  }

  const output = execFileSync('node', [path.join(fixture, 'dist', 'main.js')], { cwd: fixture, encoding: 'utf8' })
  return JSON.parse(output.trim().split('\n').at(-1)!) as RunResult
}

beforeAll(() => {
  rmSync(fixture, { recursive: true, force: true })
  mkdirSync(path.join(fixture, 'src'), { recursive: true })
  writeFileSync(
    path.join(fixture, 'package.json'),
    JSON.stringify({ name: 'rsbuild-spec', private: true, type: 'module', dependencies: { 'reflect-metadata': '*' } }),
  )
  writeFileSync(
    path.join(fixture, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true, target: 'es2022' } }),
  )
  writeFileSync(path.join(fixture, 'src', 'main.ts'), MAIN)
  writeFileSync(path.join(fixture, 'src', 'icon.png'), TINY_PNG)
})

afterAll(() => {
  rmSync(fixture, { recursive: true, force: true })
})

describe('the Rsbuild pipeline, built and run', () => {
  it.each(['production', 'development'] as const)('keeps decorator metadata in a %s build', async mode => {
    const result = await buildAndRun(mode)

    expect(result.metadataResolves).toBe(true)
  })

  it('keeps class names through production minification', async () => {
    const result = await buildAndRun('production')

    expect(result.consumerName).toBe('Consumer')
    expect(result.dependencyName).toBe('Dependency')
  })

  // Rsbuild reads the asset prefix from a different option in each mode, so one passing says
  // nothing about the other.
  it.each(['production', 'development'] as const)('resolves a small asset import to a file that exists in a %s build', async mode => {
    const result = await buildAndRun(mode)

    expect(result.icon).not.toMatch(/^data:/)
    expect(path.isAbsolute(result.icon), `resolved to ${result.icon}`).toBe(true)
    expect(existsSync(result.icon), `resolved to ${result.icon}`).toBe(true)
  })
}, 60_000)
