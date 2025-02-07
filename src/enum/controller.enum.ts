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

export enum ControllerType {
  BUTTON = 'button',
  MODAL_SUBMIT = 'modal-submit',
  SELECT_MENU = 'select-menu',
  REACTION = 'reaction',
  SLASH = 'slash',
  CONTEXT_MENU = 'context-menu',
}

export enum CommandType {
  SLASH = 'SLASH',
  BUTTON = 'BUTTON',
  CONTEXT_MENU = 'CONTEXT_MENU',
  SELECT_MENU = 'SELECT_MENU',
  MESSAGE = 'MESSAGE',
  MODAL_SUBMIT = 'MODAL_SUBMIT',
}
