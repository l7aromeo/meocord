import 'reflect-metadata'
import { MetadataKey } from '@src/enum/index.js'
import { type BuildableCommandType, type CommandBuilderBase } from '@src/interface/command-decorator.interface.js'
import { makeInjectable } from '@src/util/injectable.util.js'
import { type CommandBuilderOptions } from '@src/interface/index.js'

/** Where a builder class keeps its `guilds` option, for `@Command` to copy into the handler's metadata. */
export const BUILDER_GUILDS = Symbol('meocord:builder-guilds')

/**
 * Marks a class as the builder for a Discord command, for use with `@Command`.
 *
 * @param commandType - The type of command the class builds.
 * @param options - `guilds` registers this command to those guilds only, in place of the configured
 *   scope. It is read when the class is decorated, which is after `meocord.config.ts` has loaded `.env`.
 *
 * @example
 * ```typescript
 * @CommandBuilder(CommandType.SLASH)
 * export class PingCommandBuilder implements CommandBuilderBase {
 *   build(commandName: string): SlashCommandBuilder {
 *     return new SlashCommandBuilder().setName(commandName).setDescription('Replies with pong')
 *   }
 * }
 *
 * @CommandBuilder(CommandType.SLASH, { guilds: [process.env.STAFF_GUILD_ID] })
 * export class BanCommandBuilder implements CommandBuilderBase {
 *   build(commandName: string): SlashCommandBuilder {
 *     return new SlashCommandBuilder().setName(commandName).setDescription('Bans a member')
 *   }
 * }
 * ```
 */
export function CommandBuilder<T extends BuildableCommandType>(commandType: T, options: CommandBuilderOptions = {}) {
  return function (target: new () => CommandBuilderBase<T>) {
    makeInjectable(target)

    // Define the command type metadata for the target class
    Reflect.defineMetadata(
      MetadataKey.CommandType,
      commandType,
      target as unknown as CommandBuilderBase<T> & { commandType: string },
    )

    if (options.guilds) Reflect.defineMetadata(BUILDER_GUILDS, [...options.guilds], target)
  }
}
