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
} from '@src/util/generator-cli.util'

export class ServiceGeneratorHelper {
  private readonly logger: Logger

  constructor(private readonly appName: string) {
    this.logger = new Logger(this.appName)
  }

  /**
   * Generates a service file based on the provided service name.
   * Validates and formats the service name, creates the necessary directories,
   * and generates the service file using a predefined template.
   *
   * @param serviceName - The name of the service to generate.
   *                      It can include slashes for nested paths.
   * @throws Exits the process if the service name is not provided or invalid.
   */
  generateService(serviceName?: string): void {
    if (!serviceName) {
      this.logger.error('Service name is required.')
      process.exit(1)
    }

    const { parts, kebabCaseName, className } = validateAndFormatName(serviceName)

    const serviceDir = path.join(process.cwd(), 'src', 'services', ...parts)
    const serviceFile = path.join(serviceDir, `${kebabCaseName}.service.ts`)

    const serviceTemplate = buildTemplate(className, 'service.template')

    createDirectoryIfNotExists(serviceDir)
    generateFile(serviceFile, serviceTemplate)
  }
}
