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
import { exec } from 'child_process'
import { Logger } from '@src/common'
import _ from 'lodash'
import wait from '@src/util/wait.util'
import { ControllerType } from '@src/enum/controller.enum'

export class ControllerGeneratorHelper {
  private logger: Logger

  constructor(private appName: string) {
    this.logger = new Logger(this.appName)
  }

  async toClassName(originalName: string): Promise<string> {
    const className = _.startCase(_.camelCase(originalName)).replace(/\s/g, '')

    const classNameRegex = /^[A-Z][A-Za-z0-9]*$/
    if (!classNameRegex.test(className)) {
      this.logger.error(
        `Invalid class name "${originalName}". It must start with a letter and contain only alphanumeric characters.`,
      )
      await wait(100)
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
      this.logger.error('Controller name is required')
      process.exit(1)
    }

    const parts = _.split(originalName, '/')
    const fileName = parts.pop()
    if (!fileName) {
      this.logger.error('Invalid controller name')
      process.exit(1)
    }

    const kebabCaseName = _.kebabCase(fileName)
    const className = await this.toClassName(fileName)

    if (!className) {
      this.logger.error('Invalid controller name')
      await wait(100)
      process.exit(1)
    }

    return { parts, kebabCaseName, className }
  }

  createDirectoryIfNotExists(directory: string): void {
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true })
    }
  }

  generateFileWithESLintFix(filePath: string, template: string): void {
    try {
      fs.writeFileSync(filePath, template)
      this.logger.log(`File created at ${path.relative(process.cwd(), filePath)}`)
      exec(`npx eslint --fix ${filePath}`)
    } catch (error) {
      this.logger.error(`Error creating file at ${filePath}`, error)
      process.exit(1)
    }
  }

  async generateController(args: { controllerName: string | undefined }, type: ControllerType): Promise<void> {
    const { parts, kebabCaseName, className } = await this.validateAndFormatName(args.controllerName)

    const controllerDir = this.generateControllerPaths(parts, type)
    const template = await this.buildControllerTemplate(className, type)

    this.generateControllerStructure(controllerDir, kebabCaseName, className, type, template)
  }

  generateControllerPaths(parts: string[], type: string): string {
    return path.join(process.cwd(), 'src', 'controllers', type, ...parts)
  }

  generateControllerFile(controllerDir: string, type: string, kebabCaseName: string): string {
    return path.join(controllerDir, `${kebabCaseName}.${type}.controller.ts`)
  }

  async buildControllerTemplate(className: string, type: ControllerType): Promise<string> {
    const templateFilePaths: Record<ControllerType, { template: string; variables: Record<string, string> }> = {
      [ControllerType.BUTTON]: {
        template: path.resolve(__dirname, '..', 'builder-template', 'button.controller.template'),
        variables: { className },
      },
      [ControllerType.MODAL_SUBMIT]: {
        template: path.resolve(__dirname, '..', 'builder-template', 'modal-submit.controller.template'),
        variables: { className },
      },
      [ControllerType.SELECT_MENU]: {
        template: path.resolve(__dirname, '..', 'builder-template', 'select-menu.controller.template'),
        variables: { className },
      },
      [ControllerType.REACTION]: {
        template: path.resolve(__dirname, '..', 'builder-template', 'reaction.controller.template'),
        variables: { className },
      },
      [ControllerType.MESSAGE]: {
        template: path.resolve(__dirname, '..', 'builder-template', 'message.controller.template'),
        variables: { className },
      },
      [ControllerType.CONTEXT_MENU]: {
        template: path.resolve(__dirname, '..', 'builder-template', 'context-menu.controller.template'),
        variables: { className },
      },
      [ControllerType.SLASH]: {
        template: path.resolve(__dirname, '..', 'builder-template', 'slash.controller.template'),
        variables: { className },
      },
    }

    const template = templateFilePaths[type]?.template
    const variables = templateFilePaths[type]?.variables
    if (!template) {
      throw new Error(`Unsupported controller type: ${type}`)
    }

    return this.populateTemplate(template, variables)
  }

  private populateTemplate(filePath: string, variables: Record<string, string>): string {
    let template = fs.readFileSync(filePath, 'utf-8')
    for (const [key, value] of Object.entries(variables)) {
      template = template.replaceAll(`{{${key}}}`, value)
    }
    return template
  }

  generateControllerStructure(
    controllerDir: string,
    kebabCaseName: string,
    className: string,
    type: ControllerType,
    controllerTemplate: string,
  ): void {
    this.generateBuilderFile(className, type, controllerDir)
    this.createDirectoryIfNotExists(controllerDir)
    const controllerFile = this.generateControllerFile(controllerDir, type, kebabCaseName)
    this.generateFileWithESLintFix(controllerFile, controllerTemplate)
  }

  generateBuilderFile(className: string, type: ControllerType, controllerDir: string): void {
    const templateFilePaths: Record<
      ControllerType.SLASH | ControllerType.CONTEXT_MENU,
      { template: string; variables: Record<string, string> }
    > = {
      [ControllerType.CONTEXT_MENU]: {
        template: path.resolve(__dirname, '..', 'builder-template', 'context-menu.builder.template'),
        variables: { className },
      },
      [ControllerType.SLASH]: {
        template: path.resolve(__dirname, '..', 'builder-template', 'slash.builder.template'),
        variables: { className },
      },
    }

    const template = templateFilePaths[type]?.template
    const variables = templateFilePaths[type]?.variables
    if (!template) return

    const builderTemplate = this.populateTemplate(template, variables)
    const builderFilePath = path.join(controllerDir, 'builders', `sample.builder.ts`)
    this.createDirectoryIfNotExists(path.join(controllerDir, 'builders'))
    this.generateFileWithESLintFix(builderFilePath, builderTemplate)
  }
}
