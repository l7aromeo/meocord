/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import {
  ApplicationCommandOptionType,
  type AutocompleteInteraction,
  ButtonInteraction,
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  type CommandInteractionOption,
  ContextMenuCommandInteraction,
  type Interaction,
  MentionableSelectMenuInteraction,
  MessageComponentInteraction,
  ModalSubmitInteraction,
  PrimaryEntryPointCommandInteraction,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction,
  UserSelectMenuInteraction,
} from 'discord.js'
import { CommandType } from '@src/enum/controller.enum.js'

/**
 * The discord.js class each command type is handled by.
 *
 * One table rather than a chain of `isButton() || isStringSelectMenu() || ...`: the
 * registration guard in `@Command`, the dispatcher, and the type-level
 * `CommandInteractionType` all have to agree on what a command type accepts, and a
 * chain repeated in three files drifts the moment a fifth select menu appears. Adding
 * a `CommandType` member without an entry here is a compile error, not a silent
 * fall-through to "Command not found!".
 */
const INTERACTION_MATCHERS: Record<CommandType, (interaction: unknown) => boolean> = {
  [CommandType.SLASH]: interaction => interaction instanceof ChatInputCommandInteraction,
  [CommandType.CONTEXT_MENU]: interaction => interaction instanceof ContextMenuCommandInteraction,
  [CommandType.PRIMARY_ENTRY_POINT]: interaction => interaction instanceof PrimaryEntryPointCommandInteraction,
  [CommandType.BUTTON]: interaction => interaction instanceof ButtonInteraction,
  [CommandType.SELECT_MENU]: interaction => interaction instanceof StringSelectMenuInteraction,
  [CommandType.USER_SELECT_MENU]: interaction => interaction instanceof UserSelectMenuInteraction,
  [CommandType.ROLE_SELECT_MENU]: interaction => interaction instanceof RoleSelectMenuInteraction,
  [CommandType.MENTIONABLE_SELECT_MENU]: interaction => interaction instanceof MentionableSelectMenuInteraction,
  [CommandType.CHANNEL_SELECT_MENU]: interaction => interaction instanceof ChannelSelectMenuInteraction,
  [CommandType.MODAL_SUBMIT]: interaction => interaction instanceof ModalSubmitInteraction,
}

/** Command types Discord identifies by a registered name rather than by a customId. */
const NAME_ROUTED_TYPES: ReadonlySet<CommandType> = new Set([
  CommandType.SLASH,
  CommandType.CONTEXT_MENU,
  CommandType.PRIMARY_ENTRY_POINT,
])

/**
 * Whether an interaction is the kind the given command type handles.
 *
 * @param type - The command type declared on `@Command`.
 * @param interaction - The interaction being dispatched.
 */
export function matchesCommandType(type: CommandType, interaction: unknown): boolean {
  const matches = INTERACTION_MATCHERS[type]
  return matches !== undefined && matches(interaction)
}

/**
 * Whether the command type is routed by matching a customId pattern.
 *
 * Components carry an application-defined customId and so are matched by pattern;
 * commands carry a name Discord itself registered and are matched exactly.
 *
 * @param type - The command type declared on `@Command`.
 */
export function isCustomIdRouted(type: CommandType): boolean {
  return !NAME_ROUTED_TYPES.has(type)
}

/** The interactions that carry an application-defined customId. */
export type CustomIdInteraction = Extract<Interaction, { customId: string }>

/**
 * Whether an interaction carries a customId, and so can be routed by pattern.
 *
 * @param interaction - The interaction being dispatched.
 */
export function hasCustomId(interaction: Interaction): interaction is CustomIdInteraction {
  return interaction instanceof MessageComponentInteraction || interaction instanceof ModalSubmitInteraction
}

/** Separates a command from its subcommand group and subcommand in a route key. */
export const COMMAND_PATH_SEPARATOR = ' '

/**
 * The route keys a chat input interaction can be handled by, most specific first.
 *
 * Discord sends `/settings notify email` as one interaction named `settings`, so
 * routing on `commandName` alone gives every subcommand of a command the same handler
 * — and the framework would run whichever one was declared first. The full path is
 * tried before the bare name so a command can either split its subcommands across
 * methods or keep handling them in one, but never both by accident.
 *
 * A group is never dropped on the way down: `settings notify email` does not fall back
 * to `settings email`, because a second group could declare its own `email` and the
 * two would be indistinguishable.
 *
 * @param interaction - The chat input or autocomplete interaction being dispatched.
 * @returns The keys to look up, most specific first.
 */
export function resolveCommandPaths(interaction: ChatInputCommandInteraction | AutocompleteInteraction): string[] {
  const { commandName } = interaction
  const options = interaction.options as Partial<ChatInputCommandInteraction['options']> | undefined

  // Guarded rather than called directly: `options` is a stub on a hand-built test
  // double, and an interaction whose command has no subcommands still has to route.
  const group = typeof options?.getSubcommandGroup === 'function' ? options.getSubcommandGroup(false) : null
  const sub = typeof options?.getSubcommand === 'function' ? options.getSubcommand(false) : null

  const path = [commandName, group, sub].filter((part): part is string => Boolean(part))
  const full = path.join(COMMAND_PATH_SEPARATOR)

  return full === commandName ? [commandName] : [full, commandName]
}

/** Options that only wrap other options; their values live one level down. */
const NESTING_OPTION_TYPES: ReadonlySet<ApplicationCommandOptionType> = new Set([
  ApplicationCommandOptionType.Subcommand,
  ApplicationCommandOptionType.SubcommandGroup,
])

/**
 * The value a handler should receive for one option.
 *
 * Discord sends entity options as a snowflake plus a `resolved` payload, and discord.js
 * puts that payload on the option as `user`/`role`/`channel`/`attachment`. Passing
 * `value` alone would hand the handler a bare id string for `@user`, forcing every
 * handler to re-fetch what the gateway already delivered.
 */
function resolveOptionValue(option: CommandInteractionOption): unknown {
  return option.attachment ?? option.channel ?? option.role ?? option.user ?? option.member ?? option.value
}

/**
 * Flattens a chat input interaction's options into the params record handlers receive.
 *
 * Subcommand and subcommand-group options are containers, not values — for
 * `/settings notify email true` the top level holds only `notify`. Recursing past them
 * means a subcommand handler sees `{ email: true }`, the same shape a flat command's
 * handler sees.
 *
 * @param interaction - The chat input or autocomplete interaction being dispatched.
 * @returns Each supplied option keyed by name, with entity options resolved.
 */
export function resolveOptionParams(
  interaction: ChatInputCommandInteraction | AutocompleteInteraction,
): Record<string, unknown> {
  const data = interaction.options?.data
  if (!Array.isArray(data)) return {}

  const params: Record<string, unknown> = {}

  const walk = (options: readonly CommandInteractionOption[]): void => {
    for (const option of options) {
      if (NESTING_OPTION_TYPES.has(option.type)) {
        walk(option.options ?? [])
        continue
      }
      params[option.name] = resolveOptionValue(option)
    }
  }

  walk(data)
  return params
}

/**
 * The name of the option the user is currently typing, or `undefined`.
 *
 * `getFocused` throws when nothing is focused rather than returning null, and it is
 * absent altogether on a hand-built test double. Neither is worth failing a dispatch
 * over — an autocomplete with no focused option simply matches no option-specific
 * handler.
 *
 * @param interaction - The autocomplete interaction being dispatched.
 */
export function focusedOptionName(interaction: AutocompleteInteraction): string | undefined {
  if (typeof interaction.options?.getFocused !== 'function') return undefined

  try {
    return interaction.options.getFocused(true)?.name
  } catch {
    return undefined
  }
}

/**
 * Identifies an interaction in a log line, by whichever field would have routed it.
 *
 * @param interaction - The interaction that matched no handler.
 */
export function describeInteraction(interaction: Interaction): string {
  // Captured before the narrowing below: the guards cover every member of the union,
  // so by the fallback `interaction` is `never` and nothing can be read off it.
  const { type } = interaction

  if (interaction.isAutocomplete()) {
    const path = resolveCommandPaths(interaction)[0]
    const focused = focusedOptionName(interaction)
    return focused === undefined ? `autocomplete for "${path}"` : `autocomplete for "${path}" option "${focused}"`
  }
  if (interaction.isChatInputCommand()) {
    return `command "${resolveCommandPaths(interaction)[0]}"`
  }
  if (interaction.isContextMenuCommand() || interaction.isPrimaryEntryPointCommand()) {
    return `command "${interaction.commandName}"`
  }
  if (hasCustomId(interaction)) {
    return `customId "${interaction.customId}"`
  }
  return `interaction type ${type}`
}
