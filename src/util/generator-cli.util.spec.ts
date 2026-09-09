/**
 * MeoCord Framework
 * Copyright (c) 2025-present Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { vi } from 'vitest'

const { mockExistsSync, mockMkdirSync, mockWriteFileSync, mockReadFileSync, mockExecFile, mockLoggerLog, mockLoggerError } =
  vi.hoisted(() => ({
    mockExistsSync: vi.fn(),
    mockMkdirSync: vi.fn(),
    mockWriteFileSync: vi.fn(),
    mockReadFileSync: vi.fn(),
    mockExecFile: vi.fn(),
    mockLoggerLog: vi.fn(),
    mockLoggerError: vi.fn(),
  }))

vi.mock('fs', () => ({
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

vi.mock('child_process', () => ({
  execFile: mockExecFile,
}))

// Logger is constructed with `new`, so the implementation has to be a class or
// function — vitest 4 refuses to construct an arrow. The shared log/error mocks
// stay shared: every instance points at the same two functions.
vi.mock('@src/common/index.js', () => ({
  Logger: vi.fn(
    class {
      log = mockLoggerLog
      error = mockLoggerError
      warn = vi.fn()
      info = vi.fn()
      debug = vi.fn()
      verbose = vi.fn()
    },
  ),
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
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

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
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)

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
    mockExecFile.mockReset()
    mockExistsSync.mockReset()
  })

  it('calls writeFileSync with the file path and content', () => {
    generateFile('/some/file.ts', 'export const x = 1')
    expect(mockWriteFileSync).toHaveBeenCalledWith('/some/file.ts', 'export const x = 1')
  })

  // A project with its own rules still gets them applied to what was generated.
  it('formats with the project\'s own eslint when it has one', () => {
    mockExistsSync.mockReturnValue(true)

    generateFile('/some/file.ts', 'content')

    expect(mockExecFile).toHaveBeenCalledWith(
      expect.stringContaining('eslint'),
      ['--fix', '/some/file.ts'],
      expect.any(Function),
    )
  })

  // Reaching for npx would start downloading eslint into a project that deliberately
  // has none, once per generated file, and the call is not awaited so nothing shows it.
  it('does not reach for eslint when the project has none', () => {
    mockExistsSync.mockReturnValue(false)

    generateFile('/some/file.ts', 'content')

    expect(mockExecFile).not.toHaveBeenCalled()
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
