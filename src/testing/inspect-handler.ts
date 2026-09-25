import 'reflect-metadata'
import { type DispatchObserver, type ExceptionFilter, type GuardInterface, type InterceptorInterface } from '@src/interface/index.js'
import { HandlerExecutionContext } from '@src/common/execution-context.js'
import { type MetadataDecorator } from '@src/common/metadata.js'
import { appStages, handlerStages } from '@src/core/handler-pipeline.js'
import { handlerCooldowns } from '@src/core/cooldown-runner.js'
import { getMessageHandlers } from '@src/decorator/controller.decorator.js'
import { appObservers } from '@src/core/observer-runner.js'
import { type CooldownScope } from '@src/common/errors.js'

/** A guard as `@UseGuard` declares it: the class, or the class with the params set on its instance. */
export type InspectedGuard =
  | (new (...args: any[]) => GuardInterface)
  | { provide: new (...args: any[]) => GuardInterface; params?: Record<string, any> }

/** An interceptor as `@UseInterceptor` declares it: the class, or the class with its params. */
export type InspectedInterceptor =
  | (new (...args: any[]) => InterceptorInterface)
  | { provide: new (...args: any[]) => InterceptorInterface; params?: Record<string, any> }

/** A filter as `@UseFilter` declares it: the class, or the class with its params. */
export type InspectedFilter =
  | (new (...args: any[]) => ExceptionFilter<any>)
  | { provide: new (...args: any[]) => ExceptionFilter<any>; params?: Record<string, any> }

/** What runs for one handler, and the metadata declared on it, as {@link inspectHandler} reports it. */
export interface HandlerInspection {
  /** The controller class declaring the handler. */
  readonly controller: new (...args: any[]) => unknown

  /** The handler method's name. */
  readonly methodName: string

  /** The guards that run before the handler, in order: global guards, class guards, then method guards. */
  readonly guards: readonly InspectedGuard[]

  /** The interceptors around the handler, outermost first: global, class, then method interceptors. */
  readonly interceptors: readonly InspectedInterceptor[]

  /**
   * The exception filters for the handler, in the order they are tried: the method's, then the
   * controller's, then global ones.
   */
  readonly filters: readonly InspectedFilter[]

  /** The handler's cooldowns, the controller's first, with their defaults filled in. */
  readonly cooldowns: readonly InspectedCooldown[]

  /** The `@MessageHandler` pattern, or `undefined` for a listener and for any other kind of handler. */
  readonly pattern: string | undefined
  /** The `app`'s observers, in the order they are told about the call; empty without an `app`. */
  readonly observers: readonly (new (...args: any[]) => DispatchObserver)[]

  /**
   * Reads a metadata value as `ExecutionContext.get` does: the method's value, else the controller's.
   *
   * @param metadata - A decorator made by `createMetadata`, or a `SetMetadata` key.
   * @returns The value, or `undefined` when neither declares one.
   */
  get<T>(metadata: MetadataDecorator<T>): T | undefined
  get<T = unknown>(key: string | symbol): T | undefined

  /**
   * Reads every declared value as `ExecutionContext.getAll` does, method first, then controller.
   *
   * @param metadata - A decorator made by `createMetadata`, or a `SetMetadata` key.
   * @returns The declared values; empty when none is declared.
   */
  getAll<T>(metadata: MetadataDecorator<T>): T[]
  getAll<T = unknown>(key: string | symbol): T[]
}

/** One `@Cooldown` on a handler, as {@link inspectHandler} reports it. */
export interface InspectedCooldown {
  readonly seconds: number
  readonly uses: number
  readonly per: CooldownScope
  /** Whether it exempts some callers. */
  readonly bypass: boolean
  /** Whether it counts calls apart by a value of the call. */
  readonly by: boolean
}

/** What {@link inspectHandler} includes besides the handler's own metadata. */
export interface InspectHandlerOptions {
  /** The `@MeoCord` application class, whose global guards, interceptors and filters are included. */
  app?: new (...args: any[]) => unknown
}

/**
 * Reports what runs when a handler is dispatched, and the metadata declared on it, without building
 * a module or running anything. Use it to check that a decorator applied the guards and metadata it
 * should.
 *
 * @param controller - The controller class declaring the handler.
 * @param methodName - The handler method's name.
 * @param options - `app` to include the global guards, interceptors and filters `@MeoCord` declares.
 * @returns The handler's guards, interceptors, filters and cooldowns, in the order they apply, its
 *   message pattern, and a reader for its metadata.
 *
 * @example
 * ```ts
 * const ban = inspectHandler(ModerationController, 'ban')
 *
 * expect(ban.guards).toEqual([RolesGuard])
 * expect(ban.get(Roles)).toEqual(['admin'])
 *
 * expect(inspectHandler(ModerationController, 'ban', { app: App }).guards).toEqual([BlocklistGuard, RolesGuard])
 * ```
 */
export function inspectHandler<C extends new (...args: any[]) => unknown>(
  controller: C,
  methodName: keyof InstanceType<C> & string,
  options: InspectHandlerOptions = {},
): HandlerInspection {
  const context = new HandlerExecutionContext({ controller, methodName, args: [] })
  const globals = options.app ? appStages(options.app) : undefined
  const { guards, interceptors, filters } = handlerStages(controller.prototype as object, methodName, globals)

  return {
    controller,
    methodName,
    guards: Object.freeze([...guards]),
    interceptors: Object.freeze([...interceptors]),
    filters: Object.freeze(filters.flat()),
    cooldowns: Object.freeze(
      handlerCooldowns(controller.prototype as object, methodName).map(({ seconds, uses, per, bypass, by }) =>
        Object.freeze({ seconds, uses, per, bypass: bypass !== undefined, by: by !== undefined }),
      ),
    ),
    pattern: getMessageHandlers(controller.prototype).find(handler => handler.method === methodName)?.pattern,
    observers: Object.freeze(options.app ? appObservers(options.app) : []),
    get: (metadata: MetadataDecorator<unknown> | string | symbol) => context.get(metadata as string),
    getAll: (metadata: MetadataDecorator<unknown> | string | symbol) => context.getAll(metadata as string),
  } as HandlerInspection
}
