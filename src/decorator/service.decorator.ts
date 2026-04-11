/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { mainContainer } from '@src/decorator/container.js'
import { injectable } from 'inversify'
import { Client } from 'discord.js'
import { MetadataKey } from '@src/enum/index.js'

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
    if (!Reflect.hasMetadata(MetadataKey.Injectable, target)) {
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
  const dependencies = Reflect.getMetadata(MetadataKey.ParamTypes, target) || []

  dependencies.forEach((dep: any) => {
    // Bind the dependency if not already bound
    if (!mainContainer.isBound(dep)) {
      if (dep.name === Client.name) return
      try {
        // Check if the class is already injectable; if not, make it injectable dynamically
        if (!Reflect.hasMetadata(MetadataKey.Injectable, dep)) {
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
