import { type FactoryProvider, type ProviderToken, type Token } from '@src/interface/index.js'

/** What a token provides: a class's instances, or a `createToken` token's type; `unknown` for a string or a plain symbol. */
export type Provided<K> = K extends abstract new (...args: any[]) => infer I
  ? I
  : K extends Token<infer V>
    ? unknown extends V
      ? unknown
      : V
    : unknown

/** The values a factory receives for its `inject` list, in order. */
export type Injected<I extends readonly unknown[]> = { -readonly [K in keyof I]: Provided<I[K]> }

/**
 * A factory provider whose `useFactory` is typed from its `inject` list and its token: each parameter is
 * what the token in that place provides, and the factory returns what `provide` stands for. It returns
 * the provider as given, for `@MeoCord({ providers })` or a testing module's `providers`.
 *
 * A plain `{ provide, useFactory, inject }` object works the same at runtime; TypeScript cannot type
 * its factory's parameters from `inject` inside a list, which this does.
 *
 * @param provider - The token to provide, the tokens to inject, and the factory.
 * @returns The provider, unchanged.
 *
 * @example
 * ```ts
 * export const DATABASE = createToken<Pool>('Database')
 *
 * @MeoCord({
 *   controllers: [NotesController],
 *   providers: [
 *     // config is a Config, and the factory must return a Pool
 *     factoryProvider({ provide: DATABASE, inject: [Config], useFactory: config => new Pool({ connectionString: config.databaseUrl }) }),
 *   ],
 *   clientOptions: { intents: [GatewayIntentBits.Guilds] },
 * })
 * class App {}
 * ```
 */
export function factoryProvider<const P extends ProviderToken, const I extends readonly ProviderToken[] = []>(provider: {
  provide: P
  inject?: I
  useFactory: (...args: Injected<I>) => Provided<P> | Promise<Provided<P>>
}): FactoryProvider<Provided<P>> {
  return provider as unknown as FactoryProvider<Provided<P>>
}
