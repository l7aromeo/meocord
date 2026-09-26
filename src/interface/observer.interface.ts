import { type ExecutionContext } from '@src/common/execution-context.js'

/**
 * How a dispatched call ended:
 *
 * - `'ran'`: it settled without an error. An interceptor that answers without calling `next.handle()`,
 *   from a cache for instance, counts too.
 * - `'denied'`: a guard returned `false` or threw `GuardDeniedError`.
 * - `'cooldown'`: a `@Cooldown` refused it with `CooldownError`.
 * - `'invalid'`: `@Validate` refused its input with `ValidationError`.
 * - `'refused'`: a `UserError` told the user what to fix, such as too few coins: their mistake, not a
 *   fault of the bot.
 * - `'error'`: anything else was thrown, by the handler, a pipe, an interceptor or a guard.
 * - `'not-found'`: an interaction no handler matches, such as a button whose customId no pattern
 *   routes, or an autocomplete no `@Autocomplete` claims.
 */
export type DispatchOutcome = 'ran' | 'denied' | 'cooldown' | 'invalid' | 'refused' | 'error' | 'not-found'

/** What a {@link DispatchObserver} is told about a call once it has settled. */
export interface DispatchResult {
  /** How the call ended. */
  outcome: DispatchOutcome
  /** When dispatch received the call, in milliseconds since the Unix epoch. */
  startedAt: number
  /**
   * How long the call took, in milliseconds from `performance.now()`: from dispatch until the filters
   * and the fallback had answered, so it includes an error's answer.
   */
  durationMs: number
  /**
   * The guard class that denied the call, whether it returned `false` or threw `GuardDeniedError`.
   * Only with the outcome `'denied'`, and not for a `GuardDeniedError` the handler threw itself.
   */
  deniedBy?: abstract new (...args: any[]) => unknown
  /**
   * Where the interaction's answer stood once the call settled: `'replied'`, `'deferred'` (deferred and
   * never followed up, which leaves the user waiting) or `'unanswered'`. An autocomplete is `'replied'`
   * once it answered. Only for interactions; `undefined` for messages, reactions and events.
   */
  response?: 'replied' | 'deferred' | 'unanswered'
  /** The error the call ended with, for `'denied'` by `GuardDeniedError`, `'cooldown'`, `'invalid'`, `'refused'`, `'error'` and most `'not-found'`. */
  error?: unknown
  /** Whether an exception filter or the built-in fallback answered the error. `false` without an error. */
  handled: boolean
}

/**
 * Observes every call MeoCord dispatches: commands, components, modals, autocomplete, message, reaction
 * and event handlers, and interactions no handler matches. A message no handler matches is not a call
 * and is not reported. Declare it with `@Observer()`, optionally limited to some `types`, and list it in
 * `@MeoCord({ observers })`.
 *
 * An observer cannot change a call: `onStart` sees it begin and `onSettled` sees it end, and the call
 * waits for neither. A slow one never delays a handler, and one that throws is logged, and the other
 * observers still run. One instance is resolved from the container, so it injects services, and its
 * `onReady` and `onShutdown` hooks run with theirs; it cannot inject `ExecutionContext`, which is passed
 * in instead.
 *
 * @example
 * ```ts
 * @Observer()
 * export class MetricsObserver implements DispatchObserver {
 *   constructor(private readonly metrics: MetricsService) {}
 *
 *   onSettled(context: ExecutionContext, { outcome, durationMs }: DispatchResult) {
 *     this.metrics.record(context.getType(), context.getHandlerName() ?? 'unrouted', outcome, durationMs)
 *   }
 * }
 * ```
 */
export interface DispatchObserver {
  /**
   * Receives a call as it begins, before `@Defer` and the guards, for a call that reached a handler; an
   * interaction no handler matches gets only `onSettled`. It is not waited for, and one that throws is
   * logged. `onSettled` for the same call receives the same context object, so a `WeakMap` keyed by it
   * pairs the two.
   *
   * For spans around work inside the handler, such as a database query under the command's span, use an
   * interceptor: an observer sees the call from outside, and nothing that runs within it.
   *
   * @param context - The call's context.
   */
  onStart?(context: ExecutionContext): void

  /**
   * Receives one settled call.
   *
   * @param context - The call's context: its handler, arguments and metadata. For an interaction no
   *   handler matched, it has no controller or handler.
   * @param result - How the call ended, and how long it took.
   */
  onSettled(context: ExecutionContext, result: DispatchResult): void | Promise<void>
}
