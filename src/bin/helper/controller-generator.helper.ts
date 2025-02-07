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
import { CommandType } from '@src/enum'
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

  async generateController(
    args: { controllerName: string | undefined },
    type: ControllerType,
    interactionType: string[],
    commandType?: CommandType,
    hasBuilder = false,
  ): Promise<void> {
    const { parts, kebabCaseName, className } = await this.validateAndFormatName(args.controllerName)

    const controllerDir = this.generateControllerPaths(parts, type)
    const template = await this.buildControllerTemplate(className, type, interactionType, commandType, hasBuilder)

    this.generateControllerStructure(controllerDir, hasBuilder, kebabCaseName, type, template)
  }

  generateControllerPaths(parts: string[], type: string): string {
    return path.join(process.cwd(), 'src', 'controllers', type, ...parts)
  }

  generateControllerFile(controllerDir: string, type: string, kebabCaseName: string): string {
    return path.join(controllerDir, `${kebabCaseName}.${type}.controller.ts`)
  }

  async buildControllerTemplate(
    className: string,
    type: ControllerType,
    interactionType: string[],
    commandType?: CommandType,
    hasBuilder = false,
  ): Promise<string> {
    if (hasBuilder) {
      return `import { ${interactionType} } from 'discord.js'
import { Controller, Command } from 'meocord/decorator'
import { SampleCommandBuilder } from '@src/controllers/${type}/builders/sample.builder'

@Controller()
export class ${className}${await this.toClassName(type)}Controller {

  @Command('sample', SampleCommandBuilder)
  async sample(interaction: ${interactionType.join(' | ')}) {
    await interaction.reply('This is sample reply of ${type} command')
  }
}
`
    } else {
      switch (type) {
        case ControllerType.BUTTON:
          return `import { ${interactionType.join(', ')} } from 'discord.js'
import { Controller, Command } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'

@Controller()
export class ${className}ButtonController {

  @Command('button-click', CommandType.BUTTON)
  async handleButton(interaction: ${interactionType.join(' | ')}) {
    await interaction.reply('Button clicked!')
  }
}`
        case ControllerType.MODAL_SUBMIT:
          return `import { ${interactionType.join(', ')} } from 'discord.js'
import { Controller, Command } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'

@Controller()
export class ${className}ModalController {

  @Command('submit-modal', CommandType.MODAL_SUBMIT)
  async handleModal(interaction: ${interactionType.join(' | ')}) {
    await interaction.reply('Modal submitted!')
  }
}`
        case ControllerType.SELECT_MENU:
          return `import { ${interactionType.join(', ')} } from 'discord.js'
import { Controller, Command } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'

@Controller()
export class ${className}SelectMenuController {

  @Command('select-menu', CommandType.SELECT_MENU)
  async handleSelectMenu(interaction: ${interactionType.join(' | ')}) {
    await interaction.reply('Select menu used!')
  }
}`
        case ControllerType.REACTION:
          return `import { ${interactionType.join(', ')}, User } from 'discord.js'
import { Controller, ReactionHandler } from 'meocord/decorator'
import { Logger } from 'meocord/common'
import { CommandType } from 'meocord/enum'

@Controller()
export class HelloReactionController {
  private readonly logger = new Logger(HelloReactionController.name)

  @ReactionHandler()
  async handleAnyReaction(reaction: ${interactionType.join(' | ')}, user: User) {
    this.logger.log('Reaction detected!')
    if (reaction.message) {
      await reaction.message.reply(\`\${user.username} reacted!\`)
    }
  }

  @ReactionHandler('😋')
  async handleReaction(reaction: ${interactionType.join(' | ')}, user: User) {
    this.logger.log('Reaction 😋 detected!')
    if (reaction.message) {
      await reaction.message.reply(\`\${user.username} reacted with 😋!\`)
    }
  }
}
`
        case ControllerType.SLASH:
          return `import { ${interactionType.join(', ')} } from 'discord.js'
import { Controller, Command, CommandType } from 'meocord/decorator'

@Controller()
export class ${className}SlashController {

  @Command('ping', CommandType.SLASH)
  async replyWithPong(interaction: ${interactionType.join(' | ')}) {
    await interaction.reply('Pong!')
  }
}`
        case ControllerType.CONTEXT_MENU:
          return `import { ${interactionType.join(', ')}, ApplicationCommandType } from 'discord.js'
import { Controller, Command, CommandType } from 'meocord/decorator'

@Controller()
export class ${className}ContextMenuController {

  @Command('custom-context-menu', CommandType.CONTEXT_MENU)
  async handleContextMenu(interaction: ${interactionType.join(' | ')}) {
    await interaction.reply('Context menu selected!')
  }
}`
        default:
          throw new Error(`Unsupported controller type: ${type}`)
      }
    }
  }

  generateControllerStructure(
    controllerDir: string,
    hasBuilder: boolean,
    kebabCaseName: string,
    type: string,
    controllerTemplate: string,
  ): void {
    this.createDirectoryIfNotExists(controllerDir)
    if (hasBuilder) {
      const builderFile = path.join(controllerDir, 'builders', `sample.builder.ts`)
      const builderTemplate = this.buildBuilderTemplate(type)
      this.createDirectoryIfNotExists(path.join(controllerDir, 'builders'))
      this.generateFileWithESLintFix(builderFile, builderTemplate)
    }

    const controllerFile = this.generateControllerFile(controllerDir, type, kebabCaseName)
    this.generateFileWithESLintFix(controllerFile, controllerTemplate)
  }

  buildBuilderTemplate(type: string): string {
    const isSlashCommand = type === 'slash'
    const importBuilder = isSlashCommand
      ? 'SlashCommandBuilder'
      : ['ApplicationCommandType', 'ContextMenuCommandBuilder'].join(', ')
    const builderClass = isSlashCommand ? 'SlashCommandBuilder()' : 'ContextMenuCommandBuilder()'
    const contextMenuSetting = type === 'context-menu' ? '.setType(ApplicationCommandType.User)' : ''

    return `import { ${importBuilder} } from 'discord.js'
import { CommandBuilder } from 'meocord/decorator'
import { CommandType } from 'meocord/enum'

@CommandBuilder(CommandType.${type.toUpperCase().replace('-', '_')})
export class SampleCommandBuilder {
  build() {
    return new ${builderClass}
      .setName('sample')${contextMenuSetting}
  }
}
`
  }
}
