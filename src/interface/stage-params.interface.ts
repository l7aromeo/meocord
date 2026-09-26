/**
 * The `params` a guard, interceptor, filter or pipe declares with `declare readonly params?: P`, which
 * `{ provide, params }` is checked against: `P`, or any values for a class that declares none. An
 * interceptor, filter or pipe, shared across calls, reads them with `context.getParams<StageParams<typeof X>>()`.
 *
 * @example
 * ```ts
 * @Interceptor()
 * export class TimeoutInterceptor implements InterceptorInterface {
 *   declare readonly params?: { ms: number }
 *
 *   intercept(context: ExecutionContext, next: CallHandler) {
 *     const { ms } = context.getParams<StageParams<typeof TimeoutInterceptor>>() ?? { ms: 3000 }
 *     return withTimeout(next.handle(), ms)
 *   }
 * }
 * ```
 */
export type StageParams<C extends abstract new (...args: any[]) => unknown> = 'params' extends keyof InstanceType<C>
  ? NonNullable<InstanceType<C>['params' & keyof InstanceType<C>]>
  : Record<string, any>
