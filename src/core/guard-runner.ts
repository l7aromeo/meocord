import 'reflect-metadata'
import { Container, LazyServiceIdentifier } from 'inversify'
import { type GuardInterface } from '@src/interface/index.js'
import { MetadataKey } from '@src/enum/index.js'
import { ExecutionContext, type ExecutionContextType, HandlerExecutionContext } from '@src/common/execution-context.js'

export type GuardClass = new (...args: any[]) => GuardInterface

/** A guard class, and the properties set on its instance before `canActivate` runs. */
export interface GuardWithParams {
  /** The guard class to resolve. */
  provide: GuardClass

  /** Properties assigned to the guard instance. */
  params: Record<string, any>
}

export type GuardEntry = GuardClass | GuardWithParams

/** Whether a `@UseGuard` entry is a guard with params rather than a guard class. */
export function isGuardWithParams(guard: unknown): guard is GuardWithParams {
  return typeof guard === 'object' && guard !== null && 'provide' in guard && 'params' in guard
}

/** Where inversify keeps the tokens `@inject` declares; `design:paramtypes` covers the rest. */
const INVERSIFY_CLASS_METADATA = '@inversifyjs/core/classMetadataReflectKey'

interface InjectedElement {
  value?: unknown
}

/** The tokens a class's constructor and injected properties ask for. */
export function injectedTokens(cls: object): unknown[] {
  const tokens: unknown[] = [...((Reflect.getMetadata(MetadataKey.ParamTypes, cls) as unknown[] | undefined) ?? [])]
  const metadata = Reflect.getMetadata(INVERSIFY_CLASS_METADATA, cls) as
    | { constructorArguments?: InjectedElement[]; properties?: Map<unknown, InjectedElement> }
    | undefined

  for (const element of [...(metadata?.constructorArguments ?? []), ...(metadata?.properties?.values() ?? [])]) {
    const token = element?.value instanceof LazyServiceIdentifier ? element.value.unwrap() : element?.value
    if (token !== undefined) tokens.push(token)
  }
  return tokens
}

/**
 * The error for a class resolved once and shared that asks for the per-call `ExecutionContext`,
 * which would keep the first call's context for every later one.
 */
export function singletonContextError(cls: abstract new (...args: any[]) => unknown): Error {
  return new Error(
    `${cls.name || 'A class'} is resolved once and shared, so it cannot inject ExecutionContext: it would keep ` +
      `the first call's context for every later call. Inject ExecutionContext only into guards.`,
  )
}

const needsContextCache = new WeakMap<Container, WeakMap<object, boolean>>()

/**
 * Whether resolving `cls` from `container` reaches `ExecutionContext` through classes built for the
 * call. Bound tokens are shared and resolved from the root, so the walk stops at them.
 */
function needsContext(container: Container, cls: object, seen = new Set<object>()): boolean {
  let cache = needsContextCache.get(container)
  if (!cache) needsContextCache.set(container, (cache = new WeakMap()))
  const cached = cache.get(cls)
  if (cached !== undefined) return cached

  seen.add(cls)
  const result = injectedTokens(cls).some(token => {
    if (token === ExecutionContext) return true
    if (typeof token !== 'function' || seen.has(token)) return false
    if (container.isBound(token as never)) return false
    return needsContext(container, token, seen)
  })
  cache.set(cls, result)
  return result
}

/** Resolves a guard for one call, in a child container holding the context when it needs one. */
function resolveGuard(container: Container, guard: GuardClass, context: HandlerExecutionContext): GuardInterface {
  if (!needsContext(container, guard)) {
    return container.get(guard, { autobind: true })
  }

  const child = new Container({ parent: container })
  child.bind(ExecutionContext).toConstantValue(context)
  return child.get(guard, { autobind: true })
}

/** One guarded call: the container guards resolve from, and what the context describes. */
export interface GuardedCall {
  container: Container
  controller: new (...args: any[]) => unknown
  methodName: string
  args: readonly unknown[]
  type?: ExecutionContextType
}

/**
 * Runs guards in order, stopping at the first that denies.
 *
 * @returns Whether every guard allows the call.
 */
export async function runGuards(guards: readonly GuardEntry[], call: GuardedCall): Promise<boolean> {
  if (guards.length === 0) return true

  const { container, ...handlerCall } = call
  const context = new HandlerExecutionContext(handlerCall)

  for (const guard of guards) {
    const [guardClass, params] = isGuardWithParams(guard) ? [guard.provide, guard.params] : [guard, undefined]
    const guardInstance = resolveGuard(container, guardClass, context.withParams(params))
    if (params) Object.assign(guardInstance, params)

    if (typeof guardInstance.canActivate !== 'function') {
      throw new Error(
        `Guard ${guardClass.name} applied to ${call.methodName} does not have a valid canActivate method.`,
      )
    }

    if (!(await guardInstance.canActivate(...(call.args as Parameters<GuardInterface['canActivate']>)))) return false
  }
  return true
}

/** Private metadata: how many guard wrappers `@UseGuard` put around one method. */
export const GUARD_WRAPPERS = Symbol('guard_wrappers')

/** The prototype on the chain that declares `methodName`, which is the function dispatch calls. */
export function declaringPrototype(prototype: object, methodName: string): object | undefined {
  for (let current: object | null = prototype; current; current = Object.getPrototypeOf(current)) {
    if (Object.prototype.hasOwnProperty.call(current, methodName)) return current
  }
  return undefined
}

/** The guards dispatch runs before a handler, which are the guards its own wrappers would run. */
export function handlerGuards(prototype: object, methodName: string): GuardEntry[] {
  const owner = declaringPrototype(prototype, methodName)
  return owner ? ((Reflect.getOwnMetadata(MetadataKey.Guards, owner, methodName) as GuardEntry[] | undefined) ?? []) : []
}

function wrapperCount(prototype: object, methodName: string): number {
  const owner = declaringPrototype(prototype, methodName)
  return owner ? ((Reflect.getOwnMetadata(GUARD_WRAPPERS, owner, methodName) as number | undefined) ?? 0) : 0
}

/**
 * Calls dispatch has already guarded, keyed by first argument and method, counting the wrappers still
 * to pass. A user decorator that awaits between two wrappers leaves a pass pending during that await,
 * which a concurrent direct call with the same object and method could take; other overlaps fail closed.
 */
const dispatched = new WeakMap<object, Map<string, number>>()

/** Takes one pass for the wrapper being entered, if dispatch left one for this call. */
export function consumeDispatchMark(first: unknown, methodName: string): boolean {
  if (typeof first !== 'object' || first === null) return false
  const marks = dispatched.get(first)
  const remaining = marks?.get(methodName)
  if (!marks || !remaining) return false

  if (remaining > 1) marks.set(methodName, remaining - 1)
  else marks.delete(methodName)
  return true
}

/**
 * Calls a handler dispatch has already guarded. Its wrappers let this one call through; the passes
 * are removed afterwards, so a later direct call with the same (cached) object runs its guards.
 */
export async function callGuardedHandler(
  instance: Record<string, (...args: unknown[]) => unknown>,
  methodName: string,
  args: unknown[],
): Promise<unknown> {
  const [first] = args
  const count = wrapperCount(Object.getPrototypeOf(instance), methodName)
  if (count === 0 || typeof first !== 'object' || first === null) return instance[methodName](...args)

  let marks = dispatched.get(first)
  if (!marks) dispatched.set(first, (marks = new Map()))
  marks.set(methodName, count)
  try {
    return await instance[methodName](...args)
  } finally {
    marks.delete(methodName)
  }
}
