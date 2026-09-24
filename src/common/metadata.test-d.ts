import { describe, expectTypeOf, it } from 'vitest'
import { createMetadata, type ExecutionContext } from '@src/common/index.js'
import { inspectHandler } from '@src/testing/index.js'

/**
 * Runs under `vitest --typecheck`. The negative cases use `@ts-expect-error`,
 * which fails once the rejected form starts compiling.
 */

const Roles = createMetadata<string[]>('roles')

declare const context: ExecutionContext

describe('createMetadata', () => {
  it('reads back the declared type, or undefined', () => {
    expectTypeOf(context.get(Roles)).toEqualTypeOf<string[] | undefined>()
    expectTypeOf(context.getAll(Roles)).toEqualTypeOf<string[][]>()
    expectTypeOf(Roles.key).toEqualTypeOf<symbol>()
  })

  it('refuses a value of another type', () => {
    class Controller {
      @Roles(['admin'])
      ban() {
        return undefined
      }

      // @ts-expect-error roles are strings
      @Roles([1])
      kick() {
        return undefined
      }
    }
    void Controller
    // @ts-expect-error not an array
    Roles('admin')
  })

  it('reads a key given as a string with the type the caller names', () => {
    expectTypeOf(context.get<number>('legacy')).toEqualTypeOf<number | undefined>()
  })

  it('reads the same way through inspectHandler', () => {
    class Controller {
      @Roles(['admin'])
      ban() {
        return undefined
      }
    }
    expectTypeOf(inspectHandler(Controller, 'ban').get(Roles)).toEqualTypeOf<string[] | undefined>()
    // @ts-expect-error no such method
    inspectHandler(Controller, 'kick')
  })
})
