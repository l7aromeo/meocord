import 'reflect-metadata'
import { injectable, type Container } from 'inversify'
import { BaseInteraction, Message, MessageReaction, type Interaction } from 'discord.js'
import { type GuardInterface } from '@src/interface/index.js'
import { getCommandMap, getMessageHandlers, getReactionHandlers } from '@src/decorator/controller.decorator.js'
import { MetadataKey } from '@src/enum/index.js'

/** The guards a class-level `@UseGuard` applies to one method, in the order they run. */
const CLASS_GUARDS = Symbol('class_guards')

/** The guards method-level `@UseGuard` applies to one method, in the order they run. */
const METHOD_GUARDS = Symbol('method_guards')

type GuardEntry = (new (...args: any[]) => GuardInterface) | GuardWithParams

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

function applyGuards(
  descriptor: PropertyDescriptor,
  guards: ((new (...args: any[]) => GuardInterface) | GuardWithParams)[],
  propertyKey: string,
) {
  const originalMethod = descriptor.value

  descriptor.value = async function (...args: [Interaction | Message | MessageReaction, ...any[]]) {
    const [context] = args

    if (!isValidContext(context)) {
      throw new Error(
        `The first argument of ${String(propertyKey)} must be an instance of Interaction, Message, or MessageReaction.`,
      )
    }

    const container: Container = Reflect.getMetadata(MetadataKey.Container, this.constructor)

    for (const guard of guards) {
      let guardInstance: GuardInterface

      if (isGuardWithParams(guard)) {
        const { provide, params } = guard
        guardInstance = container.get(provide, { autobind: true })
        Object.assign(guardInstance, params)
      } else {
        guardInstance = container.get(guard, { autobind: true })
      }

      if (!guardInstance.canActivate) {
        throw new Error(
          `Guard ${guard.constructor.name} applied to ${String(propertyKey)} does not have a valid canActivate method.`,
        )
      }

      const canActivate = await guardInstance.canActivate(...args)
      if (!canActivate) {
        return
      }
    }

    return originalMethod.apply(this, args)
  }
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
    if (!Reflect.hasMetadata(MetadataKey.Injectable, target)) {
      injectable()(target)
    }
  }
}

/** A guard class, and the properties set on its instance before `canActivate` runs. */
interface GuardWithParams {
  /** The guard class to resolve. */
  provide: new (...args: any[]) => GuardInterface

  /** Properties assigned to the guard instance. */
  params: Record<string, any>
}

/** Whether a `@UseGuard` entry is a guard with params rather than a guard class. */
function isGuardWithParams(guard: any): guard is GuardWithParams {
  return typeof guard === 'object' && 'provide' in guard && 'params' in guard
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
      applyGuards(descriptor, guards as any, String(propertyKey))
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
          applyGuards(methodDescriptor, guards as any, methodName)
          Object.defineProperty(prototype, methodName, methodDescriptor)
          recordGuards(CLASS_GUARDS, guards, prototype, methodName)
        }
      }
    }
  }
}
