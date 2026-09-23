import 'reflect-metadata'
import { injectable } from 'inversify'
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
    // Check if the class is already injectable; if not, make it injectable dynamically
    if (!Reflect.hasMetadata(MetadataKey.Injectable, target)) {
      injectable()(target)
    }

    // Define the command type metadata for the target class
    Reflect.defineMetadata(
      MetadataKey.CommandType,
      commandType,
      target as unknown as CommandBuilderBase<T> & { commandType: string },
    )
  }
}
