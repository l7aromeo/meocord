import { type ExecutionContext, type ExecutionContextType, HandlerExecutionContext } from '@src/common/execution-context.js'

/** What {@link createExecutionContext} describes besides the handler. */
export interface ExecutionContextOptions {
  /** The handler's arguments, such as the interaction and its params. */
  args?: unknown[]

  /** The `params` of the guard's `{ provide, params }` entry, returned by `getParams()`. */
  params?: Record<string, unknown>

  /** What is being handled. Read from the first argument when omitted. */
  type?: ExecutionContextType
}

/**
 * Builds the `ExecutionContext` a guard receives for one handler, so a guard can be constructed and
 * tested on its own. Metadata is read from the real controller, as it is at runtime.
 *
 * @param controller - The controller class declaring the handler.
 * @param methodName - The handler method's name.
 * @param options - The call's arguments, the guard's params and the call type.
 * @returns The context for that call.
 *
 * @example
 * ```ts
 * const interaction = createMockInteraction(ChatInputCommandInteraction)
 * const context = createExecutionContext(ModerationController, 'ban', { args: [interaction] })
 *
 * expect(new RolesGuard(context).canActivate(interaction)).toBe(false)
 * ```
 */
export function createExecutionContext<C extends new (...args: any[]) => unknown>(
  controller: C,
  methodName: keyof InstanceType<C> & string,
  options: ExecutionContextOptions = {},
): ExecutionContext {
  const { args = [], params, type } = options
  return new HandlerExecutionContext({ controller, methodName, args, params, type })
}
