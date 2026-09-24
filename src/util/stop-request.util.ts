/**
 * How close together two stop signals count as one request. A terminal's Ctrl+C reaches every process
 * in its group, and the CLI also passes it on to the application, so one press can arrive twice.
 */
export const REPEAT_SIGNAL_WINDOW_MS = 1_000

/** A stop request: the first, a copy of it within the window, or a repeat after it, which asks to stop at once. */
export type StopRequest = 'first' | 'duplicate' | 'repeat'

/** Returns a function that classifies each stop request it is called for, timed from the first. */
export function stopRequests(now: () => number = () => Date.now()): () => StopRequest {
  let firstAt: number | undefined
  return () => {
    const at = now()
    if (firstAt === undefined) {
      firstAt = at
      return 'first'
    }
    return at - firstAt < REPEAT_SIGNAL_WINDOW_MS ? 'duplicate' : 'repeat'
  }
}
