import { realpathSync } from 'node:fs'

/** Where the built bundle's pre-entry records the bundle's own path. */
export const BUNDLE_ENTRY_KEY = Symbol.for('meocord.bundleEntry')

/**
 * The file a shard process runs: the built bundle, as its pre-entry recorded it, else the script this
 * process was started with.
 */
export function bundleEntry(): string {
  const recorded = (globalThis as Record<symbol, unknown>)[BUNDLE_ENTRY_KEY]
  // A development build fixes import.meta.url at build time, so there it names the pre-entry's source
  if (typeof recorded === 'string' && !recorded.endsWith('load-config.pre-entry.js')) return recorded
  return realpathSync(process.argv[1])
}
