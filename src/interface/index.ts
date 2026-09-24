import { BaseInteraction, type Client, Message, MessageReaction, type PartialUser, User } from 'discord.js'
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
 * Class-level and global guards also run before `@Autocomplete` handlers, where they receive an
 * `AutocompleteInteraction` and `ExecutionContext.getType()` is `'autocomplete'`. A guard must not
 * reply there: returning `false` denies, and the menu is closed with an empty list.
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

/** The second argument `onReady` receives. */
export interface ReadyInfo {
  /**
   * Whether this process should do one-off work, such as starting a scheduler that must run once.
   * `true` for a bot running in one process.
   */
  primary: boolean
}

/**
 * A controller or service that does work once the bot is online, such as starting timers or
 * warming a cache.
 *
 * Called on every controller and service the app binds, including services no handler has used
 * yet, after the client is ready. Hooks run one at a time in dependency order, so a service's hook
 * runs after the hooks of the services it injects. Command registration runs alongside and never
 * delays them. A hook that throws is logged and the next one still runs.
 *
 * @example
 * ```ts
 * @Service()
 * export class ReminderScheduler implements OnReady {
 *   async onReady(client: Client<true>, { primary }: ReadyInfo) {
 *     if (primary) this.start()
 *   }
 * }
 * ```
 */
export interface OnReady {
  /**
   * Runs once the client is ready.
   *
   * @param client - The ready Discord client.
   * @param info - Facts about this process, such as whether it should do one-off work.
   */
  onReady(client: Client<true>, info: ReadyInfo): Promise<void> | void
}

/**
 * A controller or service that cleans up before the bot stops, such as stopping timers or flushing
 * writes.
 *
 * Called on SIGINT or SIGTERM, before the client is destroyed, and only if `onReady` hooks ran. Hooks
 * run one at a time in reverse dependency order, so a service stops before the services it injects.
 * The whole sequence is limited by `shutdownTimeout` in `meocord.config.ts`; the process then exits
 * whether or not it finished. A hook that throws is logged and the next one still runs.
 *
 * @example
 * ```ts
 * @Service()
 * export class ReminderScheduler implements OnShutdown {
 *   async onShutdown() {
 *     this.stop()
 *   }
 * }
 * ```
 */
export interface OnShutdown {
  /** Runs before the client is destroyed. */
  onShutdown(): Promise<void> | void
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
  /**
   * How long, in milliseconds, shutdown waits for the `onShutdown` hooks before destroying the client
   * anyway. The limit covers every hook together, not each one.
   *
   * @defaultValue `10_000`
   */
  shutdownTimeout?: number
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
