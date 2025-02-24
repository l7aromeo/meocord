/**
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

import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  StringSelectMenuInteraction,
  UserContextMenuCommandInteraction,
} from 'discord.js'
import { CommandType } from '@src/enum/index.js'

/**
 * Base interface for a command builder.
 */
export interface CommandBuilderBase<
  T extends CommandType.SLASH | CommandType.CONTEXT_MENU = CommandType.SLASH | CommandType.CONTEXT_MENU,
> {
  /**
   * Builds the command structure using the specified command name.
   *
   * @param commandName - The name of the command.
   * @returns A SlashCommandBuilder or ContextMenuCommandBuilder instance.
   */
  build: (
    commandName: string,
  ) => T extends CommandType.SLASH
    ? SlashCommandBuilder | SlashCommandSubcommandsOnlyBuilder
    : T extends CommandType.CONTEXT_MENU
      ? ContextMenuCommandBuilder
      : never
}

export type CommandBuilderConstructor<T extends CommandType.SLASH | CommandType.CONTEXT_MENU> =
  new () => CommandBuilderBase<T>

/**
 * Command metadata describing a registered command method.
 */
export interface CommandMetadata<T extends string = string> {
  methodName: string
  builder: ReturnType<CommandBuilderBase['build']> | undefined
  type: CommandType
  regex?: RegExp
  dynamicParams?: T[]
}

export type CommandInteractionType<
  CBC extends CommandType.SLASH | CommandType.CONTEXT_MENU,
  T extends CommandBuilderConstructor<CBC> | CommandType,
> = T extends CommandType.BUTTON
  ? ButtonInteraction
  : T extends CommandType.SELECT_MENU
    ? StringSelectMenuInteraction
    : T extends CommandBuilderConstructor<CommandType.SLASH>
      ? ChatInputCommandInteraction
      : T extends CommandBuilderConstructor<CommandType.CONTEXT_MENU>
        ? UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction
        : T extends CommandType.MODAL_SUBMIT
          ? ModalSubmitInteraction
          : never
