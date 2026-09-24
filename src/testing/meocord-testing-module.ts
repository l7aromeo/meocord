import 'reflect-metadata'
import { Container, type ServiceIdentifier } from 'inversify'
import { MetadataKey } from '@src/enum/index.js'
import { ExecutionContext } from '@src/common/execution-context.js'
import { injectedTokens, singletonContextError } from '@src/core/guard-runner.js'
import { appStages, bindGlobalStages, prepareHandlerStages, runHandler } from '@src/core/handler-pipeline.js'
import { type GuardInterface, type InterceptorInterface } from '@src/interface/index.js'
import { makeInjectable } from '@src/util/injectable.util.js'

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
   * The `@MeoCord` application class, whose global `guards` and `interceptors` `invoke` runs before
   * each handler's own. Its controllers and services are not registered; list them here.
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

type HandlerArgs<C extends new (...args: any[]) => unknown, M extends HandlerName<C>> =
  InstanceType<C>[M] extends (...args: infer A) => unknown ? A : never

/** How a call made with `TestingModule.invoke` ended. */
export interface InvocationResult {
  /** Whether the handler ran; `false` when a guard denied the call or an interceptor skipped it. */
  ran: boolean
}

/**
 * Resolved test module. Retrieve instances via `.get()`.
 */
export class TestingModule {
  constructor(
    private readonly container: Container,
    private readonly controllers: readonly (new (...args: any[]) => unknown)[] = [],
  ) {}

  get<T>(token: ServiceIdentifier<T>): T {
    return this.container.get<T>(token)
  }

  /**
   * Runs a handler through the same pipeline dispatch runs: the global guards of the module's `app`,
   * then the handler's own, in order and once each; then the interceptors, the app's first, around
   * the handler. Guards resolve from this module, so `overrideGuard` stubs apply and guards
   * that inject `ExecutionContext` receive it. `overrideInterceptor` stubs apply the same way.
   *
   * Calling the controller method directly runs its guards but no interceptors; `invoke` is the way
   * to test everything dispatch runs around a handler.
   *
   * @param controller - A controller passed to `MeoCordTestingModule.create`.
   * @param methodName - The handler method's name.
   * @param args - The arguments dispatch would pass: the interaction, message or reaction, then the
   *   handler's params.
   * @returns Whether the handler ran. Rejects with any error the handler or a guard throws.
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
    const { ran } = await runHandler(this.container, instance, methodName, args)
    return { ran }
  }
}

/**
 * Builder returned by `MeoCordTestingModule.create()`.
 * Call `.compile()` to get the resolved `TestingModule`.
 */
export class TestingModuleBuilder {
  private readonly overrides = new Map<ServiceIdentifier, Provider>()
  private readonly guardOverrides = new Map<new (...args: any[]) => GuardInterface, Partial<GuardInterface>>()
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

  compile(): TestingModule {
    const container = new Container()
    if (this.options.app) bindGlobalStages(container, appStages(this.options.app))

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

    for (const [interceptorClass, stub] of this.interceptorOverrides) {
      container.bind(interceptorClass).toConstantValue(stub as InterceptorInterface)
    }

    // Recursively bind controllers and their dependencies, skipping already-bound tokens
    const bindClass = (cls: new (...args: any[]) => any) => {
      if (container.isBound(cls)) return
      if (injectedTokens(cls).includes(ExecutionContext)) throw singletonContextError(cls)

      makeInjectable(cls)
      container.bind(cls).toSelf().inSingletonScope()

      const deps: any[] = Reflect.getMetadata(MetadataKey.ParamTypes, cls) || []
      for (const dep of deps) {
        bindClass(dep)
      }
    }

    for (const ctrl of this.options.controllers ?? []) {
      bindClass(ctrl)
      // Stamp container on controller class so @UseGuard works in tests too
      Reflect.defineMetadata(MetadataKey.Container, container, ctrl)
    }
    prepareHandlerStages(container, this.options.controllers ?? [])

    return new TestingModule(container, [...(this.options.controllers ?? [])])
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
