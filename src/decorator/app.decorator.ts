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

import 'reflect-metadata'
import { Container, injectable, interfaces } from 'inversify'
import { ActivityOptions, Client, ClientOptions } from 'discord.js'
import { MeoCordApp } from '@src/core/meocord.app.js'
import { loadMeoCordConfig } from '@src/util/meocord-config-loader.util.js'

type ServiceIdentifier = interfaces.ServiceIdentifier

/**
 * Binds a class and its dependencies to the Inversify container in singleton scope.
 *
 * @param {Container} container - The Inversify container instance.
 * @param {any} cls - The class to be bound to the container.
 */
function bindDependencies(container: Container, cls: any): void {
  if (!container.isBound(cls)) {
    container.bind(cls).toSelf().inSingletonScope()

    const dependencies = Reflect.getMetadata('design:paramtypes', cls) || []
    dependencies.forEach((dep: any) => bindDependencies(container, dep))
  }
}

/**
 * Resolves dependencies for a given class by binding them to the container and returning the resolved instances.
 *
 * @param {Container} container - The Inversify container instance.
 * @param {any} target - The target class whose dependencies are to be resolved.
 * @returns {any[]} - An array of resolved instances of the target's dependencies.
 */
function resolveDependencies(container: Container, target: any): any[] {
  const injectables = Reflect.getMetadata('design:paramtypes', target) || []
  return injectables.map((dep: any) => {
    bindDependencies(container, dep)
    return container.get(dep)
  })
}

/** The main Inversify container for managing dependencies. */
export const mainContainer = new Container()

/**
 * `@MeoCord()` decorator for initializing and setting up the MeoCord application.
 *
 * @param {Object} options - The decorator options.
 * @param {ServiceIdentifier[]} options.controllers - The list of controllers to be registered.
 * @param {ClientOptions} options.clientOptions - The Discord client options for initializing the bot.
 * @param {AppActivity[]} [options.activities] - Optional activities for the bot.
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
    if (!Reflect.hasMetadata('inversify:injectable', target)) {
      injectable()(target) // Make target injectable (inversify-specific)
    }

    const meocordConfig = loadMeoCordConfig()
    if (!meocordConfig) return

    const discordClient = new Client(options.clientOptions)
    mainContainer.bind(Client).toConstantValue(discordClient)

    // Bind controllers and services to the container
    ;[...options.controllers, ...(options.services || [])].forEach(dep => {
      bindDependencies(mainContainer, dep)
    })

    // Bind other static values to the container
    mainContainer.bind(target).toConstantValue(options.clientOptions)

    if (options.activities) {
      mainContainer.bind(target).toConstantValue(options.activities)
    }

    if (options.services) {
      mainContainer.bind(target).toConstantValue(options.services.map(s => mainContainer.get(s)))
    }

    const meocordApp = new MeoCordApp(
      options.controllers.map(c => mainContainer.get(c)),
      discordClient,
      meocordConfig.discordToken,
      options?.activities,
    )

    mainContainer.bind(MeoCordApp).toConstantValue(meocordApp)

    // Bind the App class dynamically with resolved dependencies
    mainContainer
      .bind(target)
      .toDynamicValue(() => {
        const dependencies = resolveDependencies(mainContainer, target)
        return new target(...dependencies)
      })
      .inSingletonScope()

    Reflect.defineMetadata('inversify:container', mainContainer, target)
  }
}
