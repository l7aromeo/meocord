import 'reflect-metadata'
import { type InterceptorInterface } from '@src/interface/index.js'
import { CLASS_INTERCEPTORS, type InterceptorEntry, METHOD_INTERCEPTORS } from '@src/core/interceptor-runner.js'
import { makeInjectable } from '@src/util/injectable.util.js'
import { defineStageTypes } from '@src/core/stage-scope.js'
import { type ExecutionContextType } from '@src/common/execution-context.js'

/**
 * Marks a class as an interceptor, for use with {@link UseInterceptor}. The class implements
 * `InterceptorInterface`. One instance is shared across calls.
 *
 * An interceptor runs for every kind of handler it is applied to unless `types` limits it. A global
 * interceptor from `@MeoCord({ interceptors })` also runs around `@On` and `@Once` event handlers.
 *
 * @param options.types - The context types the interceptor runs for, as `ExecutionContext.getType()`
 *   reports them; for any other call it is skipped. Every type when omitted; an empty list, or
 *   `['autocomplete']`, which interceptors never run for, throws. A subclass inherits the types of the
 *   class it extends unless it declares its own.
 *
 * @example
 * ```typescript
 * @Interceptor()
 * export class TimingInterceptor implements InterceptorInterface {
 *   async intercept(context: ExecutionContext, next: CallHandler): Promise<unknown> {
 *     const started = performance.now()
 *     try {
 *       return await next.handle()
 *     } finally {
 *       console.log(`${context.getHandlerName()} took ${Math.round(performance.now() - started)} ms`)
 *     }
 *   }
 * }
 * ```
 */
export function Interceptor(options: { types?: readonly ExecutionContextType[] } = {}) {
  return function (target: new (...args: any[]) => InterceptorInterface) {
    makeInjectable(target)
    defineStageTypes(target, options.types, 'Interceptor')
  }
}

/**
 * Runs interceptors around a handler, or around every handler of a controller, after the handler's
 * guards allow the call. Global interceptors from `@MeoCord({ interceptors })` run first, then the
 * controller's, then the method's; the first listed is outermost.
 *
 * Interceptors run when a handler is dispatched, or run with `TestingModule.invoke` in a test. A
 * controller method called directly runs its guards but no interceptors. Autocomplete handlers run
 * none.
 *
 * @param interceptors - Interceptor classes, or `{ provide, params }` to hand `params` to the
 *   interceptor through `context.getParams()`.
 *
 * @example
 * ```typescript
 * @Controller()
 * @UseInterceptor(TimingInterceptor)
 * export class ProfileController {
 *   @Command('profile', CommandType.SLASH)
 *   @UseInterceptor({ provide: CacheInterceptor, params: { ttl: 30_000 } })
 *   async profile(interaction: ChatInputCommandInteraction) {}
 * }
 * ```
 */
export function UseInterceptor(
  ...interceptors: (
    | (new (...args: any[]) => InterceptorInterface)
    | { provide: new (...args: any[]) => InterceptorInterface; params: Record<string, any> }
  )[]
): ClassDecorator & MethodDecorator {
  return function (target: object, propertyKey?: string | symbol) {
    // Decorators apply bottom-up, so a higher decorator's interceptors go first, as with @UseGuard.
    if (propertyKey === undefined) {
      const existing: InterceptorEntry[] = Reflect.getOwnMetadata(CLASS_INTERCEPTORS, target) ?? []
      Reflect.defineMetadata(CLASS_INTERCEPTORS, [...interceptors, ...existing], target)
    } else {
      const existing: InterceptorEntry[] = Reflect.getOwnMetadata(METHOD_INTERCEPTORS, target, propertyKey) ?? []
      Reflect.defineMetadata(METHOD_INTERCEPTORS, [...interceptors, ...existing], target, propertyKey)
    }
  } as ClassDecorator & MethodDecorator
}
