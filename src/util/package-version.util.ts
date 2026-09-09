/**
 * MeoCord Framework
 * Copyright (c) 2025-present Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import fs from 'node:fs'
import path from 'node:path'

/** The package this CLI ships in, which is where the walk below stops. */
const OWN_PACKAGE_NAME = 'meocord'

/**
 * The version recorded in the package this CLI ships in.
 *
 * Read at run time rather than compiled in. The release bumps the manifest after the
 * bundle has already been built, so a version baked into the bundle is always the one
 * from before the release that published it.
 *
 * The walk stops at the first manifest naming this package: the repository root when
 * running from source, the installed package root when running from `dist`.
 *
 * @param startDir - Directory to walk up from.
 * @param fallback - Returned when no manifest for this package can be read.
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
