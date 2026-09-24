// Runs before the application's entry, so whatever environment meocord.config loads -- a dotenv
// import, say -- is in place when the entry's decorators read process.env. Silent when the config
// is missing or throws: MeoCordFactory.create loads it again and reports that.
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const compiledPath = path.resolve(process.cwd(), 'dist', 'meocord.config.mjs')

if (existsSync(compiledPath)) {
  // Through a variable, as the runtime loader does, so the bundler leaves the path to runtime.
  const load = createRequire(import.meta.url)
  try {
    load(compiledPath)
  } catch {
    // Reported by MeoCordFactory.create.
  }
}
