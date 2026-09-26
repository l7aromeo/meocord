import { createToken, factoryProvider } from '@src/common/index.js'
import { MeoCordTestingModule } from '@src/testing/index.js'

class Config {
  url = 'postgres://notes'
}
const DATABASE = createToken<{ url: string }>('Database')

describe('factoryProvider', () => {
  it('returns the provider as given, which a module binds like any factory provider', async () => {
    const provider = factoryProvider({ provide: DATABASE, inject: [Config], useFactory: config => ({ url: config.url }) })
    expect(provider).toEqual({ provide: DATABASE, inject: [Config], useFactory: expect.any(Function) })

    const module = await MeoCordTestingModule.create({ providers: [provider, { provide: Config, useClass: Config }] })
      .compile()
      .init()
    expect(module.get(DATABASE)).toEqual({ url: 'postgres://notes' })
  })
})
