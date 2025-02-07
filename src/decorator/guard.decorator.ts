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
 * @Guard() decorator to mark a class as a Guard.
 * Automatically binds the guard class to the Dependency Injection (DI) container.
 * This decorator makes sure the guard is injectable and its dependencies are resolved and bound to the container.
 *
 * @example
 * @Guard()
 * class SomeGuard implements GuardInterface {
 *   // Guard implementation...
 * }
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
 * @UseGuard() decorator to apply one or more guards to methods.
 * This decorator allows methods to specify the guards that must be passed
 * before the method is executed, ensuring that all guards pass the validation check.
 * Supports guards that are parameterized (accepting additional parameters).
 *
 * @param guards - One or more guard classes to apply. These can be regular guards or guards with additional parameters.
 * @returns A method decorator function that applies the guards to the method.
 *
 * @example
 * @UseGuard(SomeGuard)
 * async someMethod(interaction: any) {
 *   // Method implementation...
 * }
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
