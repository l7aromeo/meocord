import { vi } from 'vitest'
import path from 'path'

const { mockExistsSync, mockReadFileSync, mockWriteFileSync, mockLoadMeoCordConfig, mockReadSourceConfig, mockWait } = vi.hoisted(() => ({
  mockReadSourceConfig: vi.fn(),
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockLoadMeoCordConfig: vi.fn(),
  mockWait: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
}))

vi.mock('fs', () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
  },
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
  writeFileSync: mockWriteFileSync,
}))

vi.mock('chalk', () => ({
  default: {
    red: (...args: any[]) => args.join(' '),
    yellow: (...args: any[]) => args.join(' '),
  },
}))

vi.mock('@src/util/meocord-source-config.util.js', () => ({
  loadMeoCordCliConfig: mockLoadMeoCordConfig,
  readMeoCordSourceConfig: mockReadSourceConfig,
}))

vi.mock('@src/util/wait.util.js', () => ({
  default: mockWait,
}))

const { findModulePackageDir, compileAndValidateConfig, setEnvironment, validateDiscordToken } = await import(
  '@src/util/common.util.js',
)

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

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = findModulePackageDir('nonexistent-module', '/tmp')
    consoleSpy.mockRestore()

    expect(result).toBeNull()
  })
})

describe('compileAndValidateConfig', () => {
  beforeEach(() => {
    mockExistsSync.mockReset()
    mockLoadMeoCordConfig.mockReset()
    mockReadSourceConfig.mockReset()
    mockWait.mockClear()
  })

  it('exits, with the loader\'s message, when meocord.config.ts cannot be loaded', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadSourceConfig.mockReturnValue({ error: 'ParseError: Unexpected token  meocord.config.ts:2:0' })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await compileAndValidateConfig()

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('meocord.config.ts:2:0'))
    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('exits, listing every problem, when options have the wrong type', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadSourceConfig.mockReturnValue({ config: { discordToken: 't', sharding: { mode: 'bogus' }, shutdownTimeout: 'soon' } })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await compileAndValidateConfig()

    expect(exitSpy).toHaveBeenCalledWith(1)
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('has 2 problem(s)'))
    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('warns about an unknown option and carries on', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadSourceConfig.mockReturnValue({ config: { discordToken: 't', bundleDependancies: true } })
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await compileAndValidateConfig()

    expect(exitSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('bundleDependancies is not a MeoCord option'))
    exitSpy.mockRestore()
    warnSpy.mockRestore()
  })

  it('calls process.exit(1) when meocord.config.ts does not exist', async () => {
    mockExistsSync.mockReturnValue(false)
    mockWait.mockResolvedValue(undefined)

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await compileAndValidateConfig()

    expect(exitSpy).toHaveBeenCalledWith(1)

    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  // Producing a bundle needs no credentials, so a configuration without a token is not a
  // reason to refuse to build.
  it('does not call process.exit when only the token is missing', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadSourceConfig.mockReturnValue({ config: { appName: 'TestApp' } })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await compileAndValidateConfig()

    expect(exitSpy).not.toHaveBeenCalled()

    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('does not call process.exit when config is valid', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadSourceConfig.mockReturnValue({ config: { discordToken: 'valid-token' } })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await compileAndValidateConfig()

    expect(exitSpy).not.toHaveBeenCalled()

    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })
})

// Connecting to the gateway is the point at which a token is actually required.
describe('validateDiscordToken', () => {
  beforeEach(() => {
    mockLoadMeoCordConfig.mockReset()
    mockWait.mockClear()
  })

  it('calls process.exit(1) when the token is missing', async () => {
    mockLoadMeoCordConfig.mockReturnValue({ appName: 'TestApp' })
    mockWait.mockResolvedValue(undefined)

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await validateDiscordToken()

    expect(exitSpy).toHaveBeenCalledWith(1)

    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })

  it('does not call process.exit when a token is configured', async () => {
    mockLoadMeoCordConfig.mockReturnValue({ discordToken: 'valid-token' })

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    await validateDiscordToken()

    expect(exitSpy).not.toHaveBeenCalled()

    exitSpy.mockRestore()
    consoleSpy.mockRestore()
  })
})
