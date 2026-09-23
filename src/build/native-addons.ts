/**
 * MeoCord Framework
 * Copyright (c) 2025-present Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { existsSync, readdirSync, readFileSync } from 'fs'
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

/**
 * Bundled packages that load a native addon, mapped to the package holding the binary.
 *
 * The binary is rarely in the package that gets bundled. sharp and most napi packages ship a
 * JavaScript wrapper and publish the compiled addon separately, one package per platform,
 * declared as optional dependencies so only the matching one installs. The wrapper's code is
 * bundled; the binary it loads at runtime is not -- so the wrapper and its installed optional
 * dependencies are both checked.
 */
export function findBundledNativeAddons(bundledFiles: Iterable<string>, root: string): Map<string, string> {
  const packages = new Map<string, string>()
  for (const file of bundledFiles) {
    const found = packageFromPath(file)
    if (found && !packages.has(found.dir)) packages.set(found.dir, found.name)
  }

  const natives = new Map<string, string>()
  for (const [dir, name] of packages) {
    if (natives.has(name)) continue
    if (containsNativeBinary(dir)) {
      natives.set(name, name)
      continue
    }

    let optional: string[]
    try {
      optional = Object.keys(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).optionalDependencies ?? {})
    } catch {
      continue
    }
    const carrier = optional.find(dependency => {
      const dependencyDir = resolveDependencyDir(dependency, dir, root)
      return dependencyDir !== undefined && containsNativeBinary(dependencyDir)
    })
    if (carrier) natives.set(name, carrier)
  }

  return natives
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
