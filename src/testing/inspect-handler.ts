import 'reflect-metadata'
import { type GuardInterface } from '@src/interface/index.js'
import { HandlerExecutionContext } from '@src/common/execution-context.js'
import { type MetadataDecorator } from '@src/common/metadata.js'
import { handlerStages } from '@src/core/handler-pipeline.js'

/** A guard as `@UseGuard` declares it: the class, or the class with the params set on its instance. */
export type InspectedGuard =
  | (new (...args: any[]) => GuardInterface)
  | { provide: new (...args: any[]) => GuardInterface; params: Record<string, any> }

/** What runs for one handler, and the metadata declared on it, as {@link inspectHandler} reports it. */
export interface HandlerInspection {
  /** The controller class declaring the handler. */
  readonly controller: new (...args: any[]) => unknown

  /** The handler method's name. */
  readonly methodName: string

  /** The guards that run before the handler, in order: class guards, then method guards. */
  readonly guards: readonly InspectedGuard[]

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

/**
 * Reports what runs when a handler is dispatched, and the metadata declared on it, without building
 * a module or running anything. Use it to check that a decorator applied the guards and metadata it
 * should.
 *
 * @param controller - The controller class declaring the handler.
 * @param methodName - The handler method's name.
 * @returns The handler's guards, in the order they run, and a reader for its metadata.
 *
 * @example
 * ```ts
 * const ban = inspectHandler(ModerationController, 'ban')
 *
 * expect(ban.guards).toEqual([RolesGuard])
 * expect(ban.get(Roles)).toEqual(['admin'])
 * ```
 */
export function inspectHandler<C extends new (...args: any[]) => unknown>(
  controller: C,
  methodName: keyof InstanceType<C> & string,
): HandlerInspection {
  const context = new HandlerExecutionContext({ controller, methodName, args: [] })
  const { guards } = handlerStages(controller.prototype as object, methodName)

  return {
    controller,
    methodName,
    guards: Object.freeze([...guards]),
    get: (metadata: MetadataDecorator<unknown> | string | symbol) => context.get(metadata as string),
    getAll: (metadata: MetadataDecorator<unknown> | string | symbol) => context.getAll(metadata as string),
  } as HandlerInspection
}
