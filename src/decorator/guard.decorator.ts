import 'reflect-metadata'
import { type Container } from 'inversify'
import { type GuardInterface } from '@src/interface/index.js'
import {
  getAutocompleteHandlers,
  getCommandMap,
  getMessageHandlers,
  getReactionHandlers,
} from '@src/decorator/controller.decorator.js'
import { MetadataKey } from '@src/enum/index.js'
import {
  consumeDispatchMark,
  declaringPrototype,
  GUARD_CLASS,
  GUARD_WRAPPERS,
  INHERITED_FROM,
  type GuardEntry,
  type GuardWithParams,
  runGuards,
} from '@src/core/guard-runner.js'
import { makeInjectable } from '@src/util/injectable.util.js'
import { getEventHandlers } from '@src/decorator/event.decorator.js'
import { defineStageTypes } from '@src/core/stage-scope.js'
import { type ExecutionContextType } from '@src/common/execution-context.js'

/** The guards a class-level `@UseGuard` applies to one method, in the order they run. */
const CLASS_GUARDS = Symbol('class_guards')

/** The guards method-level `@UseGuard` applies to one method, in the order they run. */
const METHOD_GUARDS = Symbol('method_guards')

/**
 * Adds guards to a method's class or method list, then republishes the effective list under
 * `MetadataKey.Guards`. The latest decorator wraps outermost, so its guards run first.
 */
function recordGuards(key: symbol, guards: GuardEntry[], prototype: object, methodName: string): void {
  const existing: GuardEntry[] = Reflect.getOwnMetadata(key, prototype, methodName) ?? []
  Reflect.defineMetadata(key, [...guards, ...existing], prototype, methodName)

  const classGuards: GuardEntry[] = Reflect.getOwnMetadata(CLASS_GUARDS, prototype, methodName) ?? []
  const methodGuards: GuardEntry[] = Reflect.getOwnMetadata(METHOD_GUARDS, prototype, methodName) ?? []
  Reflect.defineMetadata(MetadataKey.Guards, [...classGuards, ...methodGuards], prototype, methodName)
}

/**
 * Wraps a method so a direct call runs `guards` first. A call from dispatch, which has already run
 * the method's guards, passes through.
 */
function applyGuards(descriptor: PropertyDescriptor, guards: GuardEntry[], prototype: object, propertyKey: string) {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args: unknown[]) {
    if (!consumeDispatchMark(args[0], this, propertyKey)) {
      const container: Container = Reflect.getMetadata(MetadataKey.Container, this.constructor)
      const controller = this.constructor as new (...args: any[]) => unknown
      const allowed = await runGuards(guards, { container, controller, methodName: propertyKey, args })
      if (!allowed) return
    }

    return originalMethod.apply(this, args)
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

  for (const key of [CLASS_GUARDS, METHOD_GUARDS, GUARD_WRAPPERS]) {
    const value: unknown = Reflect.getOwnMetadata(key, owner, methodName)
    if (value !== undefined) Reflect.defineMetadata(key, Array.isArray(value) ? [...value] : value, prototype, methodName)
  }
  Reflect.defineMetadata(INHERITED_FROM, owner, prototype, methodName)
  return { ...inherited }
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
 * @param guards - Guard classes, or `{ provide, params }` to set `params` as properties on the guard
 *   instance before it runs.
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
export function UseGuard(...guards: ((new (...args: any[]) => GuardInterface) | GuardWithParams)[]): any {
  return function (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) {
    if (descriptor && propertyKey) {
      // Method Decorator
      applyGuards(descriptor, guards, target, String(propertyKey))
      recordGuards(METHOD_GUARDS, guards, target, String(propertyKey))
    } else if (typeof target === 'function' && !propertyKey && !descriptor) {
      // Class Decorator
      const prototype = target.prototype

      const methods = new Set<string>()

      const commandMap = getCommandMap(prototype) || {}
      Object.values(commandMap)
        .flat()
        .forEach(cmd => methods.add(cmd.methodName))

      const messageHandlers = getMessageHandlers(prototype) || []
      messageHandlers.forEach(handler => methods.add(handler.method))

      const reactionHandlers = getReactionHandlers(prototype) || []
      reactionHandlers.forEach(handler => methods.add(handler.method))

      getAutocompleteHandlers(prototype).forEach(handler => methods.add(handler.methodName))

      getEventHandlers(prototype).forEach(handler => methods.add(handler.method))

      for (const methodName of methods) {
        const methodDescriptor = ownHandlerDescriptor(prototype, methodName)
        if (methodDescriptor) {
          applyGuards(methodDescriptor, guards, prototype, methodName)
          Object.defineProperty(prototype, methodName, methodDescriptor)
          recordGuards(CLASS_GUARDS, guards, prototype, methodName)
        }
      }
    }
  }
}
