import { vi } from 'vitest'

// Logger is constructed with `new`, so the implementation has to be a class or
// function — vitest 4 refuses to construct an arrow.
vi.mock('@src/common/index.js', () => ({
  Logger: vi.fn(
    class {
      log = vi.fn()
      error = vi.fn()
      warn = vi.fn()
      info = vi.fn()
      debug = vi.fn()
      verbose = vi.fn()
    },
  ),
}))

const { mockLoadConfig } = vi.hoisted(() => ({ mockLoadConfig: vi.fn() }))
vi.mock('@src/util/meocord-config-loader.util.js', () => ({
  loadMeoCordConfig: mockLoadConfig,
}))

const { MeoCordFactory } = await import('@src/core/meocord-factory.js')
const { MeoCordApp } = await import('@src/core/meocord.app.js')
const { MetadataKey } = await import('@src/enum/index.js')
const { ExecutionContext } = await import('@src/common/execution-context.js')
const { injectable } = await import('inversify')
const { createTranslator, Translator } = await import('@src/common/translator.js')
const { runHandler } = await import('@src/core/handler-pipeline.js')

describe('MeoCordFactory.create()', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('throws when the target has no @MeoCord() options metadata', () => {
    class NoMetadataApp {}
    expect(() => MeoCordFactory.create(NoMetadataApp)).toThrow('Target class is not decorated with @MeoCord().')
  })

  it('throws when meocord config is missing', () => {
    mockLoadConfig.mockReturnValue(null)

    class MyApp {}
    Reflect.defineMetadata(MetadataKey.AppOptions, { controllers: [], clientOptions: { intents: [] } }, MyApp)

    expect(() => MeoCordFactory.create(MyApp)).toThrow('MeoCord config not found')
  })

  it('returns a MeoCordApp instance when config and options are valid', () => {
    mockLoadConfig.mockReturnValue({ discordToken: 'test-token' })

    class MyApp {}
    Reflect.defineMetadata(MetadataKey.AppOptions, { controllers: [], clientOptions: { intents: [] } }, MyApp)

    const result = MeoCordFactory.create(MyApp)
    expect(result).toBeInstanceOf(MeoCordApp)
  })

  it('runs the global guards of @MeoCord({ guards }) before a dispatched handler', async () => {
    mockLoadConfig.mockReturnValue({ discordToken: 'test-token' })
    const log: string[] = []

    class GlobalGuard {
      canActivate() {
        log.push('global')
        return true
      }
    }
    injectable()(GlobalGuard)
    class Handlers {
      async run(_event: object) {
        log.push('run')
      }
    }
    class MyApp {}
    Reflect.defineMetadata(
      MetadataKey.AppOptions,
      { controllers: [], clientOptions: { intents: [] }, guards: [GlobalGuard] },
      MyApp,
    )

    const app = MeoCordFactory.create(MyApp)
    await runHandler(Reflect.get(app, 'container'), new Handlers() as never, 'run', [{}])

    expect(log).toEqual(['global', 'run'])
  })

  it('refuses a global interceptor that injects ExecutionContext, since it is shared across calls', () => {
    mockLoadConfig.mockReturnValue({ discordToken: 'test-token' })

    class ContextInterceptor {
      constructor(readonly context: InstanceType<typeof ExecutionContext>) {}
      intercept() {}
    }
    Reflect.defineMetadata(MetadataKey.ParamTypes, [ExecutionContext], ContextInterceptor)
    class MyApp {}
    Reflect.defineMetadata(
      MetadataKey.AppOptions,
      { controllers: [], clientOptions: { intents: [] }, interceptors: [ContextInterceptor] },
      MyApp,
    )

    expect(() => MeoCordFactory.create(MyApp)).toThrow('ContextInterceptor is resolved once and shared')
  })

  it('refuses a controller dependency that injects ExecutionContext, since it is shared across calls', () => {
    mockLoadConfig.mockReturnValue({ discordToken: 'test-token' })

    class ContextService {
      constructor(readonly context: InstanceType<typeof ExecutionContext>) {}
    }
    Reflect.defineMetadata(MetadataKey.ParamTypes, [ExecutionContext], ContextService)
    injectable()(ContextService)

    class UsesService {
      constructor(readonly service: ContextService) {}
    }
    Reflect.defineMetadata(MetadataKey.ParamTypes, [ContextService], UsesService)

    class MyApp {}
    Reflect.defineMetadata(
      MetadataKey.AppOptions,
      { controllers: [UsesService], clientOptions: { intents: [] } },
      MyApp,
    )

    expect(() => MeoCordFactory.create(MyApp)).toThrow(
      'ContextService is resolved once and shared, so it cannot inject ExecutionContext',
    )
  })

  // `meocord register` runs the bundle only to read the commands; a service that connects somewhere
  // in its constructor must not run.
  describe('in register-only mode', () => {
    beforeEach(() => {
      process.env.MEOCORD_REGISTER_ONLY = '1'
    })

    afterEach(() => {
      delete process.env.MEOCORD_REGISTER_ONLY
    })

    it('constructs no service and resolves no controller', () => {
      mockLoadConfig.mockReturnValue({ discordToken: 'test-token' })
      const constructed = vi.fn()

      class DatabaseService {
        constructor() {
          constructed()
        }
      }

      class MyApp {}
      Reflect.defineMetadata(
        MetadataKey.AppOptions,
        { controllers: [], services: [DatabaseService], clientOptions: { intents: [] } },
        MyApp,
      )

      expect(MeoCordFactory.create(MyApp)).toBeInstanceOf(MeoCordApp)
      expect(constructed).not.toHaveBeenCalled()
    })
  })

  describe('i18n', () => {
    const t = () => createTranslator({ default: 'en-US', locales: { 'en-US': { ping: 'Pong!' } } })

    class PingService {
      constructor(readonly translator: InstanceType<typeof Translator>) {}
    }
    Reflect.defineMetadata(MetadataKey.ParamTypes, [Translator], PingService)

    const appWith = (i18n?: unknown) => {
      class MyApp {}
      Reflect.defineMetadata(MetadataKey.AppOptions, { controllers: [], services: [PingService], clientOptions: { intents: [] }, i18n }, MyApp)
      return MyApp
    }

    it('injects the translator given to @MeoCord as Translator', () => {
      mockLoadConfig.mockReturnValue({ discordToken: 'test-token' })
      const translator = t()

      const app = MeoCordFactory.create(appWith(translator))

      expect((app as unknown as { container: { get(token: unknown): PingService } }).container.get(PingService).translator).toBe(translator)
    })

    it('says what to pass when a class injects Translator without one', () => {
      mockLoadConfig.mockReturnValue({ discordToken: 'test-token' })

      expect(() => MeoCordFactory.create(appWith())).toThrow('PingService injects Translator, but @MeoCord has no i18n')
    })
  })
})
