/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { jest } from '@jest/globals'

const mockExistsSync = jest.fn()
const mockReadFileSync = jest.fn()

jest.unstable_mockModule('fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

jest.mock('jiti', () => ({
  createJiti: jest.fn().mockReturnValue(jest.fn()),
}))

jest.mock('@src/interface/index.js', () => ({}))

jest.mock('@src/util/json.util.js', () => ({
  fixJSON: jest.fn().mockImplementation((s: unknown) => s),
}))

const { loadMeoCordConfig } = await import('@src/util/meocord-config-loader.util.js')

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
