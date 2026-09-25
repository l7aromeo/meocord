import 'reflect-metadata'
import { makeInjectable } from '@src/util/injectable.util.js'
import { OBSERVER_CLASS } from '@src/core/observer-runner.js'
import { type DispatchObserver } from '@src/interface/index.js'
import { type ExecutionContextType } from '@src/common/execution-context.js'
import { defineStageTypes } from '@src/core/stage-scope.js'

/**
 * Marks a class as a dispatch observer: told about every call MeoCord dispatches once it has settled,
 * with its outcome and duration, for metrics and audit logs. List it in `@MeoCord({ observers })`.
 *
 * `onSettled` runs after the call has been answered, and the optional `onStart` as it begins; the call
 * waits for neither, so an observer can neither change nor delay one, and one that throws is logged.
 * One instance is resolved from the container, so it injects services and its lifecycle hooks run, but
 * not `ExecutionContext`, which both methods receive.
 *
 * @param options.types - The context types the observer is told about, as `ExecutionContext.getType()`
 *   reports them; calls of any other type pass it by. Every type when omitted; an empty list throws. A
 *   subclass inherits the types of the class it extends unless it declares its own.
 * @throws When the class has no `onSettled` method, or `types` is empty.
 *
 * @example
 * ```ts
 * @Observer()
 * export class AuditObserver implements DispatchObserver {
 *   constructor(private readonly audit: AuditService) {}
 *
 *   onSettled(context: ExecutionContext, { outcome, error }: DispatchResult) {
 *     if (outcome !== 'ran') this.audit.write(context.getHandlerName(), outcome, error)
 *   }
 * }
 *
 * @MeoCord({ controllers: [ShopController], observers: [AuditObserver], clientOptions: { intents: [] } })
 * class App {}
 * ```
 */
export function Observer(options: { types?: readonly ExecutionContextType[] } = {}) {
  return function (target: new (...args: any[]) => DispatchObserver) {
    if (typeof (target.prototype as Partial<DispatchObserver>).onSettled !== 'function') {
      throw new Error(`${target.name} is an @Observer but has no onSettled method.`)
    }
    makeInjectable(target)
    defineStageTypes(target, options.types, 'Observer')
    Reflect.defineMetadata(OBSERVER_CLASS, true, target)
  }
}
