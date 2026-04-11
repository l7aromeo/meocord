/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { injectable } from 'inversify'
import { mainContainer } from '@src/decorator/container.js'
import { BaseInteraction, Message, MessageReaction, type Interaction } from 'discord.js'
import { type GuardInterface } from '@src/interface/index.js'
import { getCommandMap, getMessageHandlers, getReactionHandlers } from '@src/decorator/controller.decorator.js'
import { MetadataKey } from '@src/enum/index.js'

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

    // Iterate over each guard and check if it allows the method to proceed
    for (const guard of guards) {
      let guardInstance: GuardInterface

      if (isGuardWithParams(guard)) {
        const { provide, params } = guard
        guardInstance = mainContainer.get(provide, { autobind: true })
        // Inject the parameters into the guard instance
        Object.assign(guardInstance, params)
      } else {
        // Resolve guard without parameters
        guardInstance = mainContainer.get(guard, { autobind: true })
      }

      // Ensure the guard has the necessary method `canActivate`
      if (!guardInstance.canActivate) {
        throw new Error(
          `Guard ${guard.constructor.name} applied to ${String(propertyKey)} does not have a valid canActivate method.`,
        )
      }

      // Check if the guard allows the method to proceed
      const canActivate = await guardInstance.canActivate(...args)
      if (!canActivate) {
        return // Prevent method execution if the guard fails
      }
    }

    // Call the original method if all guards pass
    return originalMethod.apply(this, args)
  }
}

/**
 * `@Guard()` decorator to mark a class as a Guard that later can be added on `@UseGuard` decorator.
 *
 * @example
 * ```typescript
 * @Guard()
export class ButtonInteractionGuard implements GuardInterface {
  private readonly logger = new Logger(ButtonInteractionGuard.name)

  async canActivate(context: ButtonInteraction, { ownerId }: { ownerId: string }): Promise<boolean> {
    if (context.user.id !== ownerId) {
      this.logger.error(
        `User with id ${context.user.id} is not allowed to use this command that initiated by user with id ${ownerId}.`,
      )
      const embed = generateErrorEmbed(
        `Hi <@${context.user.id}>, this command can only be used by the person who initiated it: <@${ownerId}>.`,
      )
      await context.reply({
        embeds: [embed],
        flags: MessageFlagsBitField.Flags.Ephemeral,
      })
      return false
    }
    return true
  }
}
 * ```
 */
export function Guard() {
  return function (target: any) {
    // Check if the class is already injectable; if not, make it injectable dynamically
    if (!Reflect.hasMetadata(MetadataKey.Injectable, target)) {
      injectable()(target)
    }

    mainContainer.bind(target).toSelf().inTransientScope()

    // Bind any dependencies that the guard requires
    const injectables = Reflect.getMetadata(MetadataKey.ParamTypes, target) || []
    injectables.forEach((dep: any) => {
      if (!mainContainer.isBound(dep)) {
        mainContainer.bind(dep).toSelf().inSingletonScope()
      }
    })
  }
}

/**
 * Type for a guard with parameters.
 * This type defines a guard that requires additional parameters (other than the default constructor).
 */
interface GuardWithParams {
  /**
   * The guard class that needs to be instantiated.
   */
  provide: new (...args: any[]) => GuardInterface

  /**
   * Parameters to be passed to the guard during instantiation.
   */
  params: Record<string, any>
}

/**
 * Type guard to check if the object is a GuardWithParams.
 * This function helps to check whether a guard is parameterized or not.
 *
 * @param guard - The guard to check.
 * @returns `true` if the guard has parameters, otherwise `false`.
 */
function isGuardWithParams(guard: any): guard is GuardWithParams {
  return typeof guard === 'object' && 'provide' in guard && 'params' in guard
}

/**
 * `@UseGuard()` decorator to apply one or more guards to methods.
 * Guards are used to handle permission checks before executing a method.
 * Each guard must use `@Guard` decorator and implement the `canActivate` method, which determines
 * whether the method should be allowed to execute based on the provided context (Interaction, Message, or Reaction) and arguments.
 * This decorator ensures that all guards pass validation before calling the original method.
 * Supports guards that are parameterized (accepting additional parameters).
 *
 * @param guards - One or more guard classes to apply. These can be regular guards or guards with additional parameters.
 *                 - If providing a guard with parameters, it should be an object with:
 *                   - `provide`: The guard class to instantiate. Must implement `GuardInterface`.
 *                   - `params`: A record of key-value pairs to be passed as additional properties to the guard instance.
 * @returns A method decorator function that applies the guards to the method.
 *
 * @example
 * ```typescript
 * // Method-level usage
 * @Command('profile-{id}', CommandType.BUTTON)
 * @UseGuard(
 *   { provide: RateLimiterGuard, params: { limit: 2, window: 3000 } },
 *   ButtonInteractionGuard
 * )
 * async showProfileById(interaction: ButtonInteraction, { id }: { id: string }) {
 *   await interaction.reply(`Profile ID: ${id}`)
 * }
 *
 * // Class-level usage
 * @Controller()
 * @UseGuard(GlobalGuard)
 * class MyController {
 *   @Command('ping', CommandType.SLASH)
 *   async ping(interaction: ChatInputCommandInteraction) {
 *     await interaction.reply('Pong!')
 *   }
 * }
 * ```
 */
export function UseGuard(...guards: ((new (...args: any[]) => GuardInterface) | GuardWithParams)[]): any {
  return function (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor) {
    if (descriptor && propertyKey) {
      // Method Decorator
      applyGuards(descriptor, guards as any, String(propertyKey))
      // Store guard metadata for later access (if needed)
      Reflect.defineMetadata(MetadataKey.Guards, guards, target, propertyKey)
    } else if (typeof target === 'function' && !propertyKey && !descriptor) {
      // Class Decorator
      const prototype = target.prototype

      // 1. Get all methods to guard
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
          Reflect.defineMetadata(MetadataKey.Guards, guards, prototype, methodName)
        }
      }
    }
  }
}
