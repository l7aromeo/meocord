/*
 * MeoCord Framework
 * Copyright (C) 2025 Ukasyah Rahmatullah Zada
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import 'reflect-metadata'
import { injectable } from 'inversify'
import { mainContainer } from '@src/decorator'
import { BaseInteraction, Interaction } from 'discord.js'
import { GuardInterface } from '@src/interface'

/**
 * `@Guard()` decorator to mark a class as a Guard that later can be added on `@UseGuard` decorator.
 *
 * @example
 * ```typescript
 * @Guard()
 * export class ButtonInteractionGuard implements GuardInterface {
 *   private readonly logger = new Logger(ButtonInteractionGuard.name)
 *
 *   async canActivate(interaction: ButtonInteraction, { ownerId }: { ownerId: string }): Promise<boolean> {
 *     if (interaction.user.id !== ownerId) {
 *       this.logger.error(
 *         `User with id ${interaction.user.id} is not allowed to use this command that initiated by user with id ${ownerId}.`,
 *       )
 *       const embed = generateErrorEmbed(
 *         `Hi <@${interaction.user.id}>, this command can only be used by the person who initiated it: <@${ownerId}>.`,
 *       )
 *       await interaction.reply({
 *         embeds: [embed],
 *         flags: MessageFlagsBitField.Flags.Ephemeral,
 *       })
 *       return false
 *     }
 *     return true
 *   }
 * }
 * ```
 */
export function Guard() {
  return function (target: any) {
    // Check if the class is already injectable; if not, make it injectable dynamically
    if (!Reflect.hasMetadata('inversify:injectable', target)) {
      injectable()(target)
    }

    mainContainer.bind(target).toSelf().inTransientScope()

    // Bind any dependencies that the guard requires
    const injectables = Reflect.getMetadata('design:paramtypes', target) || []
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
 * whether the method should be allowed to execute based on the provided interaction and arguments.
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
 * @Command('profile-{id}', CommandType.BUTTON)
 * @UseGuard(
 *   { provide: RateLimiterGuard, params: { limit: 2, window: 3000 } },
 *   ButtonInteractionGuard
 * )
 * async showProfileById(interaction: ButtonInteraction, { id }: { id: string }) {
 *   await interaction.reply(`Profile ID: ${id}`)
 * }
 * ```
 */
export function UseGuard(...guards: ((new (...args: any[]) => GuardInterface) | GuardWithParams)[]): MethodDecorator {
  return function (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value

    // TypeScript: Enforce that the first argument is an Interaction
    descriptor.value = async function (...args: [Interaction, ...any[]]) {
      // Ensure the first argument is an instance of Interaction
      if (!(args[0] instanceof BaseInteraction)) {
        throw new Error(`The first argument of ${String(propertyKey)} must be an instance of Interaction.`)
      }

      // Iterate over each guard and check if it allows the method to proceed
      for (const guard of guards) {
        let guardInstance: GuardInterface

        if (isGuardWithParams(guard)) {
          const { provide, params } = guard
          guardInstance = mainContainer.resolve(provide)
          // Inject the parameters into the guard instance
          Object.assign(guardInstance, params)
        } else {
          // Resolve guard without parameters
          guardInstance = mainContainer.resolve(guard)
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

    // Store guard metadata for later access (if needed)
    Reflect.defineMetadata('guards', guards, target, propertyKey)
  }
}
