/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

export enum ControllerType {
  BUTTON = 'button',
  MODAL_SUBMIT = 'modal-submit',
  SELECT_MENU = 'select-menu',
  USER_SELECT_MENU = 'user-select-menu',
  ROLE_SELECT_MENU = 'role-select-menu',
  MENTIONABLE_SELECT_MENU = 'mentionable-select-menu',
  CHANNEL_SELECT_MENU = 'channel-select-menu',
  REACTION = 'reaction',
  MESSAGE = 'message',
  SLASH = 'slash',
  AUTOCOMPLETE = 'autocomplete',
  CONTEXT_MENU = 'context-menu',
  PRIMARY_ENTRY_POINT = 'primary-entry-point',
}

/**
 * The kinds of interaction a `@Command` method can be bound to.
 *
 * Each member names one Discord interaction shape rather than a family of them, so a
 * handler's parameter type follows from its command type alone. That is why the four
 * entity select menus are separate members instead of one `SELECT_MENU`: Discord sends
 * them as distinct component types (5-8) carrying different resolved data, and
 * collapsing them would leave the handler with a union it has to re-narrow by hand.
 */
export enum CommandType {
  /** Chat input command, or one subcommand of it. */
  SLASH = 'SLASH',
  /** User or message context menu command. */
  CONTEXT_MENU = 'CONTEXT_MENU',
  /** Activity launch command (`ApplicationCommandType.PrimaryEntryPoint`). */
  PRIMARY_ENTRY_POINT = 'PRIMARY_ENTRY_POINT',
  BUTTON = 'BUTTON',
  /** String select menu — the one whose options the application defines itself. */
  SELECT_MENU = 'SELECT_MENU',
  USER_SELECT_MENU = 'USER_SELECT_MENU',
  ROLE_SELECT_MENU = 'ROLE_SELECT_MENU',
  MENTIONABLE_SELECT_MENU = 'MENTIONABLE_SELECT_MENU',
  CHANNEL_SELECT_MENU = 'CHANNEL_SELECT_MENU',
  MODAL_SUBMIT = 'MODAL_SUBMIT',
}

/**
 * Enum representing actions that can be performed on a message reaction.
 */
export enum ReactionHandlerAction {
  /** Reaction added to a message. */
  ADD = 'ADD',
  /** Reaction removed from a message. */
  REMOVE = 'REMOVE',
}
