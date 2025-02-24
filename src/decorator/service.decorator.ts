/**
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
import { mainContainer } from '@src/decorator/index.js'
import { injectable } from 'inversify'
import { Client } from 'discord.js'

/**
 * `@Service()` decorator to mark a class as a service that can be injected into controllers or used as standalone services.
 *
 * @example
 * ```typescript
 * @Service()
 * class MyService {
 *   constructor(private anotherService: AnotherService) {}
 *
 *   doSomething() {
 *     this.anotherService.alsoDoSomething()
 *     console.log('Hello, World!')
 *   }
 * }
 * ```
 * @returns A decorator function to apply to the class.
 */
export function Service<T>() {
  return function (target: new (...args: any[]) => T) {
    // Check if the class is already injectable; if not, make it injectable dynamically
    if (!Reflect.hasMetadata('inversify:injectable', target)) {
      injectable()(target)
    }

    // Check if the class is already injectable; if not, make it injectable dynamically
    if (!mainContainer.isBound(target)) {
      // Bind the target class to the container in a singleton scope
      mainContainer.bind(target).toSelf().inSingletonScope()
    }
    // Recursively bind dependencies
    bindDependencies(target)
  }
}

function bindDependencies(target: any) {
  // Get the constructor parameter types using Reflect metadata
  const dependencies = Reflect.getMetadata('design:paramtypes', target) || []

  dependencies.forEach((dep: any) => {
    // Bind the dependency if not already bound
    if (!mainContainer.isBound(dep)) {
      if (dep.name === Client.name) return
      try {
        // Check if the class is already injectable; if not, make it injectable dynamically
        if (!Reflect.hasMetadata('inversify:injectable', dep)) {
          injectable()(dep)
        }
        mainContainer.bind(dep).toSelf().inSingletonScope()
        bindDependencies(dep) // Recur for the dependencies of the current dependency
      } catch (error) {
        console.warn(`Could not bind dependency: ${dep?.name || dep}`, error)
      }
    }
  })
}
