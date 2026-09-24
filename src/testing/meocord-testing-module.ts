import 'reflect-metadata'
import { Container, type ServiceIdentifier } from 'inversify'
import { BaseInteraction, type ClientEvents, type Interaction } from 'discord.js'
import { MetadataKey } from '@src/enum/index.js'
import { ExecutionContext } from '@src/common/execution-context.js'
import { missingTranslatorError, Translator } from '@src/common/translator.js'
import { injectedTokens, singletonContextError } from '@src/core/guard-runner.js'
import {
  appPresenterOf,
  appStages,
  bindAppPresenter,
  bindGlobalStages,
  prepareHandlerStages,
  runHandler,
} from '@src/core/handler-pipeline.js'
import { setPresenter } from '@src/common/response/presenter.js'
import { handlerInput, routeParamsFor } from '@src/core/handler-input.js'
import { type ExceptionFilter, type GuardInterface, type InterceptorInterface } from '@src/interface/index.js'
import { makeInjectable } from '@src/util/injectable.util.js'
import { HandlerRegistry } from '@src/core/handler-registry.js'
import { ShardContext } from '@src/core/shard-context.js'
import { dependencyOrder, isAppClassToken } from '@src/core/lifecycle-order.js'
import { getEventHandlers } from '@src/decorator/event.decorator.js'

export interface ValueProvider<T = any> {
  provide: ServiceIdentifier<T>
  useValue: T
}

export interface ClassProvider<T = any> {
  provide: ServiceIdentifier<T>
  useClass: new (...args: any[]) => T
}

export type Provider<T = any> = ValueProvider<T> | ClassProvider<T>

export interface TestingModuleOptions {
  controllers?: (new (...args: any[]) => any)[]
  providers?: Provider[]

  /**
   * The `@MeoCord` application class, whose global `guards`, `interceptors` and `filters` `invoke`
   * applies with each handler's own, whose `i18n` translator is injected as `Translator`, and whose
   * `presenter` styles what `respond()` shows. Its controllers and services are not registered; list
   * them here.
   */
  app?: new (...args: any[]) => unknown
}

function isValueProvider(p: Provider): p is ValueProvider {
  return 'useValue' in p
}

/** The names of a class's instance methods. */
export type HandlerName<C extends new (...args: any[]) => unknown> = {
  [K in keyof InstanceType<C>]: InstanceType<C>[K] extends (...args: any[]) => unknown ? K : never
}[keyof InstanceType<C>] &
  string

/** The handler's arguments, or the interaction alone, whose params `invoke` then builds as dispatch does. */
type HandlerArgs<C extends new (...args: any[]) => unknown, M extends HandlerName<C>> =
  InstanceType<C>[M] extends (...args: infer A) => unknown ? (A extends [infer First, unknown, ...unknown[]] ? A | [First] : A) : never

/** How a call made with `TestingModule.invoke` ended. */
export interface InvocationResult {
  /** Whether the handler ran; `false` when a guard denied the call or an interceptor skipped it. */
  ran: boolean

  /** The error a filter handled, when the call failed and a `@UseFilter` or global filter caught it. */
  error?: unknown
}

/** How an event sent with `TestingModule.emit` was handled. */
export interface EmitResult {
  /** How many `@On` and `@Once` handlers ran; a handler a guard denied is not counted. */
  ran: number
}

/**
 * Resolved test module. Retrieve instances via `.get()`.
 */
export class TestingModule {
  constructor(
    private readonly container: Container,
    private readonly controllers: readonly (new (...args: any[]) => unknown)[] = [],
    private readonly eventClasses: readonly (new (...args: any[]) => unknown)[] = [],
  ) {}

  /** The `@Once` handlers that have already handled their event, as a client forgets its once listeners. */
  private readonly firedOnce = new Set<string>()

  /**
   * Resolves an instance from the module, as the bot would inject it.
   *
   * @param token - A controller, provider or other bound class or token.
   * @returns The instance, with its dependencies and overrides applied.
   */
  get<T>(token: ServiceIdentifier<T>): T {
    return this.container.get<T>(token)
  }

  /**
   * Runs a handler through the same pipeline dispatch runs: `@Defer`'s acknowledgement, the global
   * guards of the module's `app`, then the handler's own, in order and once each; then the
   * interceptors, the app's first, around validation, pipes, cooldowns and the handler; all inside the
   * handler's exception filters. Guards resolve
   * from this module, so `overrideGuard` stubs apply and guards that inject `ExecutionContext` receive
   * it. `overrideInterceptor` and `overrideFilter` stubs apply the same way.
   *
   * Calling the controller method directly runs its guards but no interceptors, validation or
   * filters; `invoke` is the way to test everything dispatch runs around a handler.
   *
   * @param controller - A controller passed to `MeoCordTestingModule.create`.
   * @param methodName - The handler method's name.
   * @param args - The arguments dispatch would pass: the interaction, message or reaction, then the
   *   handler's params. With an interaction alone, the params are built as dispatch builds them: a
   *   command's or an autocomplete's options, or the handler's customId params and a modal's fields.
   * @returns Whether the handler ran, and the error a filter handled, if any. Rejects with an error no
   *   filter handles, or with the error a filter throws: the built-in fallback, which answers such
   *   errors in the bot, does not run here.
   *
   * @example
   * ```ts
   * const module = MeoCordTestingModule.create({ controllers: [ModerationController] }).compile()
   * const interaction = createMockInteraction(ChatInputCommandInteraction)
   *
   * const { ran } = await module.invoke(ModerationController, 'ban', interaction)
   *
   * expect(ran).toBe(false)
   * expect(interaction.reply).not.toHaveBeenCalled()
   * ```
   */
  async invoke<C extends new (...args: any[]) => unknown, M extends HandlerName<C>>(
    controller: C,
    methodName: M,
    ...args: HandlerArgs<C, M>
  ): Promise<InvocationResult> {
    if (!this.controllers.includes(controller)) {
      throw new Error(`${controller.name} is not a controller of this testing module. Add it to \`controllers\`.`)
    }

    const instance = this.container.get(controller) as Record<string, (...args: unknown[]) => unknown>
    const [first] = args as unknown[]
    const callArgs =
      args.length === 1 && first instanceof BaseInteraction
        ? [first, handlerInput(first as Interaction, routeParamsFor(controller.prototype as object, methodName, first as Interaction)).params]
        : (args as unknown[])
    const presenter = appPresenterOf(this.container)
    const client = first instanceof BaseInteraction ? first.client : undefined
    if (presenter && client) setPresenter(client, presenter)
    const { ran, error } = await runHandler(this.container, instance, methodName, callArgs)
    return error === undefined ? { ran } : { ran, error }
  }

  /**
   * Emits a client event to the module's `@On` and `@Once` handlers, through the same pipeline the app
   * runs them in: the global guards of the module's `app`, then each handler's own. Handlers on the
   * module's controllers, class providers and their dependencies all receive it. A `@Once` handler
   * handles only the first event, as it would on a client.
   *
   * @param event - The client event, such as `'guildMemberAdd'`.
   * @param args - The event's arguments, typed from discord.js's `ClientEvents`.
   * @returns How many handlers ran. Rejects once every handler has settled if any threw: with that
   *   error when one handler failed, or an `AggregateError` of them when several did.
   *
   * @example
   * ```ts
   * const module = MeoCordTestingModule.create({ controllers: [WelcomeController] }).compile()
   * const member = createMock<GuildMember>()
   *
   * const { ran } = await module.emit('guildMemberAdd', member)
   *
   * expect(ran).toBe(1)
   * ```
   */
  async emit<E extends keyof ClientEvents>(event: E, ...args: ClientEvents[E]): Promise<EmitResult> {
    const calls: Promise<boolean>[] = []
    for (const cls of this.eventClasses) {
      for (const handler of getEventHandlers(cls.prototype)) {
        if (handler.event !== event) continue
        if (handler.once) {
          const key = `${cls.name}.${handler.method}:${event}`
          if (this.firedOnce.has(key)) continue
          this.firedOnce.add(key)
        }
        const instance = this.container.get(cls) as Record<string, (...args: unknown[]) => unknown>
        calls.push(runHandler(this.container, instance, handler.method, args, { type: 'event' }).then(({ ran }) => ran))
      }
    }

    const results = await Promise.allSettled(calls)
    const errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason as unknown] : []))
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, `${errors.length} handlers of "${event}" threw.`)
    return { ran: results.filter(result => result.status === 'fulfilled' && result.value).length }
  }
}

/**
 * Builder returned by `MeoCordTestingModule.create()`.
 * Call `.compile()` to get the resolved `TestingModule`.
 */
export class TestingModuleBuilder {
  private readonly overrides = new Map<ServiceIdentifier, Provider>()
  private readonly guardOverrides = new Map<new (...args: any[]) => GuardInterface, Partial<GuardInterface>>()
  private readonly filterOverrides = new Map<new (...args: any[]) => ExceptionFilter<any>, Partial<ExceptionFilter<any>>>()
  private readonly interceptorOverrides = new Map<
    new (...args: any[]) => InterceptorInterface,
    Partial<InterceptorInterface>
  >()

  constructor(private readonly options: TestingModuleOptions) {}

  /**
   * Replaces a provider with a test double.
   *
   * The double needs only the members the test uses; misspelled member names are still rejected.
   *
   * @param token - The provider to replace.
   * @example
   * ```ts
   * builder.overrideProvider(UserService).useValue({ findUser: vi.fn() })
   * ```
   */
  overrideProvider<T>(token: ServiceIdentifier<T>): { useValue: (value: Partial<T>) => TestingModuleBuilder } {
    return {
      useValue: (value: Partial<T>) => {
        this.overrides.set(token, { provide: token, useValue: value })
        return this
      },
    }
  }

  /**
   * Replaces a guard with a stub wherever it applies, globally or on a controller or handler.
   *
   * @param guard - The guard class to replace.
   * @example
   * ```ts
   * builder.overrideGuard(RateLimitGuard).useValue({ canActivate: () => true })
   * ```
   */
  overrideGuard(guard: new (...args: any[]) => GuardInterface): {
    useValue: (stub: Partial<GuardInterface>) => TestingModuleBuilder
  } {
    return {
      useValue: (stub: Partial<GuardInterface>) => {
        this.guardOverrides.set(guard, stub)
        return this
      },
    }
  }

  /**
   * Replaces an interceptor with a stub wherever it applies, globally or on a controller or handler.
   * The stub's `intercept` receives the context and `next`; call `next.handle()` to run the handler.
   *
   * @param interceptor - The interceptor class to replace.
   * @example
   * ```ts
   * builder.overrideInterceptor(TimingInterceptor).useValue({ intercept: (_context, next) => next.handle() })
   * ```
   */
  overrideInterceptor(interceptor: new (...args: any[]) => InterceptorInterface): {
    useValue: (stub: Partial<InterceptorInterface>) => TestingModuleBuilder
  } {
    return {
      useValue: (stub: Partial<InterceptorInterface>) => {
        this.interceptorOverrides.set(interceptor, stub)
        return this
      },
    }
  }

  /**
   * Replaces an exception filter with a stub wherever it applies. The filter's `@Catch` still decides
   * which errors reach the stub.
   *
   * @param filter - The filter class to replace.
   * @example
   * ```ts
   * builder.overrideFilter(RateLimitedFilter).useValue({ catch: vi.fn() })
   * ```
   */
  overrideFilter(filter: new (...args: any[]) => ExceptionFilter<any>): {
    useValue: (stub: Partial<ExceptionFilter<any>>) => TestingModuleBuilder
  } {
    return {
      useValue: (stub: Partial<ExceptionFilter<any>>) => {
        this.filterOverrides.set(filter, stub)
        return this
      },
    }
  }

  /**
   * Binds the controllers, providers and overrides into a module ready to resolve and run handlers.
   *
   * @returns The compiled module.
   */
  compile(): TestingModule {
    const container = new Container()
    if (this.options.app) bindGlobalStages(container, appStages(this.options.app))

    // Bound first, as in the app, so a class that injects it gets this instance
    const appClasses: (new (...args: any[]) => unknown)[] = []
    container.bind(HandlerRegistry).toConstantValue(new HandlerRegistry(appClasses))
    // A testing module runs as one process, so a cross-shard call runs once, here
    container.bind(ShardContext).toConstantValue(
      new ShardContext(undefined, async (service, method, args) => {
        const cls = appClasses.find(candidate => (typeof service === 'function' ? candidate === service : candidate.name === service))
        const name = typeof service === 'function' ? service.name : service
        if (!cls) throw new Error(`${name} is not a controller or class provider of this testing module.`)
        return (container.get(cls) as Record<string, (...args: unknown[]) => unknown>)[method](...args)
      }),
    )

    // Merge explicit providers with overrides (overrides win)
    const providers = new Map<ServiceIdentifier, Provider>()
    for (const p of this.options.providers ?? []) {
      providers.set(p.provide, p)
    }
    for (const [token, override] of this.overrides) {
      providers.set(token, override)
    }

    // Bind explicit providers
    for (const provider of providers.values()) {
      if (isValueProvider(provider)) {
        container.bind(provider.provide).toConstantValue(provider.useValue)
      } else {
        const cls = provider.useClass
        if (injectedTokens(cls).includes(ExecutionContext)) throw singletonContextError(cls)
        makeInjectable(cls)
        container.bind(provider.provide).to(cls).inSingletonScope()
      }
    }

    // Bind guard overrides — prevents inversify from auto-wiring guard dependencies
    for (const [guardClass, stub] of this.guardOverrides) {
      container.bind(guardClass).toConstantValue(stub as GuardInterface)
    }

    for (const [filterClass, stub] of this.filterOverrides) {
      container.bind(filterClass).toConstantValue(stub as ExceptionFilter)
    }

    for (const [interceptorClass, stub] of this.interceptorOverrides) {
      container.bind(interceptorClass).toConstantValue(stub as InterceptorInterface)
    }

    // The app's translator, unless a provider already stands in for it
    const i18n = this.options.app && (Reflect.getMetadata(MetadataKey.AppOptions, this.options.app) as { i18n?: Translator })?.i18n
    if (i18n && !container.isBound(Translator)) container.bind(Translator).toConstantValue(i18n)

    // Recursively bind controllers and their dependencies, skipping already-bound tokens
    const bindClass = (cls: new (...args: any[]) => any) => {
      if (container.isBound(cls)) return
      if (injectedTokens(cls).includes(ExecutionContext)) throw singletonContextError(cls)

      makeInjectable(cls)
      container.bind(cls).toSelf().inSingletonScope()

      // By constructor type or @inject token, as the app binds them
      for (const dep of injectedTokens(cls)) {
        if (dep === Translator && !container.isBound(Translator)) throw missingTranslatorError(cls)
        if (isAppClassToken(dep)) bindClass(dep)
      }
    }

    for (const ctrl of this.options.controllers ?? []) {
      bindClass(ctrl)
      // Stamp container on controller class so @UseGuard works in tests too
      Reflect.defineMetadata(MetadataKey.Container, container, ctrl)
    }

    // The classes whose @On and @Once handlers emit reaches: class providers bound as themselves, the
    // controllers, and what they inject
    const selfProviders = [...providers.values()].flatMap(provider =>
      !isValueProvider(provider) && provider.useClass === provider.provide ? [provider.useClass] : [],
    )
    appClasses.push(...dependencyOrder(container, [...selfProviders, ...(this.options.controllers ?? [])]))
    for (const cls of appClasses) Reflect.defineMetadata(MetadataKey.Container, container, cls)
    prepareHandlerStages(container, appClasses)
    if (this.options.app) bindAppPresenter(container, this.options.app)

    return new TestingModule(container, [...(this.options.controllers ?? [])], appClasses)
  }
}

/**
 * Entry point for building isolated test modules.
 *
 * @example
 * ```typescript
 * import { MeoCordTestingModule, createMockFn } from 'meocord/testing'
 *
 * const module = MeoCordTestingModule.create({
 *   controllers: [PingController],
 *   providers: [
 *     { provide: PingService, useValue: { handlePing: createMockFn().mockResolvedValue('pong') } },
 *   ],
 * }).compile()
 *
 * const controller = module.get(PingController)
 * ```
 */
export class MeoCordTestingModule {
  static create(options: TestingModuleOptions): TestingModuleBuilder {
    return new TestingModuleBuilder(options)
  }
}
