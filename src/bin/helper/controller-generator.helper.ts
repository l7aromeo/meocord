import path from 'path'
import { ControllerType } from '@src/enum/controller.enum.js'
import { kebabCase } from 'lodash-es'
import {
  assertFilesAbsent,
  commandNameFor,
  createDirectoryIfNotExists,
  generateFile,
  populateTemplate,
  toClassName,
  validateAndFormatName,
} from '@src/util/generator-cli.util.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

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

    // Every file this would write, checked before any is: a refusal leaves nothing half-made.
    assertFilesAbsent([
      ...(this.getBuilderConfig(type, className, kebabCaseName, parts) ? [this.builderFilePath(controllerDir, kebabCaseName)] : []),
      path.join(controllerDir, `${kebabCaseName}.${type}.controller.ts`),
      path.join(controllerDir, `${kebabCaseName}.${type}.controller.spec.ts`),
    ])

    const template = this.buildControllerTemplate(className, type, parts, kebabCaseName)
    this.generateControllerStructure(controllerDir, kebabCaseName, className, type, template, parts)
  }

  /** Where a controller's own builder is written: beside it, named after it. */
  private builderFilePath(controllerDir: string, kebabCaseName: string): string {
    return path.join(controllerDir, 'builders', `${kebabCaseName}.builder.ts`)
  }

  /**
   * Builds the controller template content by populating a template with variables.
   * @param className - The name of the controller class.
   * @param type - The type of the controller, defined in the `ControllerType` enum.
   * @returns The populated template string for the controller.
   * @throws Will throw an error if the controller type is unsupported.
   */
  buildControllerTemplate(
    className: string,
    type: ControllerType,
    parts: string[] = [],
    kebabCaseName: string = kebabCase(className),
  ): string {
    const templateConfig = this.getTemplateConfig(type, className, parts, kebabCaseName)
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
  private getTemplateConfig(type: ControllerType, className: string, parts: string[], kebabCaseName: string) {
    const baseDir = path.resolve(__dirname, '..', 'builder-template', 'controller')
    const templates: Record<ControllerType, string> = {
      [ControllerType.BUTTON]: 'button.controller.template',
      [ControllerType.MODAL_SUBMIT]: 'modal-submit.controller.template',
      [ControllerType.SELECT_MENU]: 'select-menu.controller.template',
      [ControllerType.USER_SELECT_MENU]: 'user-select-menu.controller.template',
      [ControllerType.ROLE_SELECT_MENU]: 'role-select-menu.controller.template',
      [ControllerType.MENTIONABLE_SELECT_MENU]: 'mentionable-select-menu.controller.template',
      [ControllerType.CHANNEL_SELECT_MENU]: 'channel-select-menu.controller.template',
      [ControllerType.REACTION]: 'reaction.controller.template',
      [ControllerType.MESSAGE]: 'message.controller.template',
      [ControllerType.CONTEXT_MENU]: 'context-menu.controller.template',
      [ControllerType.SLASH]: 'slash.controller.template',
      [ControllerType.AUTOCOMPLETE]: 'autocomplete.controller.template',
      [ControllerType.PRIMARY_ENTRY_POINT]: 'primary-entry-point.controller.template',
    }

    const template = templates[type] ? path.resolve(baseDir, templates[type]) : undefined
    // The builder is written beside the controller and named after it, so each controller
    // imports its own and generating one never touches another's. The path follows any
    // nesting, since the builder moves with the controller.
    const builderImportPath = ['@src/controllers', type, ...parts, 'builders', `${kebabCaseName}.builder`].join('/')
    const variables = {
      className,
      builderImportPath,
      builderClassName: `${className}CommandBuilder`,
      commandName: commandNameFor(parts, kebabCaseName),
    }
    return template ? { template, variables } : undefined
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
    parts: string[],
  ): void {
    this.generateBuilderFile(className, kebabCaseName, type, controllerDir, parts)
    createDirectoryIfNotExists(controllerDir)

    const controllerFilePath = path.join(controllerDir, `${kebabCaseName}.${type}.controller.ts`)
    generateFile(controllerFilePath, controllerTemplate)

    const typeClassName = toClassName(type.replace(/-/g, ' '))
    const specTemplatePath = path.resolve(__dirname, '..', 'builder-template', 'controller', 'controller.spec.template')
    const specContent = populateTemplate(specTemplatePath, { className, kebabCaseName, type, typeClassName })
    generateFile(path.join(controllerDir, `${kebabCaseName}.${type}.controller.spec.ts`), specContent)
  }

  /**
   * Generates a builder file for the specified controller type and stores it in the controller directory.
   * @param className - The name of the controller class.
   * @param type - The type of the controller, defined in the `ControllerType` enum.
   * @param controllerDir - The absolute path to the controller directory.
   */
  private generateBuilderFile(
    className: string,
    kebabCaseName: string,
    type: ControllerType,
    controllerDir: string,
    parts: string[],
  ): void {
    const builderConfig = this.getBuilderConfig(type, className, kebabCaseName, parts)
    if (!builderConfig) return

    const builderTemplate = populateTemplate(builderConfig.template, builderConfig.variables)
    createDirectoryIfNotExists(path.join(controllerDir, 'builders'))
    generateFile(this.builderFilePath(controllerDir, kebabCaseName), builderTemplate)
  }

  /**
   * Retrieves the configuration for generating a builder file based on the controller type and class name.
   * @param type - The type of the controller, defined in the `ControllerType` enum.
   * @param className - The name of the controller class.
   * @returns An object containing the builder template path and variables, or `undefined` if not found.
   */
  private getBuilderConfig(type: ControllerType, className: string, kebabCaseName: string, parts: string[]) {
    const baseDir = path.resolve(__dirname, '..', 'builder-template', 'builder')
    const templates: Partial<Record<ControllerType, string>> = {
      [ControllerType.CONTEXT_MENU]: 'context-menu.builder.template',
      [ControllerType.SLASH]: 'slash.builder.template',
      [ControllerType.PRIMARY_ENTRY_POINT]: 'primary-entry-point.builder.template',
    }

    const template = templates[type] ? path.resolve(baseDir, templates[type]) : undefined
    const variables = { className, builderClassName: `${className}CommandBuilder`, commandName: commandNameFor(parts, kebabCaseName) }
    return template ? { template, variables } : undefined
  }
}
