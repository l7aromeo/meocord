import path from 'path'
import { existsSync } from 'fs'
import { createRequire } from 'module'
import { type MeoCordConfig } from '@src/interface/index.js'

let cachedConfig: MeoCordConfig | undefined
let configLoaded = false

/**
 * Loads the configuration a built application runs with, `dist/meocord.config.mjs`, and caches it.
 * Imports no transpiler, since the logger and the factory import this module into every bot.
 * @returns The configuration, or undefined when the compiled config is missing or fails to load.
 */
export function loadMeoCordConfig(): MeoCordConfig | undefined {
  if (configLoaded) return cachedConfig

  configLoaded = true
  cachedConfig = loadCompiledConfig()
  return cachedConfig
}

/**
 * `require` of an ES module, which Node supports cleanly from 22.13 and bun always has.
 * Synchronous, like the logger and the factory that call it.
 */
function loadCompiledConfig(): MeoCordConfig | undefined {
  const compiledPath = path.resolve(process.cwd(), 'dist', 'meocord.config.mjs')
  if (!existsSync(compiledPath)) return undefined

  try {
    // Called through a variable so a bundler does not try to resolve the path while building the
    // application; the file is only there once the build is done.
    const load = createRequire(import.meta.url)
    const loaded = load(compiledPath) as { default?: MeoCordConfig } & MeoCordConfig
    return loaded.default ?? loaded
  } catch (error) {
    console.error(`[MeoCord] Failed to load dist/meocord.config.mjs: ${error instanceof Error ? error.message : error}`)
    return undefined
  }
}
