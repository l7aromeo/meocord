import 'reflect-metadata'
import { makeInjectable } from '@src/util/injectable.util.js'
import { type ServiceIdentifier } from 'inversify'
import { type ActivityOptions, type ClientOptions } from 'discord.js'
import { MetadataKey } from '@src/enum/index.js'

/**
 * Declares the MeoCord application class: its controllers, services, client options and activities.
 *
 * The options are stored as metadata; `MeoCordFactory.create()` builds the application from them.
 *
 * @param options.controllers - Controllers to register.
 * @param options.clientOptions - Options for the discord.js `Client`.
 * @param options.activities - Activities the bot rotates through, if any.
 * @param options.services - Services to register that no controller depends on.
 *
 * @example
 * ```typescript
 * @MeoCord({
 *   controllers: [PingSlashController],
 *   clientOptions: {
 *     intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
 *   },
 *   activities: [{ name: 'with slash commands', type: ActivityType.Playing }],
 * })
 * class App {}
 * ```
 */
export function MeoCord(options: {
  controllers: ServiceIdentifier[]
  clientOptions: ClientOptions
  activities?: ActivityOptions[]
  services?: ServiceIdentifier[]
}): (target: any) => void {
  return (target: any): void => {
    makeInjectable(target)

    Reflect.defineMetadata(MetadataKey.AppOptions, options, target)
  }
}
