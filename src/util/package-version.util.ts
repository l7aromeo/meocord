import fs from 'node:fs'
import path from 'node:path'

/** The package this CLI ships in, which is where the walk below stops. */
const OWN_PACKAGE_NAME = 'meocord'

/**
 * The version in the nearest manifest naming this package, walking up from `startDir`, or `fallback`.
 * Read at run time, since the release bumps the manifest after the bundle is built.
 */
export function resolveOwnVersion(startDir: string, fallback: string): string {
  let current = path.resolve(startDir)

  while (true) {
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(current, 'package.json'), 'utf8')) as {
        name?: string
        version?: string
      }

      if (manifest.name === OWN_PACKAGE_NAME && typeof manifest.version === 'string') return manifest.version
    } catch {
      // Nothing readable here; the next directory up may still hold the manifest.
    }

    const parent = path.dirname(current)
    if (parent === current) return fallback

    current = parent
  }
}
