/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import path from 'path'
import { Logger } from '@src/common/index.js'
import {
  buildTemplate,
  createDirectoryIfNotExists,
  generateFile,
  validateAndFormatName,
} from '@src/util/generator-cli.util.js'

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
