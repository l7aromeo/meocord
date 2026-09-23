import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  assertNoBundledNativeAddons,
  bundledModuleFiles,
  copyPackagesInto,
  createNativeExternals,
  findBundledNativeAddons,
  packageFromPath,
  packageNameOfRequest,
} from '@src/build/native-addons.js'

let root: string

/** Writes an installed package: a package.json, optionally with optional dependencies and a binary. */
function install(
  dir: string,
  name: string,
  options: { optional?: string[]; dependencies?: string[]; binary?: string } = {},
) {
  mkdirSync(dir, { recursive: true })
  const toVersions = (names: string[] = []) => Object.fromEntries(names.map(dependency => [dependency, '1.0.0']))
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({
      name,
      version: '1.0.0',
      dependencies: toVersions(options.dependencies),
      optionalDependencies: toVersions(options.optional),
    }),
  )
  writeFileSync(path.join(dir, 'index.js'), 'export {}')
  if (options.binary) {
    mkdirSync(path.dirname(path.join(dir, options.binary)), { recursive: true })
    writeFileSync(path.join(dir, options.binary), 'not really a binary')
  }
}

const moduleIn = (...segments: string[]) => path.join(root, 'node_modules', ...segments, 'index.js')

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'meocord-native-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('packageFromPath', () => {
  it('names the package a module file belongs to', () => {
    expect(packageFromPath('/app/node_modules/sharp/lib/index.js')).toEqual({
      name: 'sharp',
      dir: path.join('/app', 'node_modules', 'sharp'),
    })
  })

  it('keeps the scope of a scoped package', () => {
    expect(packageFromPath('/app/node_modules/@img/sharp-linux-x64/lib/index.js')?.name).toBe('@img/sharp-linux-x64')
  })

  it('attributes a nested copy to itself rather than its parent', () => {
    expect(packageFromPath('/app/node_modules/sharp/node_modules/semver/index.js')).toEqual({
      name: 'semver',
      dir: path.join('/app', 'node_modules', 'sharp', 'node_modules', 'semver'),
    })
  })

  it('reads through loaders and queries on a module identifier', () => {
    const identifier = 'builtin:swc-loader??ruleSet[1]!/app/node_modules/dayjs/index.js?x=1'
    expect(packageFromPath(identifier)?.dir).toBe(path.join('/app', 'node_modules', 'dayjs'))
  })

  it('returns undefined for application code', () => {
    expect(packageFromPath('/app/src/main.ts')).toBeUndefined()
  })
})

describe('bundledModuleFiles', () => {
  it('returns nothing without stats', () => {
    expect(bundledModuleFiles(undefined)).toEqual([])
  })

  // A production build concatenates most packages; their members only appear as orphans.
  it('asks for orphan modules, which is where concatenated packages are listed', () => {
    let options: Record<string, unknown> = {}
    bundledModuleFiles({
      toJson: received => {
        options = received as Record<string, unknown>
        return {}
      },
    })

    expect(options).toMatchObject({ orphanModules: true, nestedModules: true, modulesSpace: Infinity })
  })

  it('walks concatenated members, path groups, and child compilations', () => {
    const stats = {
      toJson: () => ({
        children: [
          {
            modules: [
              { nameForCondition: '/app/src/main.ts', modules: [{ nameForCondition: '/app/node_modules/a/index.js' }] },
              { children: [{ identifier: 'loader!/app/node_modules/b/index.js' }] },
            ],
          },
        ],
      }),
    }

    expect(bundledModuleFiles(stats)).toEqual([
      '/app/src/main.ts',
      '/app/node_modules/a/index.js',
      'loader!/app/node_modules/b/index.js',
    ])
  })
})

describe('findBundledNativeAddons', () => {
  it('finds a package that ships its own binary', () => {
    install(path.join(root, 'node_modules', 'bindings-lib'), 'bindings-lib', { binary: 'build/Release/addon.node' })

    const found = findBundledNativeAddons([moduleIn('bindings-lib')], root)

    expect([...found]).toEqual([['bindings-lib', 'bindings-lib']])
  })

  // sharp's layout: the wrapper is JavaScript, and the binary is an optional per-platform package.
  it('finds a wrapper whose binary ships in an installed optional dependency', () => {
    install(path.join(root, 'node_modules', 'sharp'), 'sharp', {
      optional: ['@img/sharp-linux-x64', '@img/sharp-darwin-arm64'],
    })
    install(path.join(root, 'node_modules', '@img', 'sharp-darwin-arm64'), '@img/sharp-darwin-arm64', {
      binary: 'lib/sharp.node',
    })

    const found = findBundledNativeAddons([moduleIn('sharp')], root)

    expect([...found]).toEqual([['sharp', '@img/sharp-darwin-arm64']])
  })

  it('finds an optional dependency installed beside the wrapper, as pnpm lays it out', () => {
    const store = path.join(root, 'node_modules', '.pnpm', 'sharp@1.0.0', 'node_modules')
    install(path.join(store, 'sharp'), 'sharp', { optional: ['@img/sharp-darwin-arm64'] })
    install(path.join(store, '@img', 'sharp-darwin-arm64'), '@img/sharp-darwin-arm64', { binary: 'sharp.node' })

    const found = findBundledNativeAddons([path.join(store, 'sharp', 'index.js')], root)

    expect(found.get('sharp')).toBe('@img/sharp-darwin-arm64')
  })

  it('ignores packages with no binary anywhere', () => {
    install(path.join(root, 'node_modules', 'dayjs'), 'dayjs')
    install(path.join(root, 'node_modules', 'wrapper'), 'wrapper', { optional: ['not-installed-for-this-platform'] })

    const found = findBundledNativeAddons([moduleIn('dayjs'), moduleIn('wrapper'), '/app/src/main.ts'], root)

    expect(found.size).toBe(0)
  })

  it('does not look inside packages nested under a bundled one', () => {
    install(path.join(root, 'node_modules', 'outer'), 'outer')
    install(path.join(root, 'node_modules', 'outer', 'node_modules', 'inner'), 'inner', { binary: 'inner.node' })

    const found = findBundledNativeAddons([moduleIn('outer')], root)

    expect(found.size).toBe(0)
  })
})

describe('assertNoBundledNativeAddons', () => {
  it('accepts a build with no native addons', () => {
    expect(() => assertNoBundledNativeAddons(new Map())).not.toThrow()
  })

  it('names each addon and the externals line that fixes it', () => {
    const found = new Map([
      ['sharp', '@img/sharp-darwin-arm64'],
      ['bindings-lib', 'bindings-lib'],
    ])

    expect(() => assertNoBundledNativeAddons(found)).toThrow(/sharp \(its binary ships in @img\/sharp-darwin-arm64\)/)
    expect(() => assertNoBundledNativeAddons(found)).toThrow(/- bindings-lib\n/)
    expect(() => assertNoBundledNativeAddons(found)).toThrow("externals: ['sharp', 'bindings-lib']")
  })
})

describe('packageNameOfRequest', () => {
  it.each([
    ['sharp', 'sharp'],
    ['sharp/lib/index.js', 'sharp'],
    ['@img/sharp-linux-x64', '@img/sharp-linux-x64'],
    ['@img/sharp-linux-x64/lib/sharp.node', '@img/sharp-linux-x64'],
  ])('names the package a bare request %s imports', (request, name) => {
    expect(packageNameOfRequest(request)).toBe(name)
  })

  it.each(['./local', '../up', '/abs/path', 'node:fs', 'C:\\app\\file.js', '@scope', ''])(
    'is undefined for %s, which is not in node_modules',
    request => {
      expect(packageNameOfRequest(request)).toBeUndefined()
    },
  )
})

describe('createNativeExternals', () => {
  /** Runs the externals function the way Rspack does and reports what it decided. */
  function decide(externals: ReturnType<typeof createNativeExternals>['externals'], request: string, context = root) {
    let result: string | undefined = 'not called'
    externals({ request, context }, (_error, value) => {
      result = value
    })
    return result
  }

  it('keeps a native package out of the bundle and records it', () => {
    install(path.join(root, 'node_modules', 'sharp'), 'sharp', { optional: ['@img/sharp-darwin-arm64'] })
    install(path.join(root, 'node_modules', '@img', 'sharp-darwin-arm64'), '@img/sharp-darwin-arm64', {
      binary: 'lib/sharp.node',
    })
    const { externals, found } = createNativeExternals(root)

    expect(decide(externals, 'sharp')).toBe('sharp')
    expect(found.get('sharp')).toEqual({
      dir: path.join(root, 'node_modules', 'sharp'),
      carrier: '@img/sharp-darwin-arm64',
    })
  })

  it('lets plain JavaScript be bundled', () => {
    install(path.join(root, 'node_modules', 'dayjs'), 'dayjs')
    const { externals, found } = createNativeExternals(root)

    expect(decide(externals, 'dayjs')).toBeUndefined()
    expect(found.size).toBe(0)
  })

  it('leaves relative imports, builtins, and uninstalled packages to the bundler', () => {
    const { externals } = createNativeExternals(root)

    expect(decide(externals, './local')).toBeUndefined()
    expect(decide(externals, 'node:fs')).toBeUndefined()
    expect(decide(externals, 'not-installed')).toBeUndefined()
  })

  // A native addon imported by a plain JavaScript dependency, from that dependency's own node_modules.
  it('finds a native package nested under the package that imports it', () => {
    const parent = path.join(root, 'node_modules', 'orm')
    install(parent, 'orm')
    install(path.join(parent, 'node_modules', 'sqlite-native'), 'sqlite-native', { binary: 'build/Release/db.node' })
    const { externals, found } = createNativeExternals(root)

    expect(decide(externals, 'sqlite-native', path.join(parent, 'lib'))).toBe('sqlite-native')
    expect(found.get('sqlite-native')?.dir).toBe(path.join(parent, 'node_modules', 'sqlite-native'))
  })

  it('keeps the same request external every time it is met, and reads each package once', () => {
    install(path.join(root, 'node_modules', 'bindings-lib'), 'bindings-lib', { binary: 'addon.node' })
    const { externals } = createNativeExternals(root)

    expect(decide(externals, 'bindings-lib')).toBe('bindings-lib')
    rmSync(path.join(root, 'node_modules', 'bindings-lib'), { recursive: true })
    expect(decide(externals, 'bindings-lib/sub.js')).toBe('bindings-lib/sub.js')
  })
})

describe('copyPackagesInto', () => {
  const listed = (dir: string) => (existsSync(dir) ? readdirSync(dir).sort() : [])

  it('copies a package with its hoisted dependencies and the platform binary it installed', () => {
    install(path.join(root, 'node_modules', 'sharp'), 'sharp', {
      dependencies: ['detect-libc'],
      optional: ['@img/sharp-darwin-arm64', '@img/sharp-linux-x64'],
    })
    install(path.join(root, 'node_modules', 'detect-libc'), 'detect-libc')
    install(path.join(root, 'node_modules', '@img', 'sharp-darwin-arm64'), '@img/sharp-darwin-arm64', {
      binary: 'lib/sharp.node',
    })
    const out = path.join(root, 'dist')

    const copied = copyPackagesInto(new Map([['sharp', path.join(root, 'node_modules', 'sharp')]]), root, out)

    expect(copied.sort()).toEqual(['@img/sharp-darwin-arm64', 'detect-libc', 'sharp'])
    expect(existsSync(path.join(out, 'node_modules', '@img', 'sharp-darwin-arm64', 'lib', 'sharp.node'))).toBe(true)
    // The binary for another platform was never installed, so there is nothing to copy.
    expect(listed(path.join(out, 'node_modules', '@img'))).toEqual(['sharp-darwin-arm64'])
  })

  it('brings nested dependencies along inside the package rather than hoisting them', () => {
    const dir = path.join(root, 'node_modules', 'canvas-lib')
    install(dir, 'canvas-lib', { dependencies: ['semver'] })
    install(path.join(dir, 'node_modules', 'semver'), 'semver')
    const out = path.join(root, 'dist')

    const copied = copyPackagesInto(new Map([['canvas-lib', dir]]), root, out)

    expect(copied).toEqual(['canvas-lib'])
    expect(existsSync(path.join(out, 'node_modules', 'canvas-lib', 'node_modules', 'semver', 'package.json'))).toBe(true)
    expect(existsSync(path.join(out, 'node_modules', 'semver'))).toBe(false)
  })

  // Some packages list their own types as runtime dependencies; they never run.
  it('leaves type-only packages behind', () => {
    install(path.join(root, 'node_modules', 'canvas-lib'), 'canvas-lib', { dependencies: ['@types/node'] })
    install(path.join(root, 'node_modules', '@types', 'node'), '@types/node')
    const out = path.join(root, 'dist')

    const copied = copyPackagesInto(new Map([['canvas-lib', path.join(root, 'node_modules', 'canvas-lib')]]), root, out)

    expect(copied).toEqual(['canvas-lib'])
    expect(existsSync(path.join(out, 'node_modules', '@types'))).toBe(false)
  })

  it('copies a dependency shared by two packages once', () => {
    install(path.join(root, 'node_modules', 'a'), 'a', { dependencies: ['shared'] })
    install(path.join(root, 'node_modules', 'b'), 'b', { dependencies: ['shared'] })
    install(path.join(root, 'node_modules', 'shared'), 'shared')
    const packages = new Map([
      ['a', path.join(root, 'node_modules', 'a')],
      ['b', path.join(root, 'node_modules', 'b')],
    ])

    expect(copyPackagesInto(packages, root, path.join(root, 'dist')).sort()).toEqual(['a', 'b', 'shared'])
  })
})
