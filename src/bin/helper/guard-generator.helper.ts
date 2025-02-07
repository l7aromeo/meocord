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
import _ from 'lodash'
import { Logger } from '@src/common/logger'

export class GuardGeneratorHelper {
  private readonly logger: Logger

  constructor(private readonly appName: string) {
    this.logger = new Logger(this.appName)
  }

  async toClassName(originalName: string): Promise<string> {
    const className = _.startCase(_.camelCase(originalName)).replace(/\s/g, '')

    const classNameRegex = /^[A-Z][A-Za-z0-9]*$/
    if (!classNameRegex.test(className)) {
      this.logger.error(
        `Invalid class name "${originalName}". Must start with a letter and contain alphanumeric characters.`,
      )
      process.exit(1)
    }

    return className
  }

  async validateAndFormatName(originalName?: string): Promise<{
    parts: string[]
    kebabCaseName: string
    className: string
  }> {
    if (!originalName) {
      this.logger.error('Guard name is required.')
      process.exit(1)
    }

    const parts = originalName.split('/')
    const fileName = parts.pop()
    if (!fileName) {
      this.logger.error('Invalid guard name.')
      process.exit(1)
    }

    const kebabCaseName = _.kebabCase(fileName)
    const className = await this.toClassName(fileName)

    return { parts, kebabCaseName, className }
  }

  createDirectoryIfNotExists(directory: string): void {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true })
    }
  }

  generateFile(filePath: string, content: string): void {
    try {
      fs.writeFileSync(filePath, content)
      this.logger.log(`Guard file created at: ${path.relative(process.cwd(), filePath)}`)
    } catch (error) {
      this.logger.error(`Failed to create guard file at ${filePath}`, error)
    }
  }

  async generateGuard(guardName?: string): Promise<void> {
    if (!guardName) {
      this.logger.error('Guard name is required.')
      process.exit(1)
    }

    const { parts, kebabCaseName, className } = await this.validateAndFormatName(guardName)

    const guardDir = path.join(process.cwd(), 'src', 'guards', ...parts)
    const guardFile = path.join(guardDir, `${kebabCaseName}.guard.ts`)

    const guardTemplate = this.buildGuardTemplate(className)

    this.createDirectoryIfNotExists(guardDir)
    this.generateFile(guardFile, guardTemplate)
  }

  buildGuardTemplate(className: string): string {
    const filePath = path.resolve(__dirname, '..', 'builder-template', 'guard.template')
    let template = fs.readFileSync(filePath, 'utf-8')

    const variables = {
      className,
    }

    for (const [key, value] of Object.entries(variables)) {
      template = template.replace(`{{${key}}}`, value)
    }

    return template
  }
}
