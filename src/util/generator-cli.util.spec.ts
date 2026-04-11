/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { jest } from '@jest/globals'

const mockExistsSync = jest.fn()
const mockMkdirSync = jest.fn()
const mockWriteFileSync = jest.fn()
const mockReadFileSync = jest.fn()

jest.unstable_mockModule('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    mkdirSync: mockMkdirSync,
    writeFileSync: mockWriteFileSync,
    readFileSync: mockReadFileSync,
  },
  existsSync: mockExistsSync,
  mkdirSync: mockMkdirSync,
  writeFileSync: mockWriteFileSync,
  readFileSync: mockReadFileSync,
}))

const mockExec = jest.fn()

jest.unstable_mockModule('child_process', () => ({
  exec: mockExec,
}))

const mockLoggerLog = jest.fn()
const mockLoggerError = jest.fn()

jest.unstable_mockModule('@src/common/index.js', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    log: mockLoggerLog,
    error: mockLoggerError,
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  })),
}))

const {
  toClassName,
  validateAndFormatName,
  createDirectoryIfNotExists,
  generateFile,
  buildTemplate,
  populateTemplate,
} = await import('@src/util/generator-cli.util.js')

describe('toClassName', () => {
  it('converts camelCase to PascalCase class name', () => {
    expect(toClassName('myController')).toBe('MyController')
  })

  it('converts kebab-case to PascalCase class name', () => {
    expect(toClassName('my-guard')).toBe('MyGuard')
  })

  it('calls process.exit for invalid names like "123invalid"', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    toClassName('123invalid')

    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })
})

describe('validateAndFormatName', () => {
  it('returns correct parts, kebabCaseName, and className for a simple name', () => {
    const result = validateAndFormatName('MyGuard')
    expect(result.parts).toEqual([])
    expect(result.kebabCaseName).toBe('my-guard')
    expect(result.className).toBe('MyGuard')
  })

  it('returns correct parts array for a nested path', () => {
    const result = validateAndFormatName('subdir/MyGuard')
    expect(result.parts).toEqual(['subdir'])
    expect(result.kebabCaseName).toBe('my-guard')
    expect(result.className).toBe('MyGuard')
  })

  it('calls process.exit when name is undefined', () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never)

    try {
      validateAndFormatName(undefined)
    } catch {
      // process.exit is mocked; execution may continue past the guard and throw
    }

    expect(exitSpy).toHaveBeenCalledWith(1)
    exitSpy.mockRestore()
  })
})

describe('createDirectoryIfNotExists', () => {
  beforeEach(() => {
    mockExistsSync.mockReset()
    mockMkdirSync.mockReset()
  })

  it('calls mkdirSync when directory does not exist', () => {
    mockExistsSync.mockReturnValue(false)
    createDirectoryIfNotExists('/some/new/dir')
    expect(mockMkdirSync).toHaveBeenCalledWith('/some/new/dir', { recursive: true })
  })

  it('does NOT call mkdirSync when directory already exists', () => {
    mockExistsSync.mockReturnValue(true)
    createDirectoryIfNotExists('/some/existing/dir')
    expect(mockMkdirSync).not.toHaveBeenCalled()
  })
})

describe('generateFile', () => {
  beforeEach(() => {
    mockWriteFileSync.mockReset()
    mockExec.mockReset()
  })

  it('calls writeFileSync with the file path and content', () => {
    generateFile('/some/file.ts', 'export const x = 1')
    expect(mockWriteFileSync).toHaveBeenCalledWith('/some/file.ts', 'export const x = 1')
  })

  it('calls exec to run eslint fix on the file', () => {
    generateFile('/some/file.ts', 'content')
    expect(mockExec).toHaveBeenCalledWith(expect.stringContaining('/some/file.ts'))
  })
})

describe('buildTemplate', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset()
  })

  it('calls readFileSync with a path containing the template file name', () => {
    mockReadFileSync.mockReturnValue('class {{className}} {}' as any)

    buildTemplate('MyService', 'service.template.ts')

    expect(mockReadFileSync).toHaveBeenCalledWith(expect.stringContaining('service.template.ts'), 'utf-8')
  })

  it('replaces {{className}} placeholder with the provided class name', () => {
    mockReadFileSync.mockReturnValue('class {{className}} {}' as any)

    const result = buildTemplate('MyService', 'service.template.ts')

    expect(result).toBe('class MyService {}')
  })
})

describe('populateTemplate', () => {
  beforeEach(() => {
    mockReadFileSync.mockReset()
  })

  it('replaces all {{variable}} placeholders in the template', () => {
    mockReadFileSync.mockReturnValue('Hello {{name}}, your role is {{role}}.' as any)

    const result = populateTemplate('/template/path.ts', { name: 'Alice', role: 'admin' })

    expect(result).toBe('Hello Alice, your role is admin.')
  })

  it('replaces multiple occurrences of the same placeholder', () => {
    mockReadFileSync.mockReturnValue('{{name}} is {{name}}.' as any)

    const result = populateTemplate('/template/path.ts', { name: 'Bob' })

    expect(result).toBe('Bob is Bob.')
  })
})
