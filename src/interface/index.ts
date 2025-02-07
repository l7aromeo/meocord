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

import { BaseInteraction } from 'discord.js'
import { Configuration } from 'webpack'

/**
 * Interface for Guard classes.
 * Guards are used to handle permission checks before executing a method.
 * Each guard must implement the `canActivate` method, which is responsible for determining
 * whether the method should be allowed to execute based on the provided interaction and arguments.
 */
export interface GuardInterface {
  /**
   * Determines if the method should be allowed to execute based on the interaction and additional arguments.
   * @param interaction - The interaction object, typically representing a user action in Discord.
   * @param args - Additional arguments that might be required for the guard's logic.
   * @returns A `Promise` resolving to `true` if the method can proceed, otherwise `false`,
   *          or a `boolean` value directly.
   */
  canActivate(interaction: BaseInteraction, ...args: any[]): Promise<boolean> | boolean
}

/**
 * Configuration interface for the MeoCord application.
 * This interface defines optional configurations for the application, including
 * application metadata and Webpack configuration overrides.
 */
export interface MeoCordConfig {
  /**
   * The name of the application.
   * Defaults to 'MeoCord' if not specified.
   */
  appName?: string
  /**
   * Function to customize the Webpack configuration.
   * Provides the ability to override and extend the default Webpack setup.
   * @param config - Optional callback function to modify the Webpack configuration.
   * @returns A modified Webpack configuration or undefined.
   */
  webpack?: (config?: (config?: Configuration) => Configuration) => Configuration | undefined
}
