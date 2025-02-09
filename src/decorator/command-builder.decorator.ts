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

import 'reflect-metadata'
import { CommandBuilderBase } from '@src/decorator'
import { injectable } from 'inversify'
import { CommandType } from '@src/enum'

/**
 * This decorator is used to mark a class as a Discord command builder that later can be registered on the `@Command` decorator.
 * It defines the command type using metadata and dynamically makes the class injectable if it isn't already.
 *
 * @example
 * ```typescript
 * @CommandBuilder(CommandType.SLASH)
 * export class MySlashCommand implements CommandBuilderBase {
 *   build(commandName: string): SlashCommandBuilder {
 *     return new SlashCommandBuilder().setName(commandName).setDescription('A sample slash command')
 *   }
 * }
 *```
 *
 * @param commandType - The type of the command, specified from the `CommandType` enum.
 * @returns A decorator function that makes the target class injectable
 *          and assigns the `commandType` metadata.
 */
export function CommandBuilder(commandType: CommandType) {
  return function (target: new () => CommandBuilderBase) {
    // Check if the class is already injectable; if not, make it injectable dynamically
    if (!Reflect.hasMetadata('inversify:injectable', target)) {
      injectable()(target)
    }

    // Define the command type metadata for the target class
    Reflect.defineMetadata(
      'commandType',
      commandType,
      target as unknown as CommandBuilderBase & { commandType: string },
    )
  }
}
