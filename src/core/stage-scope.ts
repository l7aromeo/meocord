import 'reflect-metadata'
import { type ExecutionContextType } from '@src/common/execution-context.js'

/** The context types a guard or interceptor class declared it runs for, with `@Guard({ types })`. */
const STAGE_TYPES = Symbol('stage_types')

/** A stage entry as the pipeline lists it: a class, or `{ provide, params }`. */
type StageEntry = (new (...args: any[]) => unknown) | { provide: new (...args: any[]) => unknown }

/**
 * Records the context types a stage class runs for; without them it runs for every type. An empty list
 * is refused: the stage would never run, and a guard that never runs protects nothing.
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
