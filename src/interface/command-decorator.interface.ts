import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  ContextMenuCommandInteraction,
  MessageContextMenuCommandInteraction,
  ModalSubmitInteraction,
  SlashCommandBuilder,
  StringSelectMenuInteraction,
  UserContextMenuCommandInteraction,
} from 'discord.js'
import { CommandType } from '@src/enum'

/**
 * Base interface for a command builder.
 */
export interface CommandBuilderBase {
  /**
   * Builds the command structure using the specified command name.
   *
   * @param commandName - The name of the command.
   * @returns A SlashCommandBuilder or ContextMenuCommandBuilder instance.
   */
  build: (commandName: string) => SlashCommandBuilder | ContextMenuCommandBuilder
}

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

export type CommandInteractionType<T extends CommandType> = T extends CommandType.BUTTON
  ? ButtonInteraction
  : T extends CommandType.SELECT_MENU
    ? StringSelectMenuInteraction
    : T extends CommandType.SLASH
      ? ChatInputCommandInteraction
      : T extends CommandType.CONTEXT_MENU
        ? ContextMenuCommandInteraction | UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction
        : T extends CommandType.MODAL_SUBMIT
          ? ModalSubmitInteraction
          : never
