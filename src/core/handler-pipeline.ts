import 'reflect-metadata'
import { type Container } from 'inversify'
import { MetadataKey } from '@src/enum/index.js'
import { callGuardedHandler, type GuardEntry, handlerGuards, runGuards } from '@src/core/guard-runner.js'
import {
  handlerInterceptors,
  type InterceptorEntry,
  prepareInterceptor,
  runInterceptors,
} from '@src/core/interceptor-runner.js'
import { HandlerExecutionContext } from '@src/common/execution-context.js'
import {
  getAutocompleteHandlers,
  getCommandMap,
  getMessageHandlers,
  getReactionHandlers,
} from '@src/decorator/controller.decorator.js'

/** The stages that run around one handler, in the order they run. */
export interface HandlerStages {
  guards: GuardEntry[]
  interceptors: InterceptorEntry[]
}

/** The stages `@MeoCord` applies to every handler, which run before the controller's and method's. */
export interface GlobalStages {
  guards: readonly GuardEntry[]
  interceptors: readonly InterceptorEntry[]
}

const NO_GLOBAL_STAGES: GlobalStages = { guards: [], interceptors: [] }

/** Where a container keeps its application's global stages. */
const GLOBAL_STAGES = Symbol('global_stages')

/** The global stages declared by `@MeoCord` on an application class. */
export function appStages(app: object): GlobalStages {
  const options = Reflect.getMetadata(MetadataKey.AppOptions, app) as
    | { guards?: GuardEntry[]; interceptors?: InterceptorEntry[] }
    | undefined
  if (!options) {
    throw new Error(`${(app as { name?: string }).name || 'The app'} is not decorated with @MeoCord().`)
  }
  return { guards: [...(options.guards ?? [])], interceptors: [...(options.interceptors ?? [])] }
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
  return {
    guards: [...globals.guards, ...handlerGuards(prototype, methodName)],
    interceptors: [...globals.interceptors, ...handlerInterceptors(prototype, methodName)],
  }
}

/**
 * Binds the interceptors every handler of `controllers` uses, and the global ones, as singletons, so
 * one that cannot be shared fails at startup rather than on its first call.
 */
export function prepareHandlerStages(container: Container, controllers: readonly (new (...args: any[]) => unknown)[]): void {
  const globals = globalStagesOf(container)
  for (const entry of globals.interceptors) prepareInterceptor(container, entry)

  for (const controller of controllers) {
    const prototype = controller.prototype as object
    const methods = new Set<string>([
      ...Object.values(getCommandMap(prototype) ?? {})
        .flat()
        .map(command => command.methodName),
      ...getMessageHandlers(prototype).map(handler => handler.method),
      ...getReactionHandlers(prototype).map(handler => handler.method),
      ...getAutocompleteHandlers(prototype).map(handler => handler.methodName),
    ])
    for (const method of methods) {
      for (const entry of handlerInterceptors(prototype, method)) prepareInterceptor(container, entry)
    }
  }
}

/**
 * Runs one handler through the pipeline: the global guards, then the handler's own; then the
 * interceptors, global first, around the handler, which is called with the dispatch marks set.
 * Dispatch and `TestingModule.invoke` both call this, so a test runs what production runs.
 */
export async function runHandler(
  container: Container,
  instance: Record<string, (...args: unknown[]) => unknown>,
  methodName: string,
  args: unknown[],
): Promise<HandlerOutcome> {
  const controller = instance.constructor as new (...args: any[]) => unknown
  const { guards, interceptors } = handlerStages(Object.getPrototypeOf(instance), methodName, globalStagesOf(container))
  if (!(await runGuards(guards, { container, controller, methodName, args }))) return { ran: false }

  let ran = false
  const handler = async () => {
    ran = true
    return callGuardedHandler(instance, methodName, args)
  }

  const context = new HandlerExecutionContext({ controller, methodName, args })
  // Autocomplete answers within three seconds and has no reply to shape, so it skips interceptors.
  if (context.getType() === 'autocomplete' || interceptors.length === 0) await handler()
  else await runInterceptors(interceptors, container, context, handler)
  return { ran }
}
