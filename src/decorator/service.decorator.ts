/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { injectable } from 'inversify'
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
    if (!Reflect.hasMetadata(MetadataKey.Injectable, target)) {
      injectable()(target)
    }
  }
}
