const EXPLAINED = Symbol.for('meocord.explained')

/** Marks an error MeoCord has logged an explanation for, leaving the error otherwise as it was. */
export function markExplained(error: unknown): void {
  if (typeof error === 'object' && error !== null && Object.isExtensible(error)) {
    Object.defineProperty(error, EXPLAINED, { value: true, enumerable: false })
  }
}

/**
 * Whether MeoCord has already logged what went wrong and what to do about it, such as Discord refusing
 * the bot token or a privileged intent at login. The error is the one discord.js raised, unchanged; logging it again
 * would only repeat the explanation with a stack trace.
 *
 * @param error - An error `app.start()` rejected with.
 * @returns `true` when MeoCord explained the error.
 *
 * @example
 * ```typescript
 * // src/main.ts
 * bootstrap().catch(error => {
 *   if (!isExplainedError(error)) logger.error('Error during startup:', error)
 * })
 * ```
 */
export function isExplainedError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as Record<symbol, unknown>)[EXPLAINED] === true
}
