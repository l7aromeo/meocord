import { MetadataKey } from '@src/enum/index.js'

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

/** The keys MeoCord and inversify keep their own metadata under, which a user's value would replace. */
const RESERVED_KEYS: ReadonlySet<string> = new Set([
  MetadataKey.Injectable,
  MetadataKey.Container,
  MetadataKey.AppOptions,
  MetadataKey.ParamTypes,
  MetadataKey.Guards,
  MetadataKey.CommandType,
])

/**
 * Attaches a value to a class or method under a key of your choosing. A guard, interceptor or filter
 * reads it with `ExecutionContext.get(key)`, the method's value first, then the controller's.
 *
 * Prefer {@link createMetadata}, whose decorator is typed and whose key cannot collide with another.
 *
 * @param metadataKey - The key to store the value under. MeoCord's own keys, such as `'guards'` and
 *   `'commandType'`, are refused: a value there would replace what the framework stores, such as the
 *   guards a handler runs.
 * @param metadataValue - The value to store.
 * @returns A decorator for a class or a method.
 * @throws When `metadataKey` is one MeoCord reserves.
 *
 * @example
 * ```typescript
 * export const Roles = (...roles: string[]) => SetMetadata('roles', roles)
 *
 * @Command('admin', CommandType.SLASH)
 * @Roles('admin', 'moderator')
 * async adminCommand(interaction: ChatInputCommandInteraction) {}
 *
 * // In a guard that injects ExecutionContext:
 * const roles = this.context.get<string[]>('roles') ?? []
 * ```
 */
export function SetMetadata<V = any>(metadataKey: string, metadataValue: V): ClassDecorator & MethodDecorator {
  if (RESERVED_KEYS.has(metadataKey)) {
    throw new Error(
      `SetMetadata cannot use the key "${metadataKey}": MeoCord stores its own metadata under it, and a value ` +
        `there would replace it. Choose another key, or declare the decorator with createMetadata, whose key is unique.`,
    )
  }
  return function (target: any, propertyKey?: string | symbol): void {
    if (propertyKey !== undefined) {
      Reflect.defineMetadata(metadataKey, metadataValue, target, propertyKey)
    } else {
      Reflect.defineMetadata(metadataKey, metadataValue, target)
    }
  } as any
}
