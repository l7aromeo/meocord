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
import { ControllerType } from '@src/enum/controller.enum'
import {
  createDirectoryIfNotExists,
  generateFile,
  populateTemplate,
  validateAndFormatName,
} from '@src/util/generator.util'

export class ControllerGeneratorHelper {
  /**
   * Generates a new controller file and an associated structure based on the provided arguments and controller type.
   * @param args - The arguments for generating the controller, including the optional controller name.
   * @param type - The type of the controller to generate, defined in the `ControllerType` enum.
   * @throws Will throw an error if the controller name is invalid or if the controller type is unsupported.
   */
  generateController(args: { controllerName: string | undefined }, type: ControllerType): void {
    const { parts, kebabCaseName, className } = validateAndFormatName(args.controllerName)
    const controllerDir = path.join(process.cwd(), 'src', 'controllers', type, ...parts)
    const template = this.buildControllerTemplate(className, type)

    this.generateControllerStructure(controllerDir, kebabCaseName, className, type, template)
  }

  /**
   * Builds the controller template content by populating a template with variables.
   * @param className - The name of the controller class.
   * @param type - The type of the controller, defined in the `ControllerType` enum.
   * @returns The populated template string for the controller.
   * @throws Will throw an error if the controller type is unsupported.
   */
  buildControllerTemplate(className: string, type: ControllerType): string {
    const templateConfig = this.getTemplateConfig(type, className)
    if (!templateConfig) {
      throw new Error(`Unsupported controller type: ${type}`)
    }
    return populateTemplate(templateConfig.template, templateConfig.variables)
  }

  /**
   * Retrieves the template configuration for a specific controller type and class name.
   * @param type - The type of the controller, defined in the `ControllerType` enum.
   * @param className - The name of the controller class.
   * @returns An object containing the template path and variables, or `undefined` if not found.
   */
  private getTemplateConfig(type: ControllerType, className: string) {
    const baseDir = path.resolve(__dirname, '..', 'builder-template')
    const templates: Record<ControllerType, string> = {
      [ControllerType.BUTTON]: 'button.controller.template',
      [ControllerType.MODAL_SUBMIT]: 'modal-submit.controller.template',
      [ControllerType.SELECT_MENU]: 'select-menu.controller.template',
      [ControllerType.REACTION]: 'reaction.controller.template',
      [ControllerType.MESSAGE]: 'message.controller.template',
      [ControllerType.CONTEXT_MENU]: 'context-menu.controller.template',
      [ControllerType.SLASH]: 'slash.controller.template',
    }

    const template = templates[type] ? path.resolve(baseDir, templates[type]) : undefined
    return template ? { template, variables: { className } } : undefined
  }

  /**
   * Generates the controller file and its associated structure (e.g., builder files, directories).
   * @param controllerDir - The absolute path to the controller directory.
   * @param kebabCaseName - The kebab-case name of the controller file.
   * @param className - The name of the controller class.
   * @param type - The type of the controller, defined in the `ControllerType` enum.
   * @param controllerTemplate - The populated template string for the controller file.
   */
  private generateControllerStructure(
    controllerDir: string,
    kebabCaseName: string,
    className: string,
    type: ControllerType,
    controllerTemplate: string,
  ): void {
    this.generateBuilderFile(className, type, controllerDir)
    createDirectoryIfNotExists(controllerDir)
    const controllerFilePath = path.join(controllerDir, `${kebabCaseName}.${type}.controller.ts`)
    generateFile(controllerFilePath, controllerTemplate)
  }

  /**
   * Generates a builder file for the specified controller type and stores it in the controller directory.
   * @param className - The name of the controller class.
   * @param type - The type of the controller, defined in the `ControllerType` enum.
   * @param controllerDir - The absolute path to the controller directory.
   */
  private generateBuilderFile(className: string, type: ControllerType, controllerDir: string): void {
    const builderConfig = this.getBuilderConfig(type, className)
    if (!builderConfig) return

    const builderTemplate = populateTemplate(builderConfig.template, builderConfig.variables)
    const buildersDir = path.join(controllerDir, 'builders')
    createDirectoryIfNotExists(buildersDir)

    const builderFilePath = path.join(buildersDir, 'sample.builder.ts')
    generateFile(builderFilePath, builderTemplate)
  }

  /**
   * Retrieves the configuration for generating a builder file based on the controller type and class name.
   * @param type - The type of the controller, defined in the `ControllerType` enum.
   * @param className - The name of the controller class.
   * @returns An object containing the builder template path and variables, or `undefined` if not found.
   */
  private getBuilderConfig(type: ControllerType, className: string) {
    const baseDir = path.resolve(__dirname, '..', 'builder-template')
    const templates: Partial<Record<ControllerType, string>> = {
      [ControllerType.CONTEXT_MENU]: 'context-menu.builder.template',
      [ControllerType.SLASH]: 'slash.builder.template',
    }

    const template = templates[type] ? path.resolve(baseDir, templates[type]) : undefined
    return template ? { template, variables: { className } } : undefined
  }
}
