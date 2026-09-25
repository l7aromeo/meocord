import { type Token } from '@src/interface/provider.interface.js'

/**
 * Creates a token to provide and inject a value by, typed with what it provides.
 *
 * A token is a symbol, so two tokens with the same description stay distinct, and its description
 * names it in errors. Its type parameter is what `TestingModule.get` returns for it.
 *
 * @param description - A name for the token, shown in errors and logs.
 * @returns A new token.
 *
 * @example
 * ```ts
 * export const DATABASE = createToken<Pool>('Database')
 *
 * @MeoCord({
 *   controllers: [NotesController],
 *   providers: [{ provide: DATABASE, useFactory: () => new Pool({ connectionString: process.env.DATABASE_URL }) }],
 *   clientOptions: { intents: [GatewayIntentBits.Guilds] },
 * })
 * class App {}
 *
 * @Service()
 * export class NotesStore {
 *   constructor(@Inject(DATABASE) private readonly db: Pool) {}
 * }
 * ```
 */
export function createToken<T>(description: string): Token<T> {
  return Symbol(description) as Token<T>
}
