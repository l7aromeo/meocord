/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { injectable } from 'inversify'
import { CommandType, MetadataKey } from '@src/enum/index.js'
import { type CommandBuilderBase } from '@src/interface/command-decorator.interface.js'

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
export function CommandBuilder<T extends CommandType.SLASH | CommandType.CONTEXT_MENU>(commandType: T) {
  return function (target: new () => CommandBuilderBase<T>) {
    // Check if the class is already injectable; if not, make it injectable dynamically
    if (!Reflect.hasMetadata(MetadataKey.Injectable, target)) {
      injectable()(target)
    }

    // Define the command type metadata for the target class
    Reflect.defineMetadata(
      MetadataKey.CommandType,
      commandType,
      target as unknown as CommandBuilderBase<T> & { commandType: string },
    )
  }
}
