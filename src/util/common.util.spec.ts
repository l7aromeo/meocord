/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { jest } from '@jest/globals'
import path from 'path'

const mockExistsSync = jest.fn()
const mockReadFileSync = jest.fn()
const mockWriteFileSync = jest.fn()

jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}))

jest.unstable_mockModule('chalk', () => ({
  default: {
    red: (...args: any[]) => args.join(' '),
  },
}))

const mockLoadMeoCordConfig = jest.fn()

jest.unstable_mockModule('@src/util/meocord-config-loader.util.js', () => ({
  loadMeoCordConfig: mockLoadMeoCordConfig,
}))

const mockWait = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)

jest.unstable_mockModule('@src/util/wait.util.js', () => ({
  default: mockWait,
}))

const { findModulePackageDir, compileAndValidateConfig, setEnvironment } = await import('@src/util/common.util.js')

describe('setEnvironment', () => {
  const originalNodeEnv = process.env.NODE_ENV

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
  })

  it('sets process.env.NODE_ENV when not already set', () => {
    delete process.env.NODE_ENV
    setEnvironment('development')
    expect(process.env.NODE_ENV).toBe('development')
  })

  it('does not override process.env.NODE_ENV when already set', () => {
    process.env.NODE_ENV = 'production'
    setEnvironment('development')
    expect(process.env.NODE_ENV).toBe('production')
  })
})

describe('findModulePackageDir', () => {
  beforeEach(() => {
    mockExistsSync.mockReset()
  })

  it('returns the module path when found in node_modules at baseDir', () => {
    const baseDir = '/some/project'
    const moduleName = 'lodash'
    const expectedPath = path.join(baseDir, 'node_modules', moduleName)

    mockExistsSync.mockImplementation((p: unknown) => p === expectedPath)

    const result = findModulePackageDir(moduleName, baseDir)
    expect(result).toBe(expectedPath)
  })

  it('returns null when module is not found after full traversal', () => {
    mockExistsSync.mockReturnValue(false)

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    const result = findModulePackageDir('nonexistent-module', '/tmp')
    consoleSpy.mockRestore()

    expect(result).toBeNull()
  })
})

describe('compileAndValidateConfig', () => {
  beforeEach(() => {
    mockExistsSync.mockReset()
    mockLoadMeoCordConfig.mockReset()
    mockWait.mockClear()
  })

  it('calls process.exit(1) when meocord.config.ts does not exist', async () => {
    mockExistsSync.mockReturnValue(false)
    mockWait.mockResolvedValue(undefined)

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await compileAndValidateConfig()

    expect(exitSpy).toHaveBeenCalledWith(1)

    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('calls process.exit(1) when discordToken is missing', async () => {
    mockExistsSync.mockReturnValue(true)
    mockLoadMeoCordConfig.mockReturnValue({ appName: 'TestApp' })
    mockWait.mockResolvedValue(undefined)

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await compileAndValidateConfig()

    expect(exitSpy).toHaveBeenCalledWith(1)

    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('does not call process.exit when config is valid', async () => {
    mockExistsSync.mockReturnValue(true)
    mockLoadMeoCordConfig.mockReturnValue({ discordToken: 'valid-token' })

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {})

    await compileAndValidateConfig()

    expect(exitSpy).not.toHaveBeenCalled()

    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })
})
