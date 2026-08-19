/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

/**
 * Generates one controller of every type through the built CLI and typechecks the
 * result against the published package.
 *
 * The unit suite can only assert on the text a template renders, which says nothing
 * about whether that text compiles. Two bugs lived behind exactly that gap: a template
 * importing `CommandType` from a module that does not export it, and a nested
 * controller importing a builder path that is never written. Both produced an
 * application that could not build, and every render assertion passed regardless.
 *
 * Run after `bun run build` -- it drives `dist`, not `src`, so it covers the package
 * `exports` map and the rollup template copy along with the templates themselves.
 */

import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { ControllerType } from '../src/enum/controller.enum.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workDir = path.join(repoRoot, '.generated-check')
const cli = path.join(repoRoot, 'dist', 'esm', 'bin', 'meocord.js')
const tsc = path.join(repoRoot, 'node_modules', '.bin', 'tsc')

/**
 * Resolves bare `meocord/...` imports the way a real application does.
 *
 * A `paths` mapping in the scratch tsconfig would work too, but it would resolve
 * straight to the declaration files and skip the package `exports` map -- which is
 * itself something that can be wrong, and was worth covering.
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
  // app is built by webpack, whose `resolve.extensions` makes the extensionless
  // `@src/...` imports in the templates valid), decorators on.
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
 * Generates every controller type under one name shape, in a project of its own, and
 * typechecks it.
 *
 * The isolation is the point. Generating flat and nested names side by side hides the
 * bug where a nested controller imports the top-level builder path: the flat pass
 * writes exactly that file, so the wrong import resolves and the check passes. Each
 * shape has to stand on its own.
 */
function verify(label: string, name: string, types: ControllerType[]): void {
  const dir = path.join(workDir, label)
  scaffold(dir)

  for (const type of types) generate(dir, type, name)

  execFileSync(tsc, ['--noEmit', '-p', 'tsconfig.json'], { cwd: dir, stdio: 'inherit' })
  console.log(`  ${label}: ${types.length} controller types typecheck clean`)
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
