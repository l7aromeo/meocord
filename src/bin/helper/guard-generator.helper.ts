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
    const specTemplate = buildTemplate(className, 'guard.spec.template', { kebabCaseName })

    createDirectoryIfNotExists(guardDir)
    generateFile(guardFile, guardTemplate)
    generateFile(path.join(guardDir, `${kebabCaseName}.guard.spec.ts`), specTemplate)
  }
}
