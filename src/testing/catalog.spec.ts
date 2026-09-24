import { createTranslator, defineCatalog, Translator } from '@src/common/index.js'
import { Controller, MeoCord, Service } from '@src/decorator/index.js'
import { expectCompleteCatalog, MeoCordTestingModule } from '@src/testing/index.js'

const enUS = defineCatalog({
  ban: { description: 'Ban a member', done: 'Banned {user}.' },
  warnings: { one: '{count} warning', other: '{count} warnings' },
})

describe('expectCompleteCatalog', () => {
  it('passes when every locale translates every message in every form its language needs', () => {
    const t = createTranslator({
      default: 'en-US',
      locales: {
        'en-US': enUS,
        id: { ban: { description: 'Blokir anggota', done: '{user} diblokir.' }, warnings: { other: '{count} peringatan' } },
      },
    })

    expect(() => expectCompleteCatalog(t)).not.toThrow()
  })

  it('names each missing message, stray message and missing plural form, by locale', () => {
    const t = createTranslator({
      default: 'en-US',
      locales: {
        'en-US': enUS,
        ru: { ban: { description: 'Забанить' }, warnings: { one: '{count} предупреждение', other: '{count} предупреждения' } },
        // A catalog loaded from JSON is checked only at runtime, so it can carry a key the default lacks.
        ja: { ...{ ban: { description: 'BAN', done: '{user}をBAN', reason: '理由' } }, warnings: { other: '{count}件' } } as never,
      },
    })

    expect(() => expectCompleteCatalog(t)).toThrow(
      'The catalogs are incomplete:\n' +
        '  ru: missing ban.done; warnings lacks few, many\n' +
        '  ja: ban.reason is not in the default catalog',
    )
  })

  it('refuses a translator it cannot read', () => {
    expect(() => expectCompleteCatalog({} as Translator)).toThrow('takes a translator made by createTranslator')
  })
})

describe('the translator in a testing module', () => {
  const t = createTranslator({ default: 'en-US', locales: { 'en-US': { ping: 'Pong!' } } })

  @Service()
  class PingService {
    constructor(readonly translator: Translator) {}
  }

  @Controller()
  class PingController {
    constructor(readonly ping: PingService) {}
  }

  @MeoCord({ controllers: [PingController], clientOptions: { intents: [] }, i18n: t })
  class App {}

  it("is the app's i18n translator", () => {
    const module = MeoCordTestingModule.create({ app: App, controllers: [PingController] }).compile()

    expect(module.get(PingService).translator).toBe(t)
  })

  it('can be provided directly', () => {
    const module = MeoCordTestingModule.create({ controllers: [PingController], providers: [{ provide: Translator, useValue: t }] }).compile()

    expect(module.get(PingService).translator).toBe(t)
  })

  it('is refused, with what to pass, when nothing provides it', () => {
    expect(() => MeoCordTestingModule.create({ controllers: [PingController] }).compile()).toThrow(
      'PingService injects Translator, but @MeoCord has no i18n',
    )
  })
})
