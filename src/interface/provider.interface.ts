declare const tokenType: unique symbol

/** A symbol that names what it provides, made by `createToken`; `TestingModule.get` returns its type. */
export type Token<T> = symbol & { readonly [tokenType]?: T }

/** What a provider is bound under and injected by: a class, a string, a symbol, or a typed {@link Token}. */
export type ProviderToken<T = unknown> = (abstract new (...args: any[]) => T) | string | symbol | Token<T>

/**
 * Provides an existing value, such as a configured client, as it is.
 *
 * @example
 * ```ts
 * { provide: 'config', useValue: { prefix: '!' } }
 * ```
 */
export interface ValueProvider<T = any> {
  provide: ProviderToken<T>
  useValue: T
}

/**
 * Provides an instance of a class, made once and shared, with its own constructor dependencies injected.
 *
 * @example
 * ```ts
 * { provide: Storage, useClass: RedisStorage }
 * ```
 */
export interface ClassProvider<T = any> {
  provide: ProviderToken<T>
  useClass: new (...args: any[]) => T
}

/**
 * Provides what a function returns, called once with the values of `inject`, in order. It may return a
 * promise: the bot resolves every factory before it logs in and before any `onReady` hook.
 *
 * @example
 * ```ts
 * { provide: DATABASE, useFactory: async (config: Config) => connect(config.url), inject: [Config] }
 * ```
 */
export interface FactoryProvider<T = any> {
  provide: ProviderToken<T>
  useFactory: (...args: any[]) => T | Promise<T>
  inject?: ProviderToken[]
}

/** A value `@MeoCord({ providers })` or a testing module binds under a token, for classes to `@Inject`. */
export type Provider<T = any> = ValueProvider<T> | ClassProvider<T> | FactoryProvider<T>
