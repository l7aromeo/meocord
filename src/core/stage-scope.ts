import 'reflect-metadata'
import { type ExecutionContextType } from '@src/common/execution-context.js'

/** The context types a guard or interceptor class declared it runs for, with `@Guard({ types })`. */
const STAGE_TYPES = Symbol('stage_types')

/** A stage entry as the pipeline lists it: a class, or `{ provide, params }`. */
type StageEntry = (new (...args: any[]) => unknown) | { provide: new (...args: any[]) => unknown }

/**
 * Records the context types a stage class runs for; without them it runs for every type. A list that
 * can match no call is refused: an empty one, or autocomplete alone for an interceptor.
 */
export function defineStageTypes(
  cls: { name: string },
  types: readonly ExecutionContextType[] | undefined,
  decorator: 'Guard' | 'Interceptor',
): void {
  if (!types) return
  if (types.length === 0) {
    throw new Error(
      `@${decorator}({ types: [] }) on ${cls.name} lists no types, so it would never run. List the types it ` +
        `runs for, or leave types out to run for every type.`,
    )
  }
  // Interceptors never run for autocomplete, which must answer within three seconds
  if (decorator === 'Interceptor' && types.every(type => type === 'autocomplete')) {
    throw new Error(
      `@Interceptor({ types: ['autocomplete'] }) on ${cls.name} can never run: interceptors skip autocomplete ` +
        `handlers. List the types it should run for instead.`,
    )
  }
  Reflect.defineMetadata(STAGE_TYPES, [...types], cls)
}

/** The class of a stage entry. */
export function stageClass(entry: StageEntry): new (...args: any[]) => unknown {
  return typeof entry === 'function' ? entry : entry.provide
}

/** The context types a stage declared, or `undefined` when it runs for every type. */
export function stageTypes(entry: StageEntry): readonly ExecutionContextType[] | undefined {
  return Reflect.getMetadata(STAGE_TYPES, stageClass(entry)) as ExecutionContextType[] | undefined
}

/** Whether a stage runs for a call of `type`. */
export function appliesTo(entry: StageEntry, type: ExecutionContextType): boolean {
  return stageTypes(entry)?.includes(type) ?? true
}
