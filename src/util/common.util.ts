/*
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

import fs from 'fs'
import path from 'path'
import { compileMeoCordConfig, loadMeoCordConfig } from '@src/util/meocord-config-loader.util.js'
import wait from '@src/util/wait.util.js'
import chalk from 'chalk'

/**
 * Finds the package directory for the given module name
 * @param {string} moduleName - The name of the module to find
 * @param {string} baseDir - The starting directory to search from (defaults to process.cwd())
 * @returns {string} - The directory path where the module's package.json is located
 */
export const findModulePackageDir = (moduleName: string, baseDir: string = process.cwd()): string | null => {
  try {
    // Resolve the node_modules directory from the base directory
    let currentDir = baseDir

    // Traverse the node_modules directories upwards until the package is found
    while (currentDir !== path.parse(currentDir).root) {
      const modulePath = path.join(currentDir, 'node_modules', moduleName)

      if (fs.existsSync(modulePath)) {
        return modulePath // Return the full path to the module directory
      }

      // Move up one level in the directory structure
      currentDir = path.join(currentDir, '..')
    }

    throw new Error(`Module ${moduleName} not found in node_modules.`)
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error finding package directory for ${moduleName}:`, error.message))
    } else {
      console.error(chalk.red(`Error finding package directory for ${moduleName}:`, error))
    }
    return null
  }
}

/**
 * Compiles and validates the MeoCord configuration file.
 * Ensures that `meocord.config.ts` exists, compiles it, and checks
 * the presence of essential configuration properties like `discordToken`.
 *
 * @throws Will exit the process if the `meocord.config.ts` file is missing or
 *         if the `discordToken` property is not found in the configuration.
 */
export async function compileAndValidateConfig() {
  const meocordConfigPath = path.resolve(process.cwd(), 'meocord.config.ts')
  if (!fs.existsSync(meocordConfigPath)) {
    console.error(chalk.red('Configuration file "meocord.config.ts" is missing!'))
    await wait(100)
    process.exit(1)
  }

  await compileMeoCordConfig()
  const meocordConfig = loadMeoCordConfig()
  if (!meocordConfig?.discordToken) {
    console.error(chalk.red('Discord token is missing!'))
    await wait(100)
    process.exit(1)
  }
}

/**
 * Sets the environment mode for the application.
 * Assigns the provided mode to `process.env.NODE_ENV` if it hasn't been set already.
 *
 * @param {'production' | 'development'} mode - The desired environment mode.
 */
export function setEnvironment(mode: 'production' | 'development') {
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = mode
  }
}
