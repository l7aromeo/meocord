/**
 * Centralised metadata keys used across the framework's `Reflect` calls.
 *
 * Keeping them here prevents typos, documents the Inversify 8 key rename,
 * and makes key changes a single-file edit.
 */
export const enum MetadataKey {
  /**
   * Set by Inversify 8's `injectable()` decorator.
   */
  Injectable = '@inversifyjs/core/classIsInjectableFlagReflectKey',

  /**
   * Stores the Inversify `Container` instance on a controller class.
   * Set by `MeoCordFactory.create()`, read by `@UseGuard` at runtime.
   */
  Container = 'inversify:container',

  /**
   * Stores the `@MeoCord()` options object on the app class.
   * Read by `MeoCordFactory.create()` to wire up the container.
   */
  AppOptions = 'meocord:app-options',

  /**
   * TypeScript compiler-emitted metadata listing constructor parameter types.
   * Requires `"emitDecoratorMetadata": true` in tsconfig.
   */
  ParamTypes = 'design:paramtypes',

  /**
   * The guards `@UseGuard` runs before a method, stored on the method: class-level guards first,
   * then method-level ones, in the order they run.
   */
  Guards = 'guards',

  /**
   * Stores the `CommandType` on a `@CommandBuilder` class.
   */
  CommandType = 'commandType',
}
