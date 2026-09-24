import 'reflect-metadata'
import { makeInjectable } from '@src/util/injectable.util.js'
import { type Container } from 'inversify'
import { BaseInteraction, Message, MessageReaction, type Interaction } from 'discord.js'
import { type GuardInterface } from '@src/interface/index.js'
import { getCommandMap, getMessageHandlers, getReactionHandlers } from '@src/decorator/controller.decorator.js'
import { MetadataKey } from '@src/enum/index.js'
import {
  consumeDispatchMark,
  GUARD_WRAPPERS,
  type GuardEntry,
  type GuardWithParams,
  runGuards,
} from '@src/core/guard-runner.js'

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

function isValidContext(context: unknown): context is BaseInteraction | Message | MessageReaction {
  return context instanceof BaseInteraction || context instanceof Message || context instanceof MessageReaction
}

/**
 * Wraps a method so a direct call runs `guards` first. A call from dispatch, which has already run
 * the method's guards, passes through.
 */
function applyGuards(descriptor: PropertyDescriptor, guards: GuardEntry[], prototype: object, propertyKey: string) {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args: [Interaction | Message | MessageReaction, ...any[]]) {
    const [context] = args

    if (!isValidContext(context)) {
      throw new Error(
        `The first argument of ${String(propertyKey)} must be an instance of Interaction, Message, or MessageReaction.`,
      )
    }

    if (!consumeDispatchMark(context, propertyKey)) {
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
 * Marks a class as a guard, for use with {@link UseGuard}. The class implements `GuardInterface`.
 *
 * @example
 * ```typescript
 * @Guard()
 * export class OwnerOnlyGuard implements GuardInterface {
 *   canActivate(interaction: ButtonInteraction, { ownerId }: { ownerId: string }): boolean {
 *     return interaction.user.id === ownerId
 *   }
 * }
 * ```
 */
export function Guard() {
  return function (target: any) {
    makeInjectable(target)
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

      for (const methodName of methods) {
        const methodDescriptor = Object.getOwnPropertyDescriptor(prototype, methodName)
        if (methodDescriptor) {
          applyGuards(methodDescriptor, guards, prototype, methodName)
          Object.defineProperty(prototype, methodName, methodDescriptor)
          recordGuards(CLASS_GUARDS, guards, prototype, methodName)
        }
      }
    }
  }
}
