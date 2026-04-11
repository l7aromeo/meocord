/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { jest } from '@jest/globals'
import path from 'path'
import { tmpdir } from 'os'

const mockExistsSync = jest.fn()
const mockReadFileSync = jest.fn()
const mockWriteFileSync = jest.fn()

jest.unstable_mockModule('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}))

jest.unstable_mockModule('@src/util/meocord-config-loader.util.js', () => ({
  loadMeoCordConfig: jest.fn().mockReturnValue(null),
}))

const { prepareModifiedTsConfig } = await import('@src/util/tsconfig.util.js')

function mockTsConfig(config: object) {
  mockExistsSync.mockReturnValue(true)
  mockReadFileSync.mockReturnValue(JSON.stringify(config) as any)
}

describe('prepareModifiedTsConfig', () => {
  beforeEach(() => {
    mockExistsSync.mockReset()
    mockReadFileSync.mockReset()
    mockWriteFileSync.mockReset()
  })

  it('throws when tsconfig.json does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    expect(() => prepareModifiedTsConfig()).toThrow('tsconfig.json not found')
  })

  it('removes noEmit from compilerOptions', () => {
    mockTsConfig({ compilerOptions: { noEmit: true, outDir: './dist' } })

    prepareModifiedTsConfig()

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
    expect(written.compilerOptions.noEmit).toBeUndefined()
  })

  it('converts relative outDir to an absolute path', () => {
    mockTsConfig({ compilerOptions: { outDir: './dist' } })

    prepareModifiedTsConfig()

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
    expect(path.isAbsolute(written.compilerOptions.outDir)).toBe(true)
  })

  it('converts relative rootDir to an absolute path', () => {
    mockTsConfig({ compilerOptions: { rootDir: '.' } })

    prepareModifiedTsConfig()

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
    expect(path.isAbsolute(written.compilerOptions.rootDir)).toBe(true)
  })

  it('resolves path aliases to absolute paths', () => {
    mockTsConfig({ compilerOptions: { paths: { '@src/*': ['./src/*'] } } })

    prepareModifiedTsConfig()

    const written = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string)
    expect(path.isAbsolute(written.compilerOptions.paths['@src/*'][0])).toBe(true)
  })

  it('writes to the temp directory and returns that path', () => {
    mockTsConfig({ compilerOptions: {} })

    const result = prepareModifiedTsConfig()

    expect(result).toContain(tmpdir())
    expect(result).toContain('modified-tsconfig.json')
    expect(mockWriteFileSync).toHaveBeenCalledWith(result, expect.any(String))
  })

  it('fixes and re-parses invalid JSON with a trailing comma', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{ "compilerOptions": { "noEmit": true, } }' as any)

    expect(() => prepareModifiedTsConfig()).not.toThrow()
  })
})
