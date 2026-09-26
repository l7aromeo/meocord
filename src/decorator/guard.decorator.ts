import 'reflect-metadata'
import { type GuardInterface } from '@src/interface/index.js'
import { MetadataKey } from '@src/enum/index.js'
import {
  CLASS_LEVEL_GUARDS,
  classChain,
  classLevelGuards,
  consumeDispatchMark,
  declaringPrototype,
  GUARD_CLASS,
  GUARD_WRAPPERS,
  handlerMethods,
  INHERITED_FROM,
  METHOD_GUARDS,
  type GuardEntry,
  runDirectCall,
} from '@src/core/guard-runner.js'
import { makeInjectable } from '@src/util/injectable.util.js'
import { type CheckedEntry } from '@src/decorator/stage-entry.js'
import { assertStageEntries, defineStageTypes } from '@src/core/stage-scope.js'
import { type ExecutionContextType } from '@src/common/execution-context.js'

/** The guards a class-level `@UseGuard` applies to one method, in the order they run. */
const CLASS_GUARDS = Symbol('class_guards')

/** The guards of the classes a class extends that `@Controller` applies to one of its own handlers. */
const INHERITED_GUARDS = Symbol('inherited_guards')

/**
 * Adds guards to a method's class or method list, then republishes the effective list under
 * `MetadataKey.Guards`. The latest decorator wraps outermost, so its guards run first.
 */
function recordGuards(key: symbol, guards: GuardEntry[], prototype: object, methodName: string): void {
  const existing: GuardEntry[] = Reflect.getOwnMetadata(key, prototype, methodName) ?? []
  Reflect.defineMetadata(key, [...guards, ...existing], prototype, methodName)

  const [classGuards, inheritedGuards, methodGuards] = [CLASS_GUARDS, INHERITED_GUARDS, METHOD_GUARDS].map(
    list => (Reflect.getOwnMetadata(list, prototype, methodName) as GuardEntry[] | undefined) ?? [],
  )
  Reflect.defineMetadata(MetadataKey.Guards, [...classGuards, ...inheritedGuards, ...methodGuards], prototype, methodName)
}

/**
 * Wraps a method so a direct call runs its guards first: the wrapper entered first runs the whole
 * chain dispatch resolves for the handler, and lets the ones inside it through. A call from dispatch,
 * which has already run the guards, passes through every wrapper.
 */
function applyGuards(descriptor: PropertyDescriptor, prototype: object, propertyKey: string) {
  const originalMethod = descriptor.value

  descriptor.value = async function (this: object, ...args: unknown[]) {
    if (consumeDispatchMark(args[0], this, propertyKey)) return originalMethod.apply(this, args)
    return runDirectCall(this, propertyKey, args, () => originalMethod.apply(this, args))
  }

  const wrappers: number = Reflect.getOwnMetadata(GUARD_WRAPPERS, prototype, propertyKey) ?? 0
  Reflect.defineMetadata(GUARD_WRAPPERS, wrappers + 1, prototype, propertyKey)
}

/**
 * The class's own descriptor for a handler. An inherited handler gets one that calls the inherited
 * method, starting from its guard lists and wrapper count, so class guards wrap it like an own method.
 */
function ownHandlerDescriptor(prototype: object, methodName: string): PropertyDescriptor | undefined {
  const own = Object.getOwnPropertyDescriptor(prototype, methodName)
  if (own) return own

  const owner = declaringPrototype(prototype, methodName)
  const inherited = owner && Object.getOwnPropertyDescriptor(owner, methodName)
  if (!owner || typeof inherited?.value !== 'function') return undefined

  for (const key of [CLASS_GUARDS, INHERITED_GUARDS, METHOD_GUARDS, GUARD_WRAPPERS]) {
    const value: unknown = Reflect.getOwnMetadata(key, owner, methodName)
    if (value !== undefined) Reflect.defineMetadata(key, Array.isArray(value) ? [...value] : value, prototype, methodName)
  }
  Reflect.defineMetadata(INHERITED_FROM, owner, prototype, methodName)
  return { ...inherited }
}

/**
 * Gives each handler a controller declares itself the class-level guards of the classes it extends,
 * as its inherited handlers have: recorded under `MetadataKey.Guards`, and wrapped so a direct call
 * runs them when no other guard wraps the handler. `@Controller` calls this.
 */
export function guardOwnHandlersWithBaseGuards(target: abstract new (...args: any[]) => unknown): void {
  const prototype = target.prototype as object
  for (const methodName of handlerMethods(prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, methodName)
    // Inherited handlers have the chain of the class that declares them
    if (typeof descriptor?.value !== 'function' || Reflect.getOwnMetadata(INHERITED_FROM, prototype, methodName)) continue
    const guards = classChain(prototype, prototype).slice(1).flatMap(classLevelGuards)
    if (guards.length === 0) continue
    if (!Reflect.getOwnMetadata(GUARD_WRAPPERS, prototype, methodName)) {
      applyGuards(descriptor, prototype, methodName)
      Object.defineProperty(prototype, methodName, descriptor)
    }
    recordGuards(INHERITED_GUARDS, guards, prototype, methodName)
  }
}

/**
 * Marks a class as a guard, for use with {@link UseGuard}. The class implements `GuardInterface`.
 *
 * A guard runs for every kind of handler it is applied to unless `types` limits it. A global guard
 * from `@MeoCord({ guards })` also runs before `@On` and `@Once` event handlers, so a guard that reads
 * an interaction should declare `types: ['interaction']`.
 *
 * @param options.types - The context types the guard runs for, as `ExecutionContext.getType()`
 *   reports them; for any other call it is skipped. Every type when omitted; an empty list throws.
 *   A subclass inherits the types of the class it extends unless it declares its own.
 *
 * @example
 * ```typescript
 * @Guard({ types: ['interaction'] })
 * export class OwnerOnlyGuard implements GuardInterface {
 *   canActivate(interaction: ButtonInteraction, { ownerId }: { ownerId: string }): boolean {
 *     return interaction.user.id === ownerId
 *   }
 * }
 * ```
 */
export function Guard(options: { types?: readonly ExecutionContextType[] } = {}) {
  return function (target: any) {
    makeInjectable(target)
    defineStageTypes(target, options.types, 'Guard')
    Reflect.defineMetadata(GUARD_CLASS, true, target)
  }
}

/**
 * Runs guards before a method, or before every method of a class; the method runs only when every
 * guard's `canActivate` returns true.
 *
 * @param entries - Guard classes, or `{ provide, params? }` to set `params` as properties on the guard
 *   instance, and as `this.params`, before it runs. A guard that declares `declare readonly params?: P`
 *   has `params` checked against `P`; one that declares none takes any. Any other entry is refused when
 *   the decorator applies.
 *
 * @example
 * ```typescript
 * @Command('profile/{id}', CommandType.BUTTON)
 * @UseGuard({ provide: RateLimitGuard, params: { limit: 2, window: 3000 } }, OwnerOnlyGuard)
 * async showProfile(interaction: ButtonInteraction, { id }: { id: string }) {
 *   await interaction.reply(`Profile ${id}`)
 * }
 * ```
 */
export function UseGuard<const T extends readonly unknown[]>(
  ...entries: { [K in keyof T]: CheckedEntry<T[K], new (...args: any[]) => GuardInterface> }
): any {
  const guards = entries as unknown as GuardEntry[]
  return function (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) {
    const where = propertyKey === undefined ? String(target?.name) : `${target.constructor.name}.${String(propertyKey)}`
    assertStageEntries('@UseGuard', 'guard', where, guards)
    if (descriptor && propertyKey) {
      // Method Decorator
      applyGuards(descriptor, target, String(propertyKey))
      recordGuards(METHOD_GUARDS, guards, target, String(propertyKey))
    } else if (typeof target === 'function' && !propertyKey && !descriptor) {
      // Class Decorator
      const prototype = target.prototype

      const methods = handlerMethods(prototype)
      const existing = classLevelGuards(target)
      Reflect.defineMetadata(CLASS_LEVEL_GUARDS, [...guards, ...existing], target)

      for (const methodName of methods) {
        const methodDescriptor = ownHandlerDescriptor(prototype, methodName)
        if (methodDescriptor) {
          applyGuards(methodDescriptor, prototype, methodName)
          Object.defineProperty(prototype, methodName, methodDescriptor)
          recordGuards(CLASS_GUARDS, guards, prototype, methodName)
        }
      }
    }
  }
}
