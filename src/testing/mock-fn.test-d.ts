import { describe, it, expectTypeOf } from 'vitest'
import { clearAllMocks, resetAllMocks } from '@src/testing/index.js'

describe('clearAllMocks and resetAllMocks', () => {
  it('take nothing and return nothing, to be passed to afterEach as they are', () => {
    expectTypeOf(clearAllMocks).toEqualTypeOf<() => void>()
    expectTypeOf(resetAllMocks).toEqualTypeOf<() => void>()
  })
})
