import { describe, expectTypeOf, it } from 'vitest'
import { type Client } from 'discord.js'
import { type OnReady, type OnShutdown, type ReadyInfo } from '@src/interface/index.js'

/**
 * Runs under `vitest --typecheck`. The negative cases use `@ts-expect-error`,
 * which fails once the rejected form starts compiling.
 */

describe('OnReady', () => {
  it('receives the ready client and ready info, and may be sync or async', () => {
    expectTypeOf<Parameters<OnReady['onReady']>>().toEqualTypeOf<[Client<true>, ReadyInfo]>()
    expectTypeOf<ReturnType<OnReady['onReady']>>().toEqualTypeOf<Promise<void> | void>()
    expectTypeOf<ReadyInfo>().toEqualTypeOf<{ primary: boolean }>()
  })

  it('accepts a hook that ignores its arguments', () => {
    class Warmup implements OnReady {
      warmed = false
      async onReady() {
        this.warmed = true
      }
    }
    expectTypeOf<Warmup>().toExtend<OnReady>()
  })

  it('rejects a hook that expects something else', () => {
    class Wrong implements OnReady {
      // @ts-expect-error onReady receives the client, not a string
      onReady(name: string) {
        return void name
      }
    }
    void Wrong
  })
})

describe('OnShutdown', () => {
  it('takes no arguments and may be sync or async', () => {
    expectTypeOf<Parameters<OnShutdown['onShutdown']>>().toEqualTypeOf<[]>()
    expectTypeOf<ReturnType<OnShutdown['onShutdown']>>().toEqualTypeOf<Promise<void> | void>()
  })
})
