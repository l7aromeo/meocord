/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { jest } from '@jest/globals'
import wait from '@src/util/wait.util.js'

describe('wait', () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('returns a Promise', () => {
    const result = wait(100)
    expect(result).toBeInstanceOf(Promise)
    jest.advanceTimersByTime(100)
  })

  it('resolves after the specified delay', async () => {
    let resolved = false
    const promise = wait(1000).then(() => {
      resolved = true
    })

    expect(resolved).toBe(false)
    jest.advanceTimersByTime(999)
    await Promise.resolve()
    expect(resolved).toBe(false)

    jest.advanceTimersByTime(1)
    await promise
    expect(resolved).toBe(true)
  })

  it('resolves immediately for 0ms', async () => {
    let resolved = false
    const promise = wait(0).then(() => {
      resolved = true
    })
    jest.advanceTimersByTime(0)
    await promise
    expect(resolved).toBe(true)
  })
})
