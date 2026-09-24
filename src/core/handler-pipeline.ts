import { type Container } from 'inversify'
import { callGuardedHandler, type GuardEntry, handlerGuards, runGuards } from '@src/core/guard-runner.js'

/** The stages that run around one handler, in the order they run. */
export interface HandlerStages {
  guards: GuardEntry[]
}

/** How a call through the pipeline ended. */
export interface HandlerOutcome {
  /** Whether the handler itself ran. */
  ran: boolean
}

/** The stages dispatch runs for `methodName`, read from the controller's metadata. */
export function handlerStages(prototype: object, methodName: string): HandlerStages {
  return { guards: handlerGuards(prototype, methodName) }
}

/**
 * Runs one handler through the pipeline: its guards, then the handler with the dispatch marks set.
 * Dispatch and `TestingModule.invoke` both call this, so a test runs what production runs.
 */
export async function runHandler(
  container: Container,
  instance: Record<string, (...args: unknown[]) => unknown>,
  methodName: string,
  args: unknown[],
): Promise<HandlerOutcome> {
  const controller = instance.constructor as new (...args: any[]) => unknown
  const { guards } = handlerStages(Object.getPrototypeOf(instance), methodName)
  if (!(await runGuards(guards, { container, controller, methodName, args }))) return { ran: false }

  await callGuardedHandler(instance, methodName, args)
  return { ran: true }
}
