/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { injectable, type ServiceIdentifier } from 'inversify'
import { type ActivityOptions, type ClientOptions } from 'discord.js'
import { MetadataKey } from '@src/enum/index.js'

/**
 * `@MeoCord()` decorator for declaring the MeoCord application class.
 *
 * This decorator stores the application options as metadata on the class.
 * All DI wiring — container creation, client binding, controller/service
 * registration — happens inside `MeoCordFactory.create()`, not here.
 *
 * @param {Object} options - The decorator options.
 * @param {ServiceIdentifier[]} options.controllers - The list of controllers to be registered.
 * @param {ClientOptions} options.clientOptions - The Discord client options for initializing the bot.
 * @param {ActivityOptions[]} [options.activities] - Optional activities for the bot.
 * @param {ServiceIdentifier[]} [options.services] - Optional services to be registered.
 *
 * @example
 * ```typescript
 * @MeoCord({
 *   controllers: [PingSlashController],
 *   clientOptions: {
 *     intents: [
 *       GatewayIntentBits.Guilds,
 *       GatewayIntentBits.GuildMembers,
 *       GatewayIntentBits.GuildMessages,
 *       GatewayIntentBits.GuildMessageReactions,
 *       GatewayIntentBits.MessageContent,
 *     ],
 *     partials: [Partials.Message, Partials.Channel, Partials.Reaction],
 *   },
 *   activities: [{
 *       name: `${sample(['Genshin', 'ZZZ'])} with Romeo`,
 *       type: ActivityType.Playing,
 *       url: 'https://enka.network/u/824957678/',
 *   }],
 *   services: [MyStandaloneService],
 * })
 * class MyApp {}
 * ```
 **/
export function MeoCord(options: {
  controllers: ServiceIdentifier[]
  clientOptions: ClientOptions
  activities?: ActivityOptions[]
  services?: ServiceIdentifier[]
}): (target: any) => void {
  return (target: any): void => {
    if (!Reflect.hasMetadata(MetadataKey.Injectable, target)) {
      injectable()(target)
    }

    Reflect.defineMetadata(MetadataKey.AppOptions, options, target)
  }
}
