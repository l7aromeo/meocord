/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { mainContainer } from '@src/decorator/container.js'
import { Container, injectable, type ServiceIdentifier } from 'inversify'
import { type ActivityOptions, Client, type ClientOptions } from 'discord.js'
import { MeoCordApp } from '@src/core/meocord.app.js'
import { loadMeoCordConfig } from '@src/util/meocord-config-loader.util.js'
import { MetadataKey } from '@src/enum/index.js'

/**
 * Binds a class and its dependencies to the Inversify container in singleton scope.
 *
 * @param {Container} container - The Inversify container instance.
 * @param {any} cls - The class to be bound to the container.
 */
function bindDependencies(container: Container, cls: any): void {
  if (!container.isBound(cls)) {
    container.bind(cls).toSelf().inSingletonScope()

    const dependencies = Reflect.getMetadata(MetadataKey.ParamTypes, cls) || []
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
  const injectables = Reflect.getMetadata(MetadataKey.ParamTypes, target) || []
  return injectables.map((dep: any) => {
    bindDependencies(container, dep)
    return container.get(dep)
  })
}

/**
 * `@MeoCord()` decorator for initializing and setting up the MeoCord application.
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

    Reflect.defineMetadata(MetadataKey.Container, mainContainer, target)
  }
}
