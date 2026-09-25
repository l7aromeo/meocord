import { describe, expectTypeOf, it } from 'vitest'
import { GatewayIntentBits } from 'discord.js'
import { createToken } from '@src/common/index.js'
import { Inject, MeoCord, Service } from '@src/decorator/index.js'
import { type Provider, type Token } from '@src/interface/index.js'
import { MeoCordTestingModule } from '@src/testing/index.js'

/**
 * Runs under `vitest --typecheck`. The negative cases use `@ts-expect-error`,
 * which fails once the rejected form starts compiling.
 */

interface Pool {
  query(sql: string): Promise<unknown[]>
}

const DATABASE = createToken<Pool>('Database')

describe('createToken', () => {
  it('is a symbol that carries what it provides', () => {
    expectTypeOf(DATABASE).toEqualTypeOf<Token<Pool>>()
    expectTypeOf(DATABASE).toMatchTypeOf<symbol>()
  })

  it('types what the testing module returns for it', () => {
    const module = MeoCordTestingModule.create({ providers: [{ provide: DATABASE, useValue: {} }] }).compile()
    expectTypeOf(module.get(DATABASE)).toEqualTypeOf<Pool>()
  })
})

describe('@Inject', () => {
  it('takes a class, a string, a symbol or a token, on a constructor parameter', () => {
    abstract class Storage {}

    @Service()
    class Notes {
      constructor(
        @Inject(DATABASE) readonly database: Pool,
        @Inject('config') readonly config: unknown,
        @Inject(Symbol('cache')) readonly cache: unknown,
        @Inject(Storage) readonly storage: Storage,
      ) {}
    }
    expectTypeOf(Notes).toBeConstructibleWith({} as Pool, {}, {}, {} as Storage)
  })

  it('refuses a token that is not one', () => {
    @Service()
    class Notes {
      // @ts-expect-error a token is a class, a string or a symbol
      constructor(@Inject(42) readonly database: Pool) {}
    }
    expectTypeOf(Notes).toBeConstructibleWith({} as Pool)
  })
})

describe('@MeoCord({ providers })', () => {
  it('takes a value, a class and a factory, sync or async', () => {
    abstract class Storage {}
    class MemoryStorage extends Storage {}

    @MeoCord({
      controllers: [],
      clientOptions: { intents: [GatewayIntentBits.Guilds] },
      providers: [
        { provide: 'config', useValue: { prefix: '!' } },
        { provide: Storage, useClass: MemoryStorage },
        { provide: DATABASE, useFactory: async (config: { url: string }) => ({ query: async () => [config.url] }) as Pool, inject: ['config'] },
      ],
    })
    class App {}
    expectTypeOf(App).toBeConstructibleWith()
  })

  it('refuses a factory whose inject lists something that is not a token', () => {
    const providers: Provider[] = [
      // @ts-expect-error inject lists tokens
      { provide: 'repository', useFactory: () => ({}), inject: [42] },
    ]
    expectTypeOf(providers).toBeArray()
  })

  it('refuses a useClass that is not a class', () => {
    const providers: Provider[] = [
      // @ts-expect-error useClass is a class
      { provide: 'storage', useClass: 'MemoryStorage' },
    ]
    expectTypeOf(providers).toBeArray()
  })
})
