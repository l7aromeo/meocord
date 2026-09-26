import { describe, it } from 'vitest'
import { type ExecutionContext } from '@src/common/index.js'
import { Catch } from '@src/decorator/index.js'
import { type ExceptionFilter } from '@src/interface/index.js'

/** Runs under `vitest --typecheck`: the JSDoc examples of `@Catch` and `ExceptionFilter` compile. */

class RateLimitedError extends Error {
  constructor(readonly retryAfter: number) {
    super('Rate limited')
  }
}

describe('ExceptionFilter', () => {
  it("compiles the JSDoc's example", () => {
    @Catch(RateLimitedError)
    class RateLimitedFilter implements ExceptionFilter<RateLimitedError> {
      async catch(error: RateLimitedError, context: ExecutionContext) {
        // Private, and right wherever the answer stands: a reply, the deferred reply edited, or a follow-up
        await context.response?.error(error, { message: `Slow down: try again in ${error.retryAfter}s.` })
      }
    }
    void RateLimitedFilter
  })
})
