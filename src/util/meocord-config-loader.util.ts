/**
 * MeoCord Framework
 * Copyright (C) 2025 Ukasyah Rahmatullah Zada
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import path from 'path'
import { existsSync, readFileSync } from 'fs'
import { createJiti } from 'jiti'
import { type MeoCordConfig } from '@src/interface/index.js'
import { fixJSON } from '@src/util/json.util.js'

/**
 * Loads the MeoCord configuration file (meocord.config.ts) directly at runtime
 * using jiti, without a separate compilation step.
 *
 * @returns {MeoCordConfig | undefined} The loaded configuration object, or undefined if loading fails.
 */
export function loadMeoCordConfig(): MeoCordConfig | undefined {
  const configPath = path.resolve(process.cwd(), 'meocord.config.ts')

  if (!existsSync(configPath)) {
    return undefined
  }

  try {
    // Read user's tsconfig.json to extract path aliases for jiti
    const tsConfigPath = path.resolve(process.cwd(), 'tsconfig.json')
    const aliases: Record<string, string> = {}

    if (existsSync(tsConfigPath)) {
      const tsConfig = JSON.parse(fixJSON(readFileSync(tsConfigPath, 'utf-8')))
      const paths = tsConfig?.compilerOptions?.paths

      if (paths) {
        for (const [key, values] of Object.entries(paths)) {
          // Convert TS path alias format "@src/*" -> ["./src/*"] to jiti alias format
          const aliasKey = key.replace('/*', '')
          const aliasValue = path.resolve(process.cwd(), (values as string[])[0].replace('/*', ''))
          aliases[aliasKey] = aliasValue
        }
      }
    }

    const jiti = createJiti(import.meta.url, {
      interopDefault: true,
      alias: aliases,
      moduleCache: false,
    })

    return jiti(configPath) as MeoCordConfig
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[MeoCord] Failed to load config: ${error.message}`)
    } else {
      console.error(`[MeoCord] Failed to load config: Unknown error`)
    }
    return undefined
  }
}
