import { vi } from 'vitest'

const { mockExistsSync, mockReadFileSync, mockLoadMeoCordConfig } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockLoadMeoCordConfig: vi.fn(),
}))

vi.mock('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

vi.mock('jiti', () => ({
  createJiti: vi.fn().mockReturnValue(vi.fn()),
}))

vi.mock('@src/interface/index.js', () => ({}))

vi.mock('@src/util/json.util.js', () => ({
  fixJSON: vi.fn().mockImplementation((s: unknown) => s),
}))

vi.mock('@src/util/meocord-config-loader.util.js', () => ({
  loadMeoCordConfig: mockLoadMeoCordConfig,
}))

const { loadMeoCordCliConfig, loadMeoCordSourceConfig } = await import('@src/util/meocord-source-config.util.js')
const { createJiti } = await import('jiti')

describe('loadMeoCordSourceConfig', () => {
  // The compiled copy in dist is the previous build's output. A build that read it would run on
  // the config as it was last time.
  it('reads meocord.config.ts even when a compiled config exists', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{}')
    mockLoadMeoCordConfig.mockReturnValue({ discordToken: 'compiled, stale' })
    const load = vi.fn().mockReturnValue({ discordToken: 'source, current' })
    vi.mocked(createJiti).mockReturnValue(load as unknown as ReturnType<typeof createJiti>)

    expect(loadMeoCordSourceConfig()?.discordToken).toBe('source, current')
    expect(load).toHaveBeenCalledWith(expect.stringMatching(/meocord\.config\.ts$/))
    expect(mockLoadMeoCordConfig).not.toHaveBeenCalled()
  })

  it('reads the file again on every call', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{}')
    const load = vi.fn().mockReturnValueOnce({ discordToken: 'before' }).mockReturnValueOnce({ discordToken: 'after' })
    vi.mocked(createJiti).mockReturnValue(load as unknown as ReturnType<typeof createJiti>)

    expect(loadMeoCordSourceConfig()?.discordToken).toBe('before')
    expect(loadMeoCordSourceConfig()?.discordToken).toBe('after')
  })

  it('returns undefined when there is no meocord.config.ts', () => {
    mockExistsSync.mockReturnValue(false)

    expect(loadMeoCordSourceConfig()).toBeUndefined()
  })
})

describe('loadMeoCordCliConfig', () => {
  afterEach(() => {
    mockLoadMeoCordConfig.mockReset()
  })

  it('uses the compiled config when a build has produced one', () => {
    mockLoadMeoCordConfig.mockReturnValue({ discordToken: 'compiled' })

    expect(loadMeoCordCliConfig()?.discordToken).toBe('compiled')
  })

  // `meocord start` checks the token before the first build.
  it('falls back to the source before anything is built', () => {
    mockLoadMeoCordConfig.mockReturnValue(undefined)
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{}')
    vi.mocked(createJiti).mockReturnValue(vi.fn().mockReturnValue({ discordToken: 'source' }) as unknown as ReturnType<typeof createJiti>)

    expect(loadMeoCordCliConfig()?.discordToken).toBe('source')
  })
})
