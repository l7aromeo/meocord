import { RateLimitGuard } from '@src/guards/rate-limit.guard.js'

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard

  beforeEach(() => {
    guard = new RateLimitGuard({ limit: 3, windowInSeconds: 60 })
  })

  it('should be defined', () => {
    expect(guard).toBeDefined()
  })
})
