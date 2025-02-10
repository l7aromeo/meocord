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

import path from 'path'
import { Logger } from '@src/common/logger'
import {
  buildTemplate,
  createDirectoryIfNotExists,
  generateFile,
  validateAndFormatName,
} from '@src/util/generator.util'

export class GuardGeneratorHelper {
  private readonly logger: Logger

  constructor(private readonly appName: string) {
    this.logger = new Logger(this.appName)
  }

  /**
   * Generates a guard file based on the provided guard name.
   * Validates and formats the guard name, creates the necessary directories,
   * and generates the guard file using a predefined template.
   *
   * @param guardName - The name of the guard to generate.
   *                      It can include slashes for nested paths.
   * @throws Exits the process if the guard name is not provided or invalid.
   */
  generateGuard(guardName?: string): void {
    if (!guardName) {
      this.logger.error('Guard name is required.')
      process.exit(1)
    }

    const { parts, kebabCaseName, className } = validateAndFormatName(guardName)

    const guardDir = path.join(process.cwd(), 'src', 'guards', ...parts)
    const guardFile = path.join(guardDir, `${kebabCaseName}.guard.ts`)

    const guardTemplate = buildTemplate(className, 'guard.template')

    createDirectoryIfNotExists(guardDir)
    generateFile(guardFile, guardTemplate)
  }
}
