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
import { HandlerExecutionContext, UnroutedExecutionContext } from '@src/common/execution-context.js'
import {
  callFilter,
  type FilterContext,
  type FilterEntry,
  handlerFilterLevels,
  matchFilter,
  prepareFilter,
} from '@src/core/filter-runner.js'
import { type Fallback } from '@src/core/fallback.js'
import { Logger } from '@src/common/logger.js'
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
  /** Filters by level, the level closest to the handler first: method, class, global. */
  filters: FilterEntry[][]
}

/** The stages `@MeoCord` applies to every handler, which run before the controller's and method's. */
export interface GlobalStages {
  guards: readonly GuardEntry[]
  interceptors: readonly InterceptorEntry[]
  filters: readonly FilterEntry[]
}

const NO_GLOBAL_STAGES: GlobalStages = { guards: [], interceptors: [], filters: [] }

/** Where a container keeps its application's global stages. */
const GLOBAL_STAGES = Symbol('global_stages')

/** The global stages declared by `@MeoCord` on an application class. */
export function appStages(app: object): GlobalStages {
  const options = Reflect.getMetadata(MetadataKey.AppOptions, app) as
    | { guards?: GuardEntry[]; interceptors?: InterceptorEntry[]; filters?: FilterEntry[] }
    | undefined
  if (!options) {
    throw new Error(`${(app as { name?: string }).name || 'The app'} is not decorated with @MeoCord().`)
  }
  return {
    guards: [...(options.guards ?? [])],
    interceptors: [...(options.interceptors ?? [])],
    filters: [...(options.filters ?? [])],
  }
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

  /** The error a filter or the fallback handled, when the call failed. */
  error?: unknown
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
    filters: handlerFilterLevels(prototype, methodName, globals.filters),
  }
}

/**
 * Binds the interceptors and filters every handler of `controllers` uses, and the global ones, as
 * singletons, so one that cannot be shared, or a filter without `@Catch`, fails at startup.
 */
export function prepareHandlerStages(container: Container, controllers: readonly (new (...args: any[]) => unknown)[]): void {
  const globals = globalStagesOf(container)
  for (const entry of globals.interceptors) prepareInterceptor(container, entry)
  for (const entry of globals.filters) prepareFilter(container, entry)

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
      for (const entry of handlerFilterLevels(prototype, method, []).flat()) prepareFilter(container, entry)
    }
  }
}

/** How a pipeline run ends an error: the fallback to answer one no filter handles, if any. */
export interface RunOptions {
  /** Answers an error no filter handled. Without it, such an error rejects the call. */
  fallback?: Fallback
}

const logger = new Logger('ExceptionFilter')

/**
 * Hands a failed call's error to the first matching filter, level by level, then to the fallback. A
 * filter that throws is logged and the fallback answers the original error; without a fallback, the
 * unhandled error, or the filter's own, rejects.
 */
async function handleError(
  levels: readonly (readonly FilterEntry[])[],
  container: Container,
  context: FilterContext,
  error: unknown,
  { fallback }: RunOptions,
): Promise<void> {
  const filter = matchFilter(levels, error)
  if (filter) {
    try {
      await callFilter(filter, container, context, error)
      return
    } catch (filterError) {
      if (!fallback) throw filterError
      const name = (typeof filter === 'object' ? filter.provide : filter).name
      logger.error(`Filter ${name} threw while handling an error:`, filterError)
    }
  }
  if (!fallback) throw error
  await fallback(error, context)
}

/**
 * Runs one handler through the pipeline, inside its filters: the global guards, then the handler's
 * own; then the interceptors, global first, around the handler, which is called with the dispatch
 * marks set. Dispatch and `TestingModule.invoke` both call this, so a test runs what production runs.
 */
export async function runHandler(
  container: Container,
  instance: Record<string, (...args: unknown[]) => unknown>,
  methodName: string,
  args: unknown[],
  options: RunOptions = {},
): Promise<HandlerOutcome> {
  const controller = instance.constructor as new (...args: any[]) => unknown
  const { guards, interceptors, filters } = handlerStages(
    Object.getPrototypeOf(instance),
    methodName,
    globalStagesOf(container),
  )
  const context = new HandlerExecutionContext({ controller, methodName, args })

  let ran = false
  try {
    if (!(await runGuards(guards, { container, controller, methodName, args }))) return { ran: false }

    const handler = async () => {
      ran = true
      return callGuardedHandler(instance, methodName, args)
    }
    // Autocomplete answers within three seconds and has no reply to shape, so it skips interceptors.
    if (context.getType() === 'autocomplete' || interceptors.length === 0) await handler()
    else await runInterceptors(interceptors, container, context, handler)
    return { ran }
  } catch (error) {
    await handleError(filters, container, context, error, options)
    return { ran, error }
  }
}

/**
 * Handles an error raised for a call no handler was reached for: an interaction no route matched, or
 * one that failed before routing. Only global filters apply, then the fallback.
 */
export async function handleUnroutedError(
  container: Container,
  args: readonly unknown[],
  error: unknown,
  options: RunOptions = {},
): Promise<void> {
  const context = new UnroutedExecutionContext(args)
  await handleError([[...globalStagesOf(container).filters]], container, context, error, options)
}
