import { type StandardSchemaV1Issue } from '@src/interface/standard-schema.interface.js'

/**
 * Thrown by a guard to deny a call and tell the user why. Returning `false` from `canActivate` denies
 * silently; throwing this denies with its message, which the built-in fallback shows only to the user
 * who made the call. A filter can catch it to answer differently.
 *
 * @example
 * ```typescript
 * @Guard()
 * export class OwnerGuard implements GuardInterface {
 *   canActivate(interaction: ButtonInteraction, { ownerId }: { ownerId: string }): boolean {
 *     if (interaction.user.id !== ownerId) throw new GuardDeniedError('Only the owner can use this.')
 *     return true
 *   }
 * }
 * ```
 */
export class GuardDeniedError extends Error {
  /** @param message - What the user is told. */
  constructor(message: string) {
    super(message)
    this.name = 'GuardDeniedError'
  }
}

/**
 * The error dispatch reports when an interaction matches no handler, such as a button whose customId
 * fits no `@Command` pattern. Global filters receive it, with no handler in their `ExecutionContext`;
 * without one, the built-in fallback answers "Command not found!".
 *
 * @example
 * ```typescript
 * @Catch(CommandNotFoundError)
 * export class NotFoundFilter implements ExceptionFilter<CommandNotFoundError> {
 *   async catch(_error: CommandNotFoundError, context: ExecutionContext) {
 *     const interaction = context.getInteraction()
 *     if (interaction?.isRepliable()) await interaction.reply({ content: 'That button has expired.', flags: MessageFlags.Ephemeral })
 *   }
 * }
 * ```
 */
export class CommandNotFoundError extends Error {
  constructor(message = 'No handler matched the interaction.') {
    super(message)
    this.name = 'CommandNotFoundError'
  }
}

/** One problem `@Validate` found in a handler's input. */
export interface ValidationIssue {
  /** What is wrong, as the schema library wrote it. */
  message: string
  /** Where it is, such as `['minutes']`; empty for the input as a whole. */
  path: PropertyKey[]
}

/**
 * Thrown when a handler's input fails its `@Validate` schema, so the handler does not run. The user is
 * answered privately with {@link ValidationError.issues}; an exception filter can phrase them otherwise.
 *
 * @example
 * ```ts
 * @Catch(ValidationError)
 * export class ValidationFilter implements ExceptionFilter<ValidationError> {
 *   async catch(error: ValidationError, context: ExecutionContext) {
 *     const lines = error.issues.map(issue => `${issue.path.join('.') || 'input'}: ${issue.message}`)
 *   }
 * }
 * ```
 */
export class ValidationError extends Error {
  /** @param issues - Every problem found, in the order the schema reported them. */
  constructor(readonly issues: ValidationIssue[]) {
    super(issues.map(issue => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message)).join('\n'))
    this.name = 'ValidationError'
  }

  /** The issues a Standard Schema reported, with each path reduced to its keys. */
  static fromSchemaIssues(issues: readonly StandardSchemaV1Issue[]): ValidationError {
    return new ValidationError(
      issues.map(({ message, path = [] }) => ({
        message,
        path: path.map(segment => (typeof segment === 'object' ? segment.key : segment)),
      })),
    )
  }
}

/** The scope a cooldown counts calls in. */
export type CooldownScope = 'user' | 'guild' | 'channel' | 'global'

/**
 * What a blocked caller is told: "Slow down: try again in 12s." The one place this text is written,
 * so a filter, a presenter or a translator can replace it by catching `CooldownError`.
 *
 * @param retryAfterMs - How long until the next call is allowed.
 */
export function cooldownMessage(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  const wait = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60 ? ` ${seconds % 60}s` : ''}`
  return `Slow down: try again in ${wait}.`
}

/**
 * Thrown when a `@Cooldown` blocks a call, so the handler does not run. The built-in fallback answers
 * only the caller, with {@link cooldownMessage}; a filter can catch it to answer otherwise.
 *
 * @example
 * ```ts
 * @Catch(CooldownError)
 * export class CooldownFilter implements ExceptionFilter<CooldownError> {
 *   async catch(error: CooldownError, context: ExecutionContext) {
 *     const interaction = context.getInteraction()
 *     if (interaction?.isRepliable()) {
 *       await interaction.reply({ content: `Wait ${Math.ceil(error.retryAfterMs / 1000)}s.`, flags: MessageFlags.Ephemeral })
 *     }
 *   }
 * }
 * ```
 */
export class CooldownError extends Error {
  /**
   * @param retryAfterMs - How long until the next call is allowed.
   * @param per - The scope of the cooldown that blocked the call.
   */
  constructor(
    readonly retryAfterMs: number,
    readonly per: CooldownScope,
  ) {
    super(cooldownMessage(retryAfterMs))
    this.name = 'CooldownError'
  }
}
