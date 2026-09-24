import 'reflect-metadata'

/**
 * A typed metadata decorator made by {@link createMetadata}: call it with a value to decorate a
 * controller class or a handler method, and pass it to `ExecutionContext.get` to read that value back.
 */
export interface MetadataDecorator<T> {
  /** Attaches `value` to the decorated class or method. */
  (value: T): ClassDecorator & MethodDecorator

  /** The unique key the value is stored under. */
  readonly key: symbol
}

/**
 * Creates a typed metadata decorator with a unique key, for handler metadata that guards and other
 * stages read through `ExecutionContext`.
 *
 * On a class, the value applies to every handler of the controller; on a method, it applies to that
 * handler and takes precedence over the class value.
 *
 * @param description - A name for the key, shown when the key is logged.
 * @returns A decorator that takes the value to attach.
 *
 * @example
 * ```typescript
 * export const Roles = createMetadata<string[]>('roles')
 *
 * @Controller()
 * @Roles(['moderator'])
 * export class ModerationController {
 *   @Command('ban', CommandType.SLASH)
 *   @Roles(['admin'])
 *   @UseGuard(RolesGuard)
 *   async ban(interaction: ChatInputCommandInteraction) {}
 * }
 *
 * // In RolesGuard, with ExecutionContext injected:
 * const roles = this.context.get(Roles) ?? []
 * ```
 */
export function createMetadata<T>(description?: string): MetadataDecorator<T> {
  const key = Symbol(description)

  const decorator = (value: T): ClassDecorator & MethodDecorator =>
    function (target: object, propertyKey?: string | symbol): void {
      if (propertyKey !== undefined) {
        Reflect.defineMetadata(key, value, target, propertyKey)
      } else {
        Reflect.defineMetadata(key, value, target)
      }
    } as ClassDecorator & MethodDecorator

  return Object.assign(decorator, { key }) as MetadataDecorator<T>
}
