import 'reflect-metadata'
import { type Container } from 'inversify'
import { type InterceptorInterface } from '@src/interface/index.js'
import { injectedTokens, singletonContextError, sourcePrototype } from '@src/core/guard-runner.js'
import { ExecutionContext, type HandlerExecutionContext } from '@src/common/execution-context.js'
import { makeInjectable } from '@src/util/injectable.util.js'
import { isAppClassToken } from '@src/core/lifecycle-order.js'

export type InterceptorClass = new (...args: any[]) => InterceptorInterface

/** An interceptor class, and the params its `ExecutionContext.getParams()` returns. */
export interface InterceptorWithParams {
  provide: InterceptorClass
  params: Record<string, any>
}

export type InterceptorEntry = InterceptorClass | InterceptorWithParams

function isInterceptorWithParams(entry: unknown): entry is InterceptorWithParams {
  return typeof entry === 'object' && entry !== null && 'provide' in entry && 'params' in entry
}

/** Private metadata: the interceptors a class-level `@UseInterceptor` applies, on the class. */
export const CLASS_INTERCEPTORS = Symbol('class_interceptors')

/** Private metadata: the interceptors a method-level `@UseInterceptor` applies, on the method. */
export const METHOD_INTERCEPTORS = Symbol('method_interceptors')

/**
 * The interceptors around a handler: class interceptors from the controller up to the class declaring
 * the handler, subclass first, then the method's.
 */
export function handlerInterceptors(prototype: object, methodName: string): InterceptorEntry[] {
  const source = sourcePrototype(prototype, methodName)
  if (!source) return []

  const entries: InterceptorEntry[] = []
  for (let current: object | null = prototype; current; current = Object.getPrototypeOf(current)) {
    entries.push(...((Reflect.getOwnMetadata(CLASS_INTERCEPTORS, current.constructor) as InterceptorEntry[]) ?? []))
    if (current === source) break
  }
  return [...entries, ...((Reflect.getOwnMetadata(METHOD_INTERCEPTORS, source, methodName) as InterceptorEntry[]) ?? [])]
}

/** Binds `cls` and its unbound dependencies as singletons, refusing any that injects `ExecutionContext`. */
export function bindShared(container: Container, cls: new (...args: any[]) => unknown): void {
  if (container.isBound(cls)) return
  if (injectedTokens(cls).includes(ExecutionContext)) throw singletonContextError(cls)

  makeInjectable(cls)
  container.bind(cls).toSelf().inSingletonScope()
  for (const dep of injectedTokens(cls)) {
    if (isAppClassToken(dep)) bindShared(container, dep)
  }
}

/**
 * Binds an interceptor as a singleton in `container`, unless it is already bound (an override, or an
 * earlier call). A shared instance cannot inject the per-call `ExecutionContext`.
 */
export function prepareInterceptor(container: Container, entry: InterceptorEntry): void {
  bindShared(container, isInterceptorWithParams(entry) ? entry.provide : entry)
}

/**
 * Runs `handler` inside `interceptors`, the first outermost. Each receives the call's context with its
 * own params, and continues with `next.handle()`.
 */
export async function runInterceptors(
  interceptors: readonly InterceptorEntry[],
  container: Container,
  context: HandlerExecutionContext,
  handler: () => Promise<unknown>,
): Promise<unknown> {
  const run = async (index: number): Promise<unknown> => {
    if (index === interceptors.length) return handler()

    const entry = interceptors[index]
    const [cls, params] = isInterceptorWithParams(entry) ? [entry.provide, entry.params] : [entry, undefined]
    prepareInterceptor(container, cls)
    const interceptor = container.get<InterceptorInterface>(cls)

    if (typeof interceptor.intercept !== 'function') {
      throw new Error(
        `Interceptor ${cls.name} applied to ${context.getHandlerName()} does not have a valid intercept method.`,
      )
    }
    return interceptor.intercept(context.withParams(params), { handle: () => run(index + 1) })
  }
  return run(0)
}
