/**
 * MeoCord Framework
 * Copyright (c) 2025-present Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { BaseInteraction, Message, MessageReaction, type PartialUser, User } from 'discord.js'
import { type RsbuildConfig } from '@rsbuild/core'
import { ReactionHandlerAction } from '@src/enum/controller.enum.js'

/**
 * Interface for Guard classes.
 * Guards are used to handle permission checks before executing a method.
 * Each guard must implement the `canActivate` method, which is responsible for determining
 * whether the method should be allowed to execute based on the provided context (Interaction, Message, or Reaction) and arguments.
 */
export interface GuardInterface {
  /**
   * Determines if the method should be allowed to execute based on the context (Interaction, Message, or Reaction) and additional arguments.
   * @param context - The context object, typically representing a user action in Discord (Interaction, Message, or Reaction).
   * @param args - Additional arguments that might be required for the guard's logic.
   * @returns A `Promise` resolving to `true` if the method can proceed, otherwise `false`,
   *          or a `boolean` value directly.
   */
  canActivate(context: BaseInteraction | Message | MessageReaction, ...args: any[]): Promise<boolean> | boolean
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
 * Configuration interface for the MeoCord application.
 * This interface defines optional configurations for the application, including
 * metadata, authentication tokens, and bundler configuration overrides.
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
   * Bundle production dependencies into the build output.
   *
   * Off by default, matching how the build has always behaved: dependencies stay runtime
   * imports, so `dist` needs `node_modules` beside it to run. Turn it on to produce output
   * that runs on its own, which is what a container image with no install step wants.
   *
   * Native addons are the exception and cannot be bundled -- a `.node` binary is not
   * JavaScript and is built for a single platform -- so list anything reaching one in
   * {@link externals} and install those in production.
   */
  bundleDependencies?: boolean
  /**
   * Modules to leave as runtime imports even when {@link bundleDependencies} is on.
   *
   * @example
   * ```ts
   * // sharp ships a platform-specific .node binary and cannot be bundled.
   * externals: ['sharp']
   * ```
   */
  externals?: (string | RegExp)[]
  /**
   * Function to customize the Rsbuild configuration.
   * Allows overriding and extending the default bundler setup for the application.
   *
   * Replaces the former `webpack` hook. Rsbuild handles images, fonts, svg and media itself,
   * so rules for those are no longer needed; `output.distPath` controls where they land. Raw
   * bundler rules remain reachable through `tools.rspack`, which takes a webpack-shaped
   * config.
   *
   * @param config - The configuration to modify.
   * @returns A modified configuration, or `undefined` to keep the default.
   */
  rsbuild?: (config: RsbuildConfig) => RsbuildConfig | undefined
}

export type {
  AutocompleteMetadata,
  BuildableCommandType,
  CommandBuilderBase,
  CommandBuildResult,
  CommandBuilderConstructor,
  CommandInteractionType,
  CommandMetadata,
} from './command-decorator.interface.js'
