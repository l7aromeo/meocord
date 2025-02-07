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

import { Argument, Command } from 'commander'
import { ControllerType, CommandType } from '@src/enum/controller.enum'
import { ControllerGeneratorHelper } from '@src/bin/helper/controller-generator.helper'
import { Logger } from '@src/common'
import { ServiceGeneratorHelper } from '@src/bin/helper/service-generator.helper'
import { GuardGeneratorHelper } from '@src/bin/helper/guard-generator.helper'

export class GeneratorCLI {
  private logger: Logger
  private controllerGeneratorHelper: ControllerGeneratorHelper
  private serviceGeneratorHelper: ServiceGeneratorHelper
  private guardGeneratorHelper: GuardGeneratorHelper

  constructor(private appName: string) {
    this.logger = new Logger(this.appName)
    this.controllerGeneratorHelper = new ControllerGeneratorHelper(this.appName)
    this.serviceGeneratorHelper = new ServiceGeneratorHelper(this.appName)
    this.guardGeneratorHelper = new GuardGeneratorHelper(this.appName)
  }

  register(program: Command): Command {
    const generatorCommand = program.command('generate').alias('g').description('Generate components')

    generatorCommand
      .command('controller')
      .alias('co')
      .description('Generate a controller component')
      .addArgument(
        new Argument('<type>', 'Type of the controller (e.g., button, context-menu, etc.)').choices([
          'button',
          'context-menu',
          'message',
          'modal-submit',
          'reaction',
          'select-menu',
          'slash',
        ]),
      )
      .addArgument(new Argument('<name>', 'Name of the controller'))
      .action(async (type, name) => {
        await this.handleGenerateComponent({
          component: 'controller',
          type: type as ControllerType,
          name,
        })
      })

    generatorCommand
      .command('service')
      .alias('s')
      .addArgument(new Argument('<name>', 'Name of the service.'))
      .description('Generate a service component')
      .action(async name => {
        await this.handleGenerateComponent({
          component: 'service',
          name,
        })
      })

    generatorCommand
      .command('guard')
      .alias('gu')
      .addArgument(new Argument('<name>', 'Name of the guard.'))
      .description('Generate a guard component')
      .action(async name => {
        await this.handleGenerateComponent({
          component: 'guard',
          name,
        })
      })

    return program
  }

  private async handleGenerateComponent(args: {
    component: string
    name: string
    type?: ControllerType
  }): Promise<void> {
    const { component, name, type } = args

    if (!name) {
      throw new Error('Name is required')
    }

    switch (component) {
      case 'controller':
        if (!type) {
          throw new Error('Type is required for controllers')
        }
        await this.handleGenerateController({ name, type })
        break

      case 'service':
        await this.serviceGeneratorHelper.generateService(name)
        break

      case 'guard':
        await this.guardGeneratorHelper.generateGuard(name)
        break

      default:
        throw new Error(`Unsupported component type: ${component}`)
    }
  }

  private async handleGenerateController(args: { name: string; type: ControllerType }): Promise<void> {
    const typeMap: Record<
      ControllerType,
      { interactionType: string[]; commandType?: CommandType; hasBuilder?: boolean }
    > = {
      [ControllerType.BUTTON]: { interactionType: ['ButtonInteraction'], commandType: CommandType.BUTTON },
      [ControllerType.MODAL_SUBMIT]: {
        interactionType: ['ModalSubmitInteraction'],
        commandType: CommandType.MODAL_SUBMIT,
      },
      [ControllerType.SELECT_MENU]: {
        interactionType: ['StringSelectMenuInteraction'],
        commandType: CommandType.SELECT_MENU,
      },
      [ControllerType.REACTION]: { interactionType: ['MessageReaction'] },
      [ControllerType.SLASH]: { interactionType: ['ChatInputCommandInteraction'], hasBuilder: true },
      [ControllerType.CONTEXT_MENU]: {
        interactionType: ['UserContextMenuCommandInteraction', 'MessageContextMenuCommandInteraction'],
        hasBuilder: true,
      },
    }

    const config = typeMap[args.type]
    if (!config) {
      throw new Error(`Unsupported controller type: ${args.type}`)
    }

    await this.controllerGeneratorHelper.generateController(
      { controllerName: args.name },
      args.type as ControllerType,
      config.interactionType,
      config.commandType,
      config.hasBuilder,
    )
  }
}
