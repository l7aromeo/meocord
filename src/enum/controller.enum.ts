/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

export enum ControllerType {
  BUTTON = 'button',
  MODAL_SUBMIT = 'modal-submit',
  SELECT_MENU = 'select-menu',
  REACTION = 'reaction',
  MESSAGE = 'message',
  SLASH = 'slash',
  CONTEXT_MENU = 'context-menu',
}

export enum CommandType {
  SLASH = 'SLASH',
  BUTTON = 'BUTTON',
  CONTEXT_MENU = 'CONTEXT_MENU',
  SELECT_MENU = 'SELECT_MENU',
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
