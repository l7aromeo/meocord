/**
 * MeoCord Framework
 * Copyright (c) 2025-present Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { resolveOwnVersion } from '@src/util/package-version.util.js'

// The bundle is built before the release bumps the manifest, so a version compiled into
// the bundle always names the release before the one that shipped it.
describe('resolveOwnVersion', () => {
  const fixtures: string[] = []

  const makeRoot = (): string => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meocord-version-'))
    fixtures.push(root)
    return root
  }

  const tree = (manifest: object | null, depth: number): string => {
    const root = makeRoot()
    if (manifest !== null) fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify(manifest))

    const nested = path.join(root, ...Array.from({ length: depth }, (_, index) => `level-${index}`))
    fs.mkdirSync(nested, { recursive: true })

    return nested
  }

  afterAll(() => fixtures.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })))

  it('reads the version from a manifest several directories above', () => {
    expect(resolveOwnVersion(tree({ name: 'meocord', version: '9.9.9' }, 3), 'fallback')).toBe('9.9.9')
  })

  it('reads a manifest sitting in the starting directory', () => {
    expect(resolveOwnVersion(tree({ name: 'meocord', version: '1.2.3' }, 0), 'fallback')).toBe('1.2.3')
  })

  // An application's own manifest sits above the installed package, so stopping at the
  // first one found would report the application's version instead of the framework's.
  it('walks past a manifest belonging to another package', () => {
    const root = makeRoot()
    fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'meocord', version: '4.5.6' }))

    const other = path.join(root, 'node_modules', 'other')
    fs.mkdirSync(other, { recursive: true })
    fs.writeFileSync(path.join(other, 'package.json'), JSON.stringify({ name: 'other', version: '0.0.1' }))

    expect(resolveOwnVersion(other, 'fallback')).toBe('4.5.6')
  })

  it('falls back when no manifest names this package', () => {
    expect(resolveOwnVersion(tree({ name: 'unrelated', version: '2.0.0' }, 2), 'fallback')).toBe('fallback')
  })

  it('falls back when a manifest cannot be parsed', () => {
    const root = makeRoot()
    fs.writeFileSync(path.join(root, 'package.json'), '{ not json')

    expect(resolveOwnVersion(root, 'fallback')).toBe('fallback')
  })

  it('falls back when the manifest carries no version', () => {
    expect(resolveOwnVersion(tree({ name: 'meocord' }, 1), 'fallback')).toBe('fallback')
  })

  it('reports the version this repository declares', () => {
    const declared = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as { version: string }

    expect(resolveOwnVersion(path.resolve('src', 'bin'), 'fallback')).toBe(declared.version)
  })
})
