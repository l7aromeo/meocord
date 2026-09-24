import 'reflect-metadata'
import { makeInjectable } from '@src/util/injectable.util.js'

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
    makeInjectable(target)
  }
}
