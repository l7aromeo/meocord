import { BaseInteraction, Message, MessageReaction, type PartialUser, User } from 'discord.js'
import { type RsbuildConfig } from '@rsbuild/core'

/**
 * Rsbuild's configuration type, as the `rsbuild` hook receives it. Import it from here to type a
 * helper for that hook without depending on `@rsbuild/core`.
 */
export type { RsbuildConfig }
import { ReactionHandlerAction } from '@src/enum/controller.enum.js'

/**
 * A guard, run by `@UseGuard` before a handler to decide whether it may run.
 *
 * @example
 * ```ts
 * @Guard()
 * export class OwnerOnlyGuard implements GuardInterface {
 *   canActivate(interaction: ButtonInteraction, { ownerId }: { ownerId: string }): boolean {
 *     return interaction.user.id === ownerId
 *   }
 * }
 * ```
 */
export interface GuardInterface {
  /**
   * Decides whether the guarded handler runs.
   *
   * @param context - The interaction, message or reaction being handled.
   * @param args - The handler's remaining arguments, such as the params parsed from a customId.
   * @returns `true` to run the handler, `false` to skip it.
   */
  canActivate(context: BaseInteraction | Message | MessageReaction, ...args: any[]): Promise<boolean> | boolean
}

/** The second argument a `@ReactionHandler` method receives. */
export interface ReactionHandlerOptions {
  /** The user who added or removed the reaction. */
  user: User | PartialUser
  /** Whether the reaction was added or removed. */
  action: ReactionHandlerAction
}

/**
 * The configuration `meocord.config.ts` exports.
 *
 * @example
 * ```ts
 * import 'dotenv/config'
 * import { type MeoCordConfig } from 'meocord/interface'
 *
 * export default {
 *   appName: 'My Bot',
 *   discordToken: process.env.DISCORD_TOKEN!,
 * } satisfies MeoCordConfig
 * ```
 */
export interface MeoCordConfig {
  /** Shown as a prefix on every log line. Omitted when unset. */
  appName?: string
  /** The Discord bot token. Read it from the environment rather than committing it. */
  discordToken: string
  /**
   * Bundles everything the bot needs into `dist`, so it runs without `node_modules`.
   *
   * Native addons such as `sharp` are copied with their platform binary into `dist/node_modules`.
   * A build with native addons only starts on the platform it was built on.
   *
   * @defaultValue `false`
   */
  bundleDependencies?: boolean
  /**
   * Modules to keep out of the bundle. With {@link bundleDependencies}, listed package names are
   * copied into `dist/node_modules`; native addons are found without being listed.
   *
   * @example
   * ```ts
   * externals: ['@opentelemetry/api']
   * ```
   */
  externals?: (string | RegExp)[]
  /**
   * Customises the Rsbuild configuration the bot is built with.
   *
   * Images, fonts, svg and media need no rules. Raw bundler rules go through `tools.rspack`.
   *
   * @param config - The configuration MeoCord builds with.
   * @returns The modified configuration, or `undefined` to keep it as is.
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
