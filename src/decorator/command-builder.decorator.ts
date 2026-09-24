import 'reflect-metadata'
import { makeInjectable } from '@src/util/injectable.util.js'
import { MetadataKey } from '@src/enum/index.js'
import { type BuildableCommandType, type CommandBuilderBase } from '@src/interface/command-decorator.interface.js'

/**
 * Marks a class as the builder for a Discord command, for use with `@Command`.
 *
 * @param commandType - The type of command the class builds.
 *
 * @example
 * ```typescript
 * @CommandBuilder(CommandType.SLASH)
 * export class PingCommandBuilder implements CommandBuilderBase {
 *   build(commandName: string): SlashCommandBuilder {
 *     return new SlashCommandBuilder().setName(commandName).setDescription('Replies with pong')
 *   }
 * }
 * ```
 */
export function CommandBuilder<T extends BuildableCommandType>(commandType: T) {
  return function (target: new () => CommandBuilderBase<T>) {
    makeInjectable(target)

    // Define the command type metadata for the target class
    Reflect.defineMetadata(
      MetadataKey.CommandType,
      commandType,
      target as unknown as CommandBuilderBase<T> & { commandType: string },
    )
  }
}
