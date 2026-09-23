import { vi } from 'vitest'

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
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

const { loadMeoCordConfig, loadMeoCordSourceConfig } = await import('@src/util/meocord-config-loader.util.js')
const { createJiti } = await import('jiti')

describe('loadMeoCordConfig', () => {
  it('returns undefined when neither compiled nor source config exists', () => {
    mockExistsSync.mockReturnValue(false)

    const result = loadMeoCordConfig()
    expect(result).toBeUndefined()
  })

  it('returns the same cached result on the second call', () => {
    // Both calls go to the already-loaded module; the cache was set on the first call above.
    // Change what existsSync would return to prove the cache is NOT re-evaluated.
    mockExistsSync.mockReturnValue(true)

    const first = loadMeoCordConfig()
    const second = loadMeoCordConfig()

    expect(first).toBe(second)
  })
})

describe('loadMeoCordSourceConfig', () => {
  // The compiled copy in dist is the previous build's output. A build that read it ran on the
  // config as it was last time, so an edit to meocord.config.ts took effect a build late.
  it('reads meocord.config.ts even when a compiled config exists, and ignores the runtime cache', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{}')
    const load = vi.fn((file: string) =>
      file.endsWith('meocord.config.mjs') ? { discordToken: 'compiled, stale' } : { discordToken: 'source, current' },
    )
    vi.mocked(createJiti).mockReturnValue(load as unknown as ReturnType<typeof createJiti>)

    expect(loadMeoCordSourceConfig()?.discordToken).toBe('source, current')
    expect(load).not.toHaveBeenCalledWith(expect.stringContaining('meocord.config.mjs'))
  })

  it('reads the file again on every call', () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{}')
    const load = vi.fn().mockReturnValueOnce({ discordToken: 'before' }).mockReturnValueOnce({ discordToken: 'after' })
    vi.mocked(createJiti).mockReturnValue(load as unknown as ReturnType<typeof createJiti>)

    expect(loadMeoCordSourceConfig()?.discordToken).toBe('before')
    expect(loadMeoCordSourceConfig()?.discordToken).toBe('after')
  })
})
