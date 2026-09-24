import { BaseInteraction, type Client, Message, MessageReaction, type PartialUser, User } from 'discord.js'
import { type RsbuildConfig } from '@rsbuild/core'

/**
 * Rsbuild's configuration type, as the `rsbuild` hook receives it. Import it from here to type a
 * helper for that hook without depending on `@rsbuild/core`.
 */
export type { RsbuildConfig }
import { ReactionHandlerAction } from '@src/enum/controller.enum.js'
import { type ExecutionContext } from '@src/common/execution-context.js'

/**
 * A guard, run by `@UseGuard` before a handler to decide whether it may run.
 *
 * Class-level and global guards also run before `@Autocomplete` handlers, where they receive an
 * `AutocompleteInteraction` and `ExecutionContext.getType()` is `'autocomplete'`. A guard must not
 * reply there: returning `false` denies, and the menu is closed with an empty list.
 *
 * Before an `@On` or `@Once` handler, a guard receives the event's arguments, such as a `GuildMember`
 * for `guildMemberAdd`, and `ExecutionContext.getType()` is `'event'`. Global guards run there too;
 * `@Guard({ types })` limits a guard to the context types it is written for.
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
   * @param context - The interaction, message or reaction being handled, or an event's first argument.
   * @param args - The handler's remaining arguments, such as the params parsed from a customId.
   * @returns `true` to run the handler, `false` to skip it.
   */
  canActivate(context: BaseInteraction | Message | MessageReaction | unknown, ...args: any[]): Promise<boolean> | boolean
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

/**
 * Runs the rest of the pipeline from inside an interceptor: the next interceptor, then the handler.
 */
export interface CallHandler {
  /**
   * Continues the call. Call it at most once: each call runs the rest of the pipeline, and the
   * handler, again.
   *
   * @returns What the handler returns, once it has run. Rejects with what the handler throws.
   */
  handle(): Promise<unknown>
}

/**
 * An interceptor, run by `@UseInterceptor` around a handler after its guards allow the call.
 *
 * It receives the call's `ExecutionContext` as an argument and continues with `next.handle()`, called
 * at most once, since each call runs the handler again. It can act before and after the handler, skip
 * the handler by not calling `next.handle()`, or catch and replace the error the handler throws. One
 * instance is shared across calls, so keep per-call state in local variables, and read
 * `{ provide, params }` through `context.getParams()`.
 *
 * Global interceptors also run around `@On` and `@Once` event handlers; `@Interceptor({ types })`
 * limits an interceptor to the context types it is written for.
 *
 * @example
 * ```ts
 * @Interceptor()
 * export class TimingInterceptor implements InterceptorInterface {
 *   private readonly logger = new Logger(TimingInterceptor.name)
 *
 *   async intercept(context: ExecutionContext, next: CallHandler): Promise<unknown> {
 *     const started = performance.now()
 *     try {
 *       return await next.handle()
 *     } finally {
 *       this.logger.log(`${context.getHandlerName()} took ${Math.round(performance.now() - started)} ms`)
 *     }
 *   }
 * }
 * ```
 */
export interface InterceptorInterface {
  /**
   * Runs around the handler.
   *
   * @param context - The call being handled: its arguments, controller, handler and metadata.
   * @param next - Continues with the next interceptor, then the handler.
   * @returns What the call returns: usually the result of `next.handle()`.
   */
  intercept(context: ExecutionContext, next: CallHandler): Promise<unknown> | unknown
}

/**
 * An exception filter, applied with `@UseFilter` or `@MeoCord({ filters })`, that handles the errors its
 * `@Catch` names: from the handler, its interceptors and guards, or dispatch itself.
 *
 * The filter closest to the handler wins: method filters, then the controller's, then global ones;
 * within one level, the first whose `@Catch` matches. When none matches, the built-in fallback logs
 * the error and tells the user something went wrong. One instance is shared across calls.
 *
 * @example
 * ```ts
 * @Catch(RateLimitedError)
 * export class RateLimitedFilter implements ExceptionFilter<RateLimitedError> {
 *   async catch(error: RateLimitedError, context: ExecutionContext) {
 *     const interaction = context.getInteraction()
 *     if (interaction?.isRepliable() && !interaction.replied && !interaction.deferred) {
 *       await interaction.reply({ content: `Slow down: try again in ${error.retryAfter}s.`, flags: MessageFlags.Ephemeral })
 *     }
 *   }
 * }
 * ```
 */
export interface ExceptionFilter<E = unknown> {
  /**
   * Handles an error. Returning ends the call; throwing is logged, and the built-in fallback then
   * answers the original error.
   *
   * @param error - The error thrown, of a type the filter's `@Catch` names.
   * @param context - The call that failed. For an interaction no handler was reached for, it has
   *   no controller or handler.
   */
  catch(error: E, context: ExecutionContext): Promise<void> | void
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

  /**
   * Where the bot registers its application commands, and whether it does so at startup.
   *
   * @defaultValue Every command registered globally, each time the bot starts.
   */
  commands?: CommandRegistrationConfig
}

/**
 * Where and whether MeoCord registers the application's commands with Discord.
 *
 * Registration replaces the commands in each scope it sends to with exactly the ones the bot
 * declares. Global commands can take a while to show up in clients; guild commands appear at once,
 * which is what a development guild is for.
 *
 * @example
 * ```ts
 * commands: {
 *   developmentGuild: process.env.DEV_GUILD_ID || undefined,
 * }
 * ```
 */
export interface CommandRegistrationConfig {
  /**
   * Guilds to register every command to instead of globally. Unset or empty registers globally.
   * A builder's own `guilds` option takes precedence for its command.
   */
  guilds?: string[]
  /**
   * A guild that receives every command, and nothing else does, while `NODE_ENV` is `development` —
   * as under `meocord start --dev`. Ignored in production.
   */
  developmentGuild?: string
  /**
   * Whether the bot registers its commands when it starts. Set `false` to register only with
   * `meocord register`, from CI for instance.
   *
   * @defaultValue `true`
   */
  register?: boolean
  /**
   * Whether to remove this application's commands from the scopes this configuration names but is
   * not registering to, such as the global commands left behind after moving to `guilds`. Without it,
   * such leftovers are reported as a warning. If development and production share one application,
   * this deletes production's commands whenever the development build registers.
   *
   * @defaultValue `false`
   */
  clearOther?: boolean
}

/**
 * Options for `@CommandBuilder`.
 *
 * @example
 * ```ts
 * @CommandBuilder(CommandType.SLASH, { guilds: [process.env.STAFF_GUILD_ID!] })
 * ```
 */
export interface CommandBuilderOptions {
  /**
   * Guilds this command is registered to, in place of the configured scope. A command whose list is
   * empty after dropping blank ids is not registered at all, rather than falling back to global.
   * Under a development guild, it goes there with every other command.
   */
  guilds?: (string | undefined)[]
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
