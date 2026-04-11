/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

/**
 * Composes multiple class or method decorators into a single decorator.
 *
 * @example
 * ```typescript
 * export const Protected = () => applyDecorators(
 *   UseGuard(DefaultGuard, GlobalRateLimiterGuard),
 * )
 *
 * @Controller()
 * @Protected()
 * export class PingController {}
 * ```
 */
export function applyDecorators(...decorators: (ClassDecorator | MethodDecorator)[]): ClassDecorator & MethodDecorator {
  return function (target: any, propertyKey?: string | symbol, descriptor?: PropertyDescriptor): any {
    for (const decorator of decorators) {
      if (propertyKey !== undefined && descriptor !== undefined) {
        ;(decorator as MethodDecorator)(target, propertyKey, descriptor)
      } else {
        ;(decorator as ClassDecorator)(target)
      }
    }
    return descriptor
  } as any
}

/**
 * Attaches arbitrary metadata to a class or method. Use alongside `Reflect.getMetadata` to read it back.
 *
 * @example
 * ```typescript
 * export const Roles = (...roles: string[]) => SetMetadata('roles', roles)
 *
 * @Command('admin', CommandType.SLASH)
 * @Roles('admin', 'moderator')
 * async adminCommand(interaction: ChatInputCommandInteraction) {}
 * ```
 */
export function SetMetadata<V = any>(metadataKey: string, metadataValue: V): ClassDecorator & MethodDecorator {
  return function (target: any, propertyKey?: string | symbol): void {
    if (propertyKey !== undefined) {
      Reflect.defineMetadata(metadataKey, metadataValue, target, propertyKey)
    } else {
      Reflect.defineMetadata(metadataKey, metadataValue, target)
    }
  } as any
}
