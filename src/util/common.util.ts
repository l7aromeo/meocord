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
import { Logger } from '@src/common'

/**
 * Finds the package directory for the given module name
 * @param {string} moduleName - The name of the module to find
 * @param {string} baseDir - The starting directory to search from (defaults to process.cwd())
 * @returns {string} - The directory path where the module's package.json is located
 */
export const findModulePackageDir = (moduleName: string, baseDir: string = process.cwd()): string | null => {
  const logger = new Logger('MeoCord')

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
      logger.error(`Error finding package directory for ${moduleName}:`, error.message)
    } else {
      logger.error(`Error finding package directory for ${moduleName}:`, error)
    }
    return null
  }
}
