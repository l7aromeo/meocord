/**
 * MeoCord Framework
 * Copyright (c) 2025-present Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import {
  assertNoBundledNativeAddons,
  bundledModuleFiles,
  findBundledNativeAddons,
  packageFromPath,
} from '@src/build/native-addons.js'

let root: string

/** Writes an installed package: a package.json, optionally with optional dependencies and a binary. */
function install(dir: string, name: string, options: { optional?: string[]; binary?: string } = {}) {
  mkdirSync(dir, { recursive: true })
  const optionalDependencies = Object.fromEntries((options.optional ?? []).map(dependency => [dependency, '1.0.0']))
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', optionalDependencies }))
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
