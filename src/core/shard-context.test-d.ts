import { describe, expectTypeOf, it } from 'vitest'
import { ShardContext, type ShardCallResult } from '@src/core/index.js'

/**
 * Runs under `vitest --typecheck`. The negative cases use `@ts-expect-error`,
 * which fails once the rejected form starts compiling.
 */

class StatsService {
  guildCount(): number {
    return 0
  }
  async greet(name: string, times: number): Promise<string> {
    return name.repeat(times)
  }
  readonly label = 'stats'
}

declare const shards: ShardContext

describe('ShardContext.call', () => {
  it("types each result from the method's awaited return", () => {
    expectTypeOf(shards.call(StatsService, 'guildCount')).resolves.toEqualTypeOf<ShardCallResult<number>[]>()
    expectTypeOf(shards.call(StatsService, 'greet', 'hi', 2)).resolves.toEqualTypeOf<ShardCallResult<string>[]>()
  })

  it('refuses a name that is not a method, and arguments the method does not take', () => {
    // @ts-expect-error label is a property, not a method
    void shards.call(StatsService, 'label')
    // @ts-expect-error no such method
    void shards.call(StatsService, 'missing')
    // @ts-expect-error greet takes a string and a number
    void shards.call(StatsService, 'greet', 'hi')
    // @ts-expect-error greet takes a string and a number
    void shards.call(StatsService, 'greet', 2, 'hi')
  })

  it('narrows a result to its value or its error', async () => {
    const [result] = await shards.call(StatsService, 'guildCount')
    if (result.ok) expectTypeOf(result.value).toEqualTypeOf<number>()
    else expectTypeOf(result.error).toEqualTypeOf<string>()
  })
})
