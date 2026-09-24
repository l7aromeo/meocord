import {
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  MentionableSelectMenuInteraction,
  MessageContextMenuCommandInteraction,
  ModalSubmitInteraction,
  PrimaryEntryPointCommandInteraction,
  type RESTPostAPIPrimaryEntryPointApplicationCommandJSONBody,
  RoleSelectMenuInteraction,
  SlashCommandBuilder,
  StringSelectMenuInteraction,
  UserContextMenuCommandInteraction,
  UserSelectMenuInteraction,
  type SlashCommandOptionsOnlyBuilder,
  type SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js'
import { CommandType } from '@src/enum/index.js'

/**
 * The command types that are registered with Discord, and so need a builder.
 *
 * Components are addressed by a customId the application makes up, so they have
 * nothing to register; these three are published through `application.commands.set`.
 */
export type BuildableCommandType = CommandType.SLASH | CommandType.CONTEXT_MENU | CommandType.PRIMARY_ENTRY_POINT

/**
 * The body an entry point command is registered with.
 *
 * `description` is added back on top of the discord-api-types body: that type omits it
 * from every non-chat-input command, but the API accepts one for entry point commands
 * — Discord's own default activity command ships with it set.
 */
export type PrimaryEntryPointCommandData = RESTPostAPIPrimaryEntryPointApplicationCommandJSONBody & {
  description?: string
}

/**
 * The payload `build()` returns for a command type.
 *
 * - `SLASH`: a `SlashCommandBuilder`, including the narrowed forms chaining options or subcommands
 *   produces (`SlashCommandOptionsOnlyBuilder`, `SlashCommandSubcommandsOnlyBuilder`).
 * - `PRIMARY_ENTRY_POINT`: the raw REST body, since `@discordjs/builders` has no builder for it.
 */
export type CommandBuildResult<T extends BuildableCommandType> = T extends CommandType.SLASH
  ? SlashCommandBuilder | SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder
  : T extends CommandType.CONTEXT_MENU
    ? ContextMenuCommandBuilder
    : T extends CommandType.PRIMARY_ENTRY_POINT
      ? PrimaryEntryPointCommandData
      : never

/**
 * Base interface for a command builder.
 */
export interface CommandBuilderBase<T extends BuildableCommandType = BuildableCommandType> {
  /**
   * Builds the command structure using the specified command name.
   *
   * @param commandName - The name of the command.
   * @returns A builder instance, or a raw command body for entry point commands.
   */
  build: (commandName: string) => CommandBuildResult<T>
}

export type CommandBuilderConstructor<T extends BuildableCommandType> = new () => CommandBuilderBase<T>

/**
 * Command metadata describing a registered command method.
 */
export interface CommandMetadata<T extends string = string> {
  methodName: string
  builder: ReturnType<CommandBuilderBase['build']> | undefined
  type: CommandType
  regex?: RegExp
  dynamicParams?: T[]
  /**
   * How specific this pattern is; the highest wins when several routes match one customId, so
   * `gi-profile/summary/{ownerId}/{uid}` beats `gi-profile/{uuid}/{uid}` whatever the declaration order.
   */
  specificity?: number
  /** The builder's own `guilds` option, when it has one. */
  guilds?: (string | undefined)[]
}

/** Metadata describing one `@Autocomplete` handler. */
export interface AutocompleteMetadata {
  /** The command path the handler serves, e.g. `settings` or `settings notify email`. */
  commandPath: string
  /** The option it completes, or `undefined` to complete every option of that command. */
  optionName?: string
  methodName: string
}

/** The interaction class each non-buildable command type hands to its handler. */
interface ComponentInteractionMap {
  [CommandType.BUTTON]: ButtonInteraction
  [CommandType.SELECT_MENU]: StringSelectMenuInteraction
  [CommandType.USER_SELECT_MENU]: UserSelectMenuInteraction
  [CommandType.ROLE_SELECT_MENU]: RoleSelectMenuInteraction
  [CommandType.MENTIONABLE_SELECT_MENU]: MentionableSelectMenuInteraction
  [CommandType.CHANNEL_SELECT_MENU]: ChannelSelectMenuInteraction
  [CommandType.MODAL_SUBMIT]: ModalSubmitInteraction
  [CommandType.SLASH]: ChatInputCommandInteraction
  [CommandType.CONTEXT_MENU]: UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction
  [CommandType.PRIMARY_ENTRY_POINT]: PrimaryEntryPointCommandInteraction
}

export type CommandInteractionType<
  CBC extends BuildableCommandType,
  T extends CommandBuilderConstructor<CBC> | CommandType,
> =
  T extends CommandBuilderConstructor<CommandType.SLASH>
    ? ChatInputCommandInteraction
    : T extends CommandBuilderConstructor<CommandType.CONTEXT_MENU>
      ? UserContextMenuCommandInteraction | MessageContextMenuCommandInteraction
      : T extends CommandBuilderConstructor<CommandType.PRIMARY_ENTRY_POINT>
        ? PrimaryEntryPointCommandInteraction
        : T extends keyof ComponentInteractionMap
          ? ComponentInteractionMap[T]
          : never
