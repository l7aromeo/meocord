import { describe, expectTypeOf, it } from 'vitest'
import { createToken, factoryProvider, type Provided } from '@src/common/index.js'
import { type FactoryProvider } from '@src/interface/index.js'

/**
 * Runs under `vitest --typecheck`: `factoryProvider` types `useFactory` from `inject` and `provide`. The
 * negative cases use `@ts-expect-error`, which fails once the rejected form starts compiling.
 */

class Config {
  databaseUrl = 'postgres://'
}
class Pool {
  constructor(readonly url: string) {}
}
const DATABASE = createToken<Pool>('Database')
const PORT = createToken<number>('Port')

describe('factoryProvider', () => {
  it('types each parameter from the token injected in its place', () => {
    factoryProvider({
      provide: DATABASE,
      inject: [Config, PORT],
      useFactory: (config, port) => {
        expectTypeOf(config).toEqualTypeOf<Config>()
        expectTypeOf(port).toEqualTypeOf<number>()
        return new Pool(`${config.databaseUrl}:${port}`)
      },
    })
  })

  it('takes a factory with no inject, sync or async, and returns a FactoryProvider of the token type', () => {
    expectTypeOf(factoryProvider({ provide: DATABASE, useFactory: async () => new Pool('') })).toEqualTypeOf<FactoryProvider<Pool>>()
    expectTypeOf(factoryProvider({ provide: Config, useFactory: () => new Config() })).toEqualTypeOf<FactoryProvider<Config>>()
  })

  it('gives unknown for a string or a plain symbol token', () => {
    factoryProvider({
      provide: 'legacy',
      inject: ['settings', Symbol('flag')],
      useFactory: (settings, flag) => {
        expectTypeOf(settings).toBeUnknown()
        expectTypeOf(flag).toBeUnknown()
        return settings
      },
    })
    expectTypeOf<Provided<typeof DATABASE>>().toEqualTypeOf<Pool>()
  })

  it('refuses a parameter of the wrong type, one inject does not supply, and a wrong return', () => {
    // @ts-expect-error the first injected value is a Config
    factoryProvider({ provide: DATABASE, inject: [Config], useFactory: (config: number) => new Pool(String(config)) })
    // @ts-expect-error inject supplies one value, not two
    factoryProvider({ provide: DATABASE, inject: [Config], useFactory: (config, other: number) => new Pool(config.databaseUrl + other) })
    // @ts-expect-error DATABASE provides a Pool
    factoryProvider({ provide: DATABASE, inject: [Config], useFactory: () => 'not a pool' })
  })
})
