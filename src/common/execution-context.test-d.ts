import { describe, expectTypeOf, it } from 'vitest'
import { type ExecutionContext } from '@src/common/index.js'
import { Interceptor } from '@src/decorator/index.js'
import { type CallHandler, type InterceptorInterface } from '@src/interface/index.js'

declare const audit: { record(handler: string | undefined, uid: string | undefined): void }

interface CheckIn {
  ownerId: string
  uid: string
}

describe('ExecutionContext.getHandlerParams', () => {
  it('returns unknown values by default, or the type it is given, or undefined', () => {
    const context = {} as ExecutionContext

    expectTypeOf(context.getHandlerParams()).toEqualTypeOf<Readonly<Record<string, unknown>> | undefined>()
    // An interface works as well as a type literal
    expectTypeOf(context.getHandlerParams<CheckIn>()).toEqualTypeOf<Readonly<CheckIn> | undefined>()
    expectTypeOf(context.getHandlerParams<{ uid: string }>()?.uid).toEqualTypeOf<string | undefined>()
  })

  it('stays apart from getParams, which reads a stage’s own params', () => {
    const context = {} as ExecutionContext

    expectTypeOf(context.getParams<{ limit: number }>()).toEqualTypeOf<Readonly<{ limit: number }> | undefined>()
  })
})

describe("getHandlerParams's JSDoc example", () => {
  it('compiles as written', () => {
    @Interceptor()
    class AuditInterceptor implements InterceptorInterface {
      async intercept(context: ExecutionContext, next: CallHandler) {
        const result = await next.handle()
        // Validated and piped by now, as the handler received them
        audit.record(context.getHandlerName(), context.getHandlerParams<{ uid: string }>()?.uid)
        return result
      }
    }
    void AuditInterceptor
  })
})
