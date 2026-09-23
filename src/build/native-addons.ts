/**
 * MeoCord Framework
 * Copyright (c) 2025-present Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { cpSync, existsSync, readdirSync, readFileSync } from 'fs'
import path from 'path'

/**
 * The package a resolved module file belongs to, and the directory it was installed in.
 *
 * Takes the innermost `node_modules` segment, so a nested copy is attributed to itself rather
 * than to the package it is nested under. Undefined for application code.
 */
export function packageFromPath(file: string): { name: string; dir: string } | undefined {
  // A module identifier can carry loaders before the resource (`loader!/path/to/file`) and a
  // query after it; only the path itself says where the package lives.
  const resource = file.slice(file.lastIndexOf('!') + 1).split('?')[0]
  const segments = resource.split(/[\\/]/)
  const index = segments.lastIndexOf('node_modules')
  if (index === -1 || index + 1 >= segments.length) return undefined

  const scoped = segments[index + 1].startsWith('@')
  if (scoped && index + 2 >= segments.length) return undefined
  const end = index + (scoped ? 3 : 2)
  return { name: segments.slice(index + 1, end).join('/'), dir: segments.slice(0, end).join(path.sep) }
}

/** The part of bundler stats this reads: modules, possibly concatenated into others, per child. */
interface StatsModule {
  nameForCondition?: string | null
  identifier?: string | null
  modules?: StatsModule[] | null
  children?: StatsModule[] | null
}
interface StatsJson {
  modules?: StatsModule[] | null
  children?: StatsJson[] | null
}
interface StatsLike {
  toJson(options: object): StatsJson
}

/**
 * Every source file a build pulled into its output.
 *
 * Concatenated modules nest their members, and a multi-environment build nests whole
 * compilations as children, so both are walked.
 */
export function bundledModuleFiles(stats: StatsLike | undefined): string[] {
  if (!stats) return []
  const json = stats.toJson({
    all: false,
    modules: true,
    nestedModules: true,
    // A production build concatenates most of node_modules into a few modules, and the members
    // of a concatenation are orphans -- hidden from stats unless asked for. Without this every
    // concatenated package, sharp included, was invisible here.
    orphanModules: true,
    modulesSpace: Infinity,
    nestedModulesSpace: Infinity,
  })
  const collect = (modules: StatsModule[] | null | undefined): string[] =>
    (modules ?? []).flatMap(module => [
      module.nameForCondition ?? module.identifier ?? '',
      ...collect(module.modules),
      // Stats may group modules by path, nesting them under `children`.
      ...collect(module.children),
    ])
  const compilations = json.children?.length ? json.children : [json]
  return compilations.flatMap(compilation => collect(compilation.modules)).filter(Boolean)
}

/** Whether a directory holds a compiled addon, not counting packages nested inside it. */
function containsNativeBinary(dir: string, depth = 0): boolean {
  if (depth > 5) return false
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return false
  }
  return entries.some(entry => {
    if (entry.isFile()) return entry.name.endsWith('.node')
    if (!entry.isDirectory() || entry.name === 'node_modules') return false
    return containsNativeBinary(path.join(dir, entry.name), depth + 1)
  })
}

/**
 * Where an optional dependency of the package in `from` was installed, if it was.
 *
 * Nested under the package, beside it (pnpm's layout, and npm's hoisting within a scope), or
 * hoisted to the project root. A platform package that did not match this machine is not
 * installed at all, which is how only the right binary is found.
 */
function resolveDependencyDir(name: string, from: string, root: string): string | undefined {
  const candidates = [
    path.join(from, 'node_modules', name),
    path.join(path.dirname(from), name),
    path.join(path.dirname(path.dirname(from)), name),
    path.join(root, 'node_modules', name),
  ]
  return candidates.find(dir => existsSync(path.join(dir, 'package.json')))
}

/** A package's declared dependencies, runtime and optional, or none if it cannot be read. */
function readDependencies(dir: string): { dependencies: string[]; optional: string[] } {
  try {
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
    return { dependencies: Object.keys(pkg.dependencies ?? {}), optional: Object.keys(pkg.optionalDependencies ?? {}) }
  } catch {
    return { dependencies: [], optional: [] }
  }
}

/**
 * The package holding the compiled addon an installed package loads, or undefined for plain
 * JavaScript.
 *
 * The binary is rarely in the package that gets imported. node-gyp packages keep it in their own
 * directory, under `build/Release`. napi-rs packages and sharp ship a JavaScript loader and publish
 * each platform's binary as a separate package, declared as an optional dependency so only the
 * matching one installs. Both layouts are checked.
 */
export function nativeCarrier(dir: string, name: string, root: string): string | undefined {
  if (containsNativeBinary(dir)) return name
  return readDependencies(dir).optional.find(dependency => {
    const dependencyDir = resolveDependencyDir(dependency, dir, root)
    return dependencyDir !== undefined && containsNativeBinary(dependencyDir)
  })
}

/** Bundled packages that load a native addon, mapped to the package holding the binary. */
export function findBundledNativeAddons(bundledFiles: Iterable<string>, root: string): Map<string, string> {
  const packages = new Map<string, string>()
  for (const file of bundledFiles) {
    const found = packageFromPath(file)
    if (found && !packages.has(found.dir)) packages.set(found.dir, found.name)
  }

  const natives = new Map<string, string>()
  for (const [dir, name] of packages) {
    if (natives.has(name)) continue
    const carrier = nativeCarrier(dir, name, root)
    if (carrier) natives.set(name, carrier)
  }
  return natives
}

/**
 * The package a bare import request names, or undefined for a relative path, an absolute path, or
 * a Node builtin -- none of which live in node_modules.
 */
export function packageNameOfRequest(request: string): string | undefined {
  if (!request || request.startsWith('.') || request.startsWith('/') || /^[a-z]+:/i.test(request)) return undefined
  if (/^[A-Za-z]:[\\/]/.test(request)) return undefined
  const [first, second] = request.split('/')
  if (!first.startsWith('@')) return first
  return second ? `${first}/${second}` : undefined
}

/** Where `name` resolves from `context` the way Node would: the nearest node_modules walking up. */
function resolveInstalledPackage(name: string, context: string, root: string): string | undefined {
  let dir = context
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name)
    if (existsSync(path.join(candidate, 'package.json'))) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  const hoisted = path.join(root, 'node_modules', name)
  return existsSync(path.join(hoisted, 'package.json')) ? hoisted : undefined
}

/** A native package kept out of the bundle, and where it was installed. */
export interface NativePackage {
  /** Directory the package resolved to. */
  dir: string
  /** The package holding the compiled binary: the package itself, or its platform package. */
  carrier: string
}

interface ExternalRequest {
  request?: string
  context?: string
}
type ExternalCallback = (error?: Error, result?: string) => void

/**
 * An Rspack `externals` function that keeps every native addon out of the bundle.
 *
 * Decided while the bundler resolves imports, so it sees every request -- including one made by a
 * plain JavaScript dependency deep in the graph -- and never has to be told what to look for. Each
 * native package it keeps out is recorded in `found`, so the build can copy it into the output.
 */
export function createNativeExternals(root: string): {
  externals: (data: ExternalRequest, callback: ExternalCallback) => void
  found: Map<string, NativePackage>
} {
  const found = new Map<string, NativePackage>()
  const plain = new Set<string>()

  const externals = ({ request, context }: ExternalRequest, callback: ExternalCallback) => {
    const name = request ? packageNameOfRequest(request) : undefined
    if (!name || plain.has(name)) return callback()
    if (found.has(name)) return callback(undefined, request)

    const dir = resolveInstalledPackage(name, context ?? root, root)
    const carrier = dir ? nativeCarrier(dir, name, root) : undefined
    if (!dir || !carrier) {
      plain.add(name)
      return callback()
    }
    found.set(name, { dir, carrier })
    callback(undefined, request)
  }

  return { externals, found }
}

/**
 * Copies packages, with everything they need at runtime, into `<outDir>/node_modules`.
 *
 * This is what lets a bundled application run with nothing installed beside it: the packages that
 * could not be bundled travel inside the output directory, where Node finds them by walking up
 * from the bundle. Each package's installed dependencies and optional dependencies are followed --
 * that is where a platform binary lives -- and one not installed for this platform is skipped.
 * Type-only `@types` packages are left behind; some packages list them as runtime dependencies,
 * and they only add weight.
 *
 * @returns The names copied.
 */
export function copyPackagesInto(packages: Map<string, string>, root: string, outDir: string): string[] {
  const copied = new Set<string>()

  const copy = (name: string, dir: string) => {
    if (copied.has(name) || name.startsWith('@types/')) return
    copied.add(name)
    const target = path.join(outDir, 'node_modules', name)
    // A package's own nested node_modules comes along with it, so only hoisted dependencies
    // need finding separately.
    cpSync(dir, target, { recursive: true, dereference: true })

    const { dependencies, optional } = readDependencies(dir)
    for (const dependency of [...dependencies, ...optional]) {
      if (existsSync(path.join(dir, 'node_modules', dependency, 'package.json'))) continue
      const dependencyDir = resolveDependencyDir(dependency, dir, root)
      if (dependencyDir) copy(dependency, dependencyDir)
    }
  }

  for (const [name, dir] of packages) copy(name, dir)
  return [...copied]
}

/**
 * Refuses a bundled build that swallowed a native addon.
 *
 * Such a build does not fail on its own. It succeeds, the bot starts, and on the build machine it
 * even works, because the bundle resolves the addon back into that machine's node_modules by
 * absolute path. Anywhere else it fails the first time the addon loads -- often a command, long
 * after startup. Failing the build is the only point this can be caught.
 */
export function assertNoBundledNativeAddons(found: Map<string, string>): void {
  if (found.size === 0) return

  const lines = [...found].map(([bundled, carrier]) =>
    carrier === bundled ? `  - ${bundled}` : `  - ${bundled} (its binary ships in ${carrier})`,
  )
  const names = [...found.keys()].map(name => `'${name}'`).join(', ')
  throw new Error(
    `bundleDependencies bundled ${found.size === 1 ? 'a package that loads' : 'packages that load'} a native addon:\n` +
      `${lines.join('\n')}\n` +
      'A native addon is a compiled binary for one platform and cannot travel inside the bundle. The build ' +
      'would run on this machine and fail in production the first time the addon loads. Keep ' +
      `${found.size === 1 ? 'it' : 'them'} out of the bundle and install ${found.size === 1 ? 'it' : 'them'} ` +
      `on the server:\n\n  externals: [${names}]`,
  )
}
