import 'reflect-metadata'
import { type ExceptionFilter } from '@src/interface/index.js'
import { CATCH_TYPES, CLASS_FILTERS, type FilterEntry, METHOD_FILTERS } from '@src/core/filter-runner.js'
import { makeInjectable } from '@src/util/injectable.util.js'
import { assertStageEntries } from '@src/core/stage-scope.js'
import { type CheckedEntry } from '@src/decorator/stage-entry.js'

/**
 * Marks a class as an exception filter that handles the given error types, matched with
 * `instanceof`. With no types, it handles every error. The class implements `ExceptionFilter`; one
 * instance is shared across calls.
 *
 * @param errorTypes - The error classes the filter handles.
 *
 * @example
 * ```typescript
 * @Catch(RateLimitedError)
 * export class RateLimitedFilter implements ExceptionFilter<RateLimitedError> {
 *   async catch(error: RateLimitedError, context: ExecutionContext) {
 *     // Private, and right wherever the answer stands: a reply, the deferred reply edited, or a follow-up
 *     await context.response?.error(error, { message: `Slow down: try again in ${error.retryAfter}s.` })
 *   }
 * }
 * ```
 */
export function Catch(...errorTypes: (abstract new (...args: any[]) => unknown)[]) {
  return function (target: new (...args: any[]) => ExceptionFilter<any>) {
    makeInjectable(target)
    Reflect.defineMetadata(CATCH_TYPES, errorTypes, target)
  }
}

/**
 * Applies exception filters to a handler, or to every handler of a controller. They handle errors
 * from the handler, its interceptors and its guards.
 *
 * The filter closest to the handler wins: the method's filters, then the controller's, then global
 * ones from `@MeoCord({ filters })`; within one level, the first whose `@Catch` matches, in the order
 * listed. An error no filter handles goes to the built-in fallback, which logs it and tells the user
 * something went wrong. Under `TestingModule.invoke`, such an error rejects instead. Filters apply to
 * dispatched handlers and under `invoke`; a controller method called directly throws as it would
 * without them.
 *
 * @param filters - Filter classes, or `{ provide, params? }` to hand `params` to the filter through
 *   `context.getParams()`. Any other entry is refused when the decorator applies.
 *
 * @example
 * ```typescript
 * @Controller()
 * @UseFilter(RateLimitedFilter)
 * export class ProfileController {
 *   @Command('profile', CommandType.SLASH)
 *   @UseFilter(ProfileNotFoundFilter)
 *   async profile(interaction: ChatInputCommandInteraction) {}
 * }
 * ```
 */
export function UseFilter<const T extends readonly unknown[]>(
  ...filters: { [K in keyof T]: CheckedEntry<T[K], new (...args: any[]) => ExceptionFilter<any>> }
): ClassDecorator & MethodDecorator {
  return function (target: object, propertyKey?: string | symbol) {
    const where = propertyKey === undefined ? (target as { name: string }).name : `${target.constructor.name}.${String(propertyKey)}`
    assertStageEntries('@UseFilter', 'filter', where, filters)
    // Decorators apply bottom-up, so a higher decorator's filters are tried first.
    if (propertyKey === undefined) {
      const existing: FilterEntry[] = Reflect.getOwnMetadata(CLASS_FILTERS, target) ?? []
      Reflect.defineMetadata(CLASS_FILTERS, [...filters, ...existing], target)
    } else {
      const existing: FilterEntry[] = Reflect.getOwnMetadata(METHOD_FILTERS, target, propertyKey) ?? []
      Reflect.defineMetadata(METHOD_FILTERS, [...filters, ...existing], target, propertyKey)
    }
  } as ClassDecorator & MethodDecorator
}
