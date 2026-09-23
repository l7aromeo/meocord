import 'reflect-metadata'
import { injectable } from 'inversify'
import { MetadataKey } from '@src/enum/index.js'

/**
 * Marks a class as a service, injectable into controllers and other services.
 *
 * @example
 * ```typescript
 * @Service()
 * export class PingService {
 *   handlePing() {
 *     return 'Pong!'
 *   }
 * }
 * ```
 */
export function Service<T>() {
  return function (target: new (...args: any[]) => T) {
    if (!Reflect.hasMetadata(MetadataKey.Injectable, target)) {
      injectable()(target)
    }
  }
}
