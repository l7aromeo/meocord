import { inject, type ServiceIdentifier } from 'inversify'
import { type ProviderToken } from '@src/interface/provider.interface.js'

/**
 * Injects what a token provides into a constructor parameter.
 *
 * A parameter typed as a class is injected by that type and needs no decorator; use `@Inject` for a
 * value provided under a string, a symbol or a token from `createToken`, or to inject a different class
 * than the parameter's type.
 *
 * @param token - The token a provider in `@MeoCord({ providers })` is bound under.
 *
 * @example
 * ```ts
 * @Service()
 * export class NotesStore {
 *   constructor(@Inject(DATABASE) private readonly db: Pool) {}
 * }
 * ```
 */
export function Inject(
  token: ProviderToken,
): (target: object, propertyKey: string | symbol | undefined, parameterIndex: number) => void {
  const decorate = inject(token as ServiceIdentifier)
  return (target, propertyKey, parameterIndex) => decorate(target, propertyKey, parameterIndex)
}
