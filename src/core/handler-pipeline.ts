import 'reflect-metadata'
import { type Container } from 'inversify'
import { MetadataKey } from '@src/enum/index.js'
import { callGuardedHandler, type GuardEntry, handlerGuards, runGuards } from '@src/core/guard-runner.js'

/** The stages that run around one handler, in the order they run. */
export interface HandlerStages {
  guards: GuardEntry[]
}

/** The stages `@MeoCord` applies to every handler, which run before the controller's and method's. */
export interface GlobalStages {
  guards: readonly GuardEntry[]
}

const NO_GLOBAL_STAGES: GlobalStages = { guards: [] }

/** Where a container keeps its application's global stages. */
const GLOBAL_STAGES = Symbol('global_stages')

/** The global stages declared by `@MeoCord` on an application class. */
export function appStages(app: object): GlobalStages {
  const options = Reflect.getMetadata(MetadataKey.AppOptions, app) as { guards?: GuardEntry[] } | undefined
  if (!options) {
    throw new Error(`${(app as { name?: string }).name || 'The app'} is not decorated with @MeoCord().`)
  }
  return { guards: [...(options.guards ?? [])] }
}

/** Stores the global stages that handlers run through `container` start with. */
export function bindGlobalStages(container: Container, stages: GlobalStages): void {
  container.bind<GlobalStages>(GLOBAL_STAGES).toConstantValue(stages)
}

function globalStagesOf(container: Container): GlobalStages {
  return container.isBound(GLOBAL_STAGES) ? container.get<GlobalStages>(GLOBAL_STAGES) : NO_GLOBAL_STAGES
}

/** How a call through the pipeline ended. */
export interface HandlerOutcome {
  /** Whether the handler itself ran. */
  ran: boolean
}

/** The stages dispatch runs for `methodName`: the global ones, then the controller's metadata. */
export function handlerStages(
  prototype: object,
  methodName: string,
  globals: GlobalStages = NO_GLOBAL_STAGES,
): HandlerStages {
  return { guards: [...globals.guards, ...handlerGuards(prototype, methodName)] }
}

/**
 * Runs one handler through the pipeline: the container's global guards, then the handler's own, then
 * the handler with the dispatch marks set.
 * Dispatch and `TestingModule.invoke` both call this, so a test runs what production runs.
 */
export async function runHandler(
  container: Container,
  instance: Record<string, (...args: unknown[]) => unknown>,
  methodName: string,
  args: unknown[],
): Promise<HandlerOutcome> {
  const controller = instance.constructor as new (...args: any[]) => unknown
  const { guards } = handlerStages(Object.getPrototypeOf(instance), methodName, globalStagesOf(container))
  if (!(await runGuards(guards, { container, controller, methodName, args }))) return { ran: false }

  await callGuardedHandler(instance, methodName, args)
  return { ran: true }
}
