import { execFileSync } from 'child_process'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import path from 'path'
import { pathToFileURL } from 'url'
import { createRsbuild, rspack } from '@rsbuild/core'
import { vi } from 'vitest'
import { createRsbuildConfig } from '@src/build/rsbuild-config.js'
import { installStackRemapper } from '@src/build/stack-remap.js'

describe('installStackRemapper', () => {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'meocord-remap-')))
  // CommonJS, so Node's own loader runs it rather than the test runner's, which rewrites what it loads
  const bundle = path.join(directory, 'main.cjs')
  const load = createRequire(import.meta.url)
  const runtimeHook = Error.prepareStackTrace

  // A compiled file whose map points line 2 of its code back to line 3 of boom.ts
  const compile = (writeMap = true) => {
    const { code, map } = rspack.experiments.swc.transformSync(
      "// the source\n\nexport function explode(): never {\n  throw new Error('boom')\n}\n",
      {
        filename: 'boom.ts',
        sourceMaps: true,
        jsc: { parser: { syntax: 'typescript' }, target: 'es2022' },
        module: { type: 'commonjs' },
      },
    )
    writeFileSync(bundle, `${code}\n//# sourceMappingURL=main.cjs.map\n`)
    if (writeMap) writeFileSync(`${bundle}.map`, map!)
    else rmSync(`${bundle}.map`, { force: true })
  }
  // Loaded afresh each time, so the module is evaluated from the file as it now is
  const explode = async (): Promise<Error> => {
    delete load.cache[bundle]
    const { explode } = load(bundle) as { explode: () => never }
    try {
      explode()
    } catch (error) {
      return error as Error
    }
    throw new Error('explode() returned')
  }

  beforeEach(() => {
    vi.spyOn(process, 'sourceMapsEnabled', 'get').mockReturnValue(false)
  })

  afterEach(() => {
    Error.prepareStackTrace = runtimeHook
    vi.restoreAllMocks()
  })

  afterAll(() => {
    rmSync(directory, { recursive: true, force: true })
  })

  it('maps each frame to its source, in the frame format of the runtime', async () => {
    compile()

    expect(installStackRemapper(bundle)).toBe(true)
    const [header, top] = (await explode()).stack!.split('\n')

    expect(header).toBe('Error: boom')
    const column = top.match(/:(\d+)\)$/)?.[1]
    expect(top).toBe(`    at explode (${path.join(directory, 'boom.ts')}:4:${column})`)
  })

  // Node and Bun define a hook of their own; a runtime without one gets the same text from this one
  it('writes the stack itself where the runtime has no hook', async () => {
    compile()
    Reflect.deleteProperty(Error, 'prepareStackTrace')

    installStackRemapper(bundle)
    const [header, top] = (await explode()).stack!.split('\n')

    expect(header).toBe('Error: boom')
    expect(top).toMatch(/^ {4}at explode \(.+boom\.ts:4:\d+\)$/)
  })

  it('hands a hook set before it the mapped call sites', async () => {
    compile()
    Error.prepareStackTrace = (_error, sites) => sites.map(site => `${site.getFileName()}:${site.getLineNumber()}`)

    installStackRemapper(bundle)

    expect((await explode()).stack![0]).toBe(`${path.join(directory, 'boom.ts')}:4`)
  })

  // As source-map-support does, which copies a site's methods from its prototype
  it('gives a hook that clones call sites from their prototype the mapped positions', async () => {
    compile()
    Error.prepareStackTrace = (_error, sites) =>
      sites.map(site => {
        const clone: Record<string, () => unknown> = {}
        for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(site))) {
          const method = (site as unknown as Record<string, (...args: unknown[]) => unknown>)[name]
          if (/^(?:is|get)/.test(name)) clone[name] = () => method.call(site)
        }
        return `${clone.getFileName()}:${clone.getLineNumber()}`
      })

    installStackRemapper(bundle)

    expect((await explode()).stack![0]).toBe(`${path.join(directory, 'boom.ts')}:4`)
  })

  it('keeps the bundle positions when the map cannot be read', async () => {
    compile()
    writeFileSync(`${bundle}.map`, '{ not json')

    installStackRemapper(bundle)

    expect((await explode()).stack!.split('\n')[1]).toContain(`${bundle}:`)
  })

  it('installs nothing where the runtime maps stacks itself, or the bundle has no map', () => {
    compile(false)
    expect(installStackRemapper(bundle)).toBe(false)

    compile()
    vi.spyOn(process, 'sourceMapsEnabled', 'get').mockReturnValue(true)
    expect(installStackRemapper(bundle)).toBe(false)
    expect(Error.prepareStackTrace).toBe(runtimeHook)
  })
})

/**
 * Builds an application with the pre-entry, whose code throws from src/boom.ts, and runs it as a bot is
 * run: on Node with and without `--enable-source-maps`, and on Bun, from development and production
 * builds, bundled and not.
 */
const BOOM = `export function explode(): never {
  throw new Error('boom')
}
`
// The call to explode() is on line 12
const MAIN = `import { explode } from './boom'

if (process.env.STACK_HOOK === 'after') {
  const found = Error.prepareStackTrace
  Error.prepareStackTrace = (error, sites) => \`after \${found ? found(error, sites) : sites.join(' ')}\`
} else if (process.env.STACK_HOOK === 'replace') {
  Error.prepareStackTrace = (error, sites) => \`replaced \${sites.map(site => site.getFileName()).join(' ')}\`
}

function stack(): string {
  try {
    explode()
  } catch (error) {
    return (error as Error).stack ?? ''
  }
  return ''
}

console.log(JSON.stringify({ stack: stack(), hooked: Error.prepareStackTrace?.name === 'meocordSourceMappedStackTrace' }))
`
// Set before the bundle runs, as a preloaded error tracker would; shows the call sites it is given
const BEFORE = `Error.prepareStackTrace = (error, sites) =>
  'before ' + sites.slice(0, 2).map(site => site.getFileName() + ':' + site.getLineNumber()).join(' ')
`

const bun = process.versions.bun ? process.execPath : 'bun'

interface Run {
  stack: string
  hooked: boolean
}

function fixtureApp() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'meocord-stacks-')))
  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), content)
  }
  write('package.json', JSON.stringify({ name: 'stacks-spec', private: true, type: 'module' }))
  write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'es2022' } }))
  write('src/boom.ts', BOOM)
  write('src/main.ts', MAIN)
  write('before.mjs', BEFORE)
  return { root, write }
}

async function build(root: string, mode: 'production' | 'development', bundleDependencies: boolean) {
  const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root)
  try {
    const config = createRsbuildConfig({ mode, bundleDependencies })
    const rsbuild = await createRsbuild({ cwd: root, config: { ...config, performance: { printFileSize: false } } })
    await rsbuild.build()
  } finally {
    cwd.mockRestore()
  }
}

function run(root: string, runtime: string, args: string[] = [], env: NodeJS.ProcessEnv = {}): Run {
  const output = execFileSync(runtime, [...args, path.join(root, 'dist', 'main.js')], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '', ...env },
  })
  return JSON.parse(output.trim())
}

/** The file, line and column of the frames for explode() and for its caller in main.ts. */
function frames(stack: string) {
  const lines = stack.split('\n').filter(line => line.startsWith('    at '))
  const location = (line: string | undefined) => line?.match(/\(?([^ ()]+):(\d+):(\d+)\)?$/)?.slice(1)
  return { thrower: location(lines[0]), caller: location(lines[1]), lines }
}

describe.each([
  ['production', false],
  ['production', true],
  ['development', false],
  ['development', true],
] as const)('a %s build (bundleDependencies: %s)', (mode, bundleDependencies) => {
  const { root } = fixtureApp()
  const source = (file: string) => path.join(root, 'src', file)

  beforeAll(async () => {
    await build(root, mode, bundleDependencies)
  }, 120_000)

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('names the source on Node without --enable-source-maps, in the frame format Node writes', () => {
    const { stack, hooked } = run(root, 'node')
    const { thrower, caller, lines } = frames(stack)

    expect(hooked).toBe(true)
    expect(stack.split('\n')[0]).toBe('Error: boom')
    expect(lines[0]).toBe(`    at explode (${source('boom.ts')}:2:${thrower?.[2]})`)
    expect(thrower?.slice(0, 2)).toEqual([source('boom.ts'), '2'])
    expect(caller?.slice(0, 2)).toEqual([source('main.ts'), '12'])
  })

  it('leaves Node to map the stack itself with --enable-source-maps, as meocord start runs it', () => {
    const { stack, hooked } = run(root, 'node', ['--enable-source-maps'])
    const { thrower, caller } = frames(stack)

    expect(hooked).toBe(false)
    expect(thrower?.slice(0, 2)).toEqual([source('boom.ts'), '2'])
    expect(caller?.slice(0, 2)).toEqual([source('main.ts'), '12'])
  })

  it('names the source on Bun', () => {
    const { stack, hooked } = run(root, bun, ['--no-install'])
    const { thrower, caller, lines } = frames(stack)

    expect(hooked).toBe(true)
    expect(lines[0]).toBe(`    at explode (${source('boom.ts')}:2:${thrower?.[2]})`)
    expect(thrower?.slice(0, 2)).toEqual([source('boom.ts'), '2'])
    // Bun reports a call's column further along than Node does. In a minified bundle that position can
    // map to the statement before the call: here line 11, the try, rather than 12.
    expect(caller?.slice(0, 2)).toEqual([source('main.ts'), mode === 'production' ? '11' : '12'])
  })
})

describe('the stack hook alongside others', () => {
  const { root, write } = fixtureApp()
  const source = (file: string) => path.join(root, 'src', file)

  beforeAll(async () => {
    await build(root, 'production', false)
  }, 120_000)

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it.each([
    // A URL, which --import takes where a Windows path would read as one with a scheme
    ['Node', 'node', ['--import', pathToFileURL(path.join(root, 'before.mjs')).href]],
    ['Bun', bun, ['--no-install', '--preload', path.join(root, 'before.mjs')]],
  ])('hands a hook set before it the mapped call sites, on %s', (_name, runtime, flags) => {
    const { stack } = run(root, runtime, flags)

    expect(stack).toBe(`before ${source('boom.ts')}:2 ${source('main.ts')}:${runtime === 'node' ? 12 : 11}`)
  })

  it('stays in the chain under a hook set after it that calls the one it found', () => {
    const { stack } = run(root, 'node', [], { STACK_HOOK: 'after' })

    expect(stack.startsWith('after Error: boom\n')).toBe(true)
    expect(frames(stack).thrower?.slice(0, 2)).toEqual([source('boom.ts'), '2'])
  })

  it('gives way to a hook set after it that replaces it', () => {
    const { stack } = run(root, 'node', [], { STACK_HOOK: 'replace' })

    expect(stack).toMatch(/^replaced .*dist[\\/]main\.js/)
  })

  it('installs nothing when the config sets sourceMappedStacks: false', () => {
    write('dist/meocord.config.mjs', 'export default { sourceMappedStacks: false }\n')
    try {
      const { stack, hooked } = run(root, bun, ['--no-install'])

      expect(hooked).toBe(false)
      expect(frames(stack).thrower?.[0]).toBe(path.join(root, 'dist', 'main.js'))
    } finally {
      rmSync(path.join(root, 'dist', 'meocord.config.mjs'))
    }
  })

  it('installs nothing when the build wrote no source map', () => {
    rmSync(path.join(root, 'dist', 'main.js.map'))

    const { stack, hooked } = run(root, 'node')

    expect(hooked).toBe(false)
    expect(frames(stack).thrower?.[0]).toBe(pathToFileURL(path.join(root, 'dist', 'main.js')).href)
  })
})
