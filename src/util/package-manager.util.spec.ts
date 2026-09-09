/**
 * MeoCord Framework
 * Copyright (c) 2025-present Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { vi } from 'vitest'
import type { PackageManager } from '@src/util/package-manager.util.js'

const { mockExecSync } = vi.hoisted(() => ({ mockExecSync: vi.fn() }))

vi.mock('child_process', () => ({
  execSync: mockExecSync,
}))

const { detectInstalledPMs, getInstallCommand } = await import('@src/util/package-manager.util.js')

describe('detectInstalledPMs', () => {
  beforeEach(() => {
    mockExecSync.mockReset()
  })

  it('returns only installed package managers', () => {
    mockExecSync.mockImplementation((cmd: unknown) => {
      if (cmd === 'bun --version' || cmd === 'npm --version') return Buffer.from('1.0.0')
      throw new Error('not found')
    })

    const result = detectInstalledPMs()
    expect(result).toContain('bun')
    expect(result).toContain('npm')
    expect(result).not.toContain('yarn')
    expect(result).not.toContain('pnpm')
  })

  // `which` is a separate binary a minimal image need not carry, and Windows has none.
  it('asks each candidate for its version rather than looking it up on the path', () => {
    mockExecSync.mockImplementation(() => Buffer.from('1.0.0'))

    detectInstalledPMs()

    const probes = mockExecSync.mock.calls.map(([command]) => command)
    expect(probes).toEqual(expect.arrayContaining(['bun --version', 'npm --version']))
    expect(probes.filter((command: unknown) => String(command).startsWith('which'))).toEqual([])
  })

  it('returns empty array when no PMs are installed', () => {
    mockExecSync.mockImplementation(() => {
      throw new Error('not found')
    })

    expect(detectInstalledPMs()).toEqual([])
  })

  it('returns all four PMs when all are installed', () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/pm'))
    const result = detectInstalledPMs()
    expect(result).toHaveLength(4)
    expect(result).toEqual(expect.arrayContaining(['bun', 'npm', 'yarn', 'pnpm']))
  })

  it('checks bun, npm, yarn, pnpm — in that order', () => {
    mockExecSync.mockReturnValue(Buffer.from('/usr/bin/pm'))
    const result = detectInstalledPMs()
    expect(result[0]).toBe('bun')
    expect(result[1]).toBe('npm')
    expect(result[2]).toBe('yarn')
    expect(result[3]).toBe('pnpm')
  })
})

describe('getInstallCommand', () => {
  it.each([
    ['npm', 'npm install'],
    ['yarn', 'yarn install'],
    ['pnpm', 'pnpm install'],
    ['bun', 'bun install'],
  ] as [PackageManager, string][])('returns "%s install" for %s', (pm, expected) => {
    expect(getInstallCommand(pm)).toBe(expected)
  })
})
