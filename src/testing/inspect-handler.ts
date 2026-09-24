import 'reflect-metadata'
import { type GuardInterface, type InterceptorInterface } from '@src/interface/index.js'
import { HandlerExecutionContext } from '@src/common/execution-context.js'
import { type MetadataDecorator } from '@src/common/metadata.js'
import { appStages, handlerStages } from '@src/core/handler-pipeline.js'

/** A guard as `@UseGuard` declares it: the class, or the class with the params set on its instance. */
export type InspectedGuard =
  | (new (...args: any[]) => GuardInterface)
  | { provide: new (...args: any[]) => GuardInterface; params: Record<string, any> }

/** An interceptor as `@UseInterceptor` declares it: the class, or the class with its params. */
export type InspectedInterceptor =
  | (new (...args: any[]) => InterceptorInterface)
  | { provide: new (...args: any[]) => InterceptorInterface; params: Record<string, any> }

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

/** What {@link inspectHandler} includes besides the handler's own metadata. */
export interface InspectHandlerOptions {
  /** The `@MeoCord` application class, whose global guards and interceptors come before the handler's own. */
  app?: new (...args: any[]) => unknown
}

/**
 * Reports what runs when a handler is dispatched, and the metadata declared on it, without building
 * a module or running anything. Use it to check that a decorator applied the guards and metadata it
 * should.
 *
 * @param controller - The controller class declaring the handler.
 * @param methodName - The handler method's name.
 * @param options - `app` to include the global guards and interceptors `@MeoCord` declares.
 * @returns The handler's guards and interceptors, in the order they run, and a reader for its metadata.
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
  const { guards, interceptors } = handlerStages(controller.prototype as object, methodName, globals)

  return {
    controller,
    methodName,
    guards: Object.freeze([...guards]),
    interceptors: Object.freeze([...interceptors]),
    get: (metadata: MetadataDecorator<unknown> | string | symbol) => context.get(metadata as string),
    getAll: (metadata: MetadataDecorator<unknown> | string | symbol) => context.getAll(metadata as string),
  } as HandlerInspection
}
