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
