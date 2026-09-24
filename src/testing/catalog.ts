import { type CatalogShape, CATALOGS, type Translator } from '@src/common/translator.js'

interface Leaf { key: string; plural: boolean }

const isPlural = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && typeof (value as { other?: unknown }).other === 'string'

/** Every message key of a catalog, and whether it is a plural. */
function leaves(catalog: CatalogShape, prefix = ''): Leaf[] {
  return Object.entries(catalog).flatMap(([name, value]) => {
    const key = `${prefix}${name}`
    if (typeof value === 'string') return [{ key, plural: false }]
    if (isPlural(value)) return [{ key, plural: true }]
    return leaves(value as CatalogShape, `${key}.`)
  })
}

function at(catalog: CatalogShape, key: string): unknown {
  return key.split('.').reduce<unknown>((current, part) => (current as Record<string, unknown> | undefined)?.[part], catalog)
}

/**
 * Checks that every locale translates every message, for teams that want no fallback in production.
 * It reports, for each locale, the messages it lacks, the messages the default catalog does not have,
 * and the plural forms its language needs but a plural lacks, such as `few` for Russian.
 *
 * @param translator - A translator made by `createTranslator`.
 * @throws An error listing every gap, locale by locale; nothing when the catalogs are complete.
 *
 * @example
 * ```ts
 * import { t } from '@src/i18n'
 *
 * it('translates everything', () => {
 *   expectCompleteCatalog(t)
 * })
 * ```
 */
export function expectCompleteCatalog(translator: Translator<any>): void {
  const catalogs = (translator as unknown as { [CATALOGS]?: Partial<Record<string, CatalogShape>> })[CATALOGS]
  if (!catalogs) throw new Error('expectCompleteCatalog takes a translator made by createTranslator.')

  const reference = leaves(catalogs[translator.defaultLocale] ?? {})
  const referenceKeys = new Set(reference.map(({ key }) => key))
  const gaps: string[] = []

  for (const locale of translator.locales) {
    const catalog = catalogs[locale] ?? {}
    const problems: string[] = []
    const categories = new Intl.PluralRules(locale).resolvedOptions().pluralCategories

    for (const { key, plural } of reference) {
      const message = at(catalog, key)
      if (message === undefined) {
        problems.push(`missing ${key}`)
      } else if (plural && isPlural(message)) {
        const missing = categories.filter(category => typeof (message as Record<string, unknown>)[category] !== 'string')
        if (missing.length > 0) problems.push(`${key} lacks ${missing.join(', ')}`)
      }
    }
    for (const { key } of leaves(catalog)) {
      if (!referenceKeys.has(key)) problems.push(`${key} is not in the default catalog`)
    }

    if (problems.length > 0) gaps.push(`  ${locale}: ${problems.join('; ')}`)
  }

  if (gaps.length > 0) throw new Error(`The catalogs are incomplete:\n${gaps.join('\n')}`)
}
