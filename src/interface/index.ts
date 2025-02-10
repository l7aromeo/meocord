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

import { BaseInteraction, PartialUser, User } from 'discord.js'
import { Configuration, RuleSetRule } from 'webpack'
import { ReactionHandlerAction } from '@src/enum/controller.enum'

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
 * Interface for handling reactions in a Discord message.
 */
export interface ReactionHandlerOptions {
  /** The user object, which can be either a full or partial user. */
  user: User | PartialUser
  /** The action performed on the reaction, such as adding or removing it. */
  action: ReactionHandlerAction
}

/**
 * Interface representing the Webpack configuration for MeoCord.
 * Extends the base Webpack Configuration interface with additional properties.
 */
export interface MeoCordWebpackConfig extends Configuration {
  /** The mode in which Webpack should run: 'development', 'production', or 'none'. */
  mode: Configuration['mode']
  /** The entry point for the application. */
  entry: string
  optimization: Configuration['optimization'] & {
    /** Whether to minimize the output. */
    minimize: boolean
    /** Array of minimizer plugins to use. */
    minimizer: NonNullable<Configuration['optimization']>['minimizer']
  }
  externals: Configuration['externals']
  module: Configuration['module'] & {
    /** Array of rules for module resolution. */
    rules: RuleSetRule[]
  }
  resolve: Configuration['resolve'] & {
    /** Array of file extensions to resolve. */
    extensions: NonNullable<NonNullable<Configuration['resolve']>['extensions']>
    /** Array of plugins to use for resolving modules. */
    plugins: NonNullable<NonNullable<Configuration['resolve']>['plugins']>
  }
  /** Output configuration for Webpack. Excludes 'path', 'publicPath', and 'filename' to prevent overwriting. */
  output: Omit<NonNullable<Configuration['output']>, 'path' | 'publicPath' | 'filename'>
  stats: Configuration['stats']
}

/**
 * Configuration interface for the MeoCord application.
 * This interface defines optional configurations for the application, including
 * metadata, authentication tokens, and Webpack configuration overrides.
 */
export interface MeoCordConfig {
  /**
   * The name of the application.
   * If not specified, it defaults to 'MeoCord'.
   */
  appName?: string
  /**
   * The Discord bot token used for authenticating with the Discord API.
   */
  discordToken: string
  /**
   * Function to customize the Webpack configuration.
   * Allows overriding and extending the default Webpack setup for the application.
   * @param config - A callback function to modify the existing Webpack configuration.
   * @returns A modified Webpack configuration or `undefined` if no customization is needed.
   */
  webpack?: (config: MeoCordWebpackConfig) => Configuration | undefined
}
