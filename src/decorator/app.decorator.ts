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
import { Client, ClientOptions } from 'discord.js'
import { MeoCordApp, AppActivity } from '@src/core/meocord.app'

type ServiceIdentifier = interfaces.ServiceIdentifier

function bindDependencies(container: Container, cls: any): void {
  if (!container.isBound(cls)) {
    container.bind(cls).toSelf().inSingletonScope()

    const dependencies = Reflect.getMetadata('design:paramtypes', cls) || []
    dependencies.forEach((dep: any) => bindDependencies(container, dep))
  }
}

function resolveDependencies(container: Container, target: any): any[] {
  const injectables = Reflect.getMetadata('design:paramtypes', target) || []
  return injectables.map((dep: any) => {
    bindDependencies(container, dep)
    return container.get(dep)
  })
}

export const mainContainer = new Container()

export function MeoCord(options: {
  controllers: ServiceIdentifier[]
  clientOptions: ClientOptions
  activities?: AppActivity[]
  services?: ServiceIdentifier[]
}) {
  return function (target: any): void {
    if (!Reflect.hasMetadata('inversify:injectable', target)) {
      injectable()(target)
    }

    const discordClient = new Client(options.clientOptions)
    mainContainer.bind(Client).toConstantValue(discordClient)

    // Bind controllers and services to container
    ;[...options.controllers, ...(options.services || [])].forEach(dep => {
      bindDependencies(mainContainer, dep)
    })

    // Bind static values
    mainContainer.bind(target).toConstantValue(options.clientOptions)
    if (options.activities) {
      mainContainer.bind(target).toConstantValue(options.activities)
    }
    if (options.services) {
      mainContainer.bind(target).toConstantValue(options.services.map(s => mainContainer.get(s)))
    }

    const meoCordApp = new MeoCordApp(
      options.controllers.map(c => mainContainer.get(c)),
      discordClient,
      options?.activities,
    )

    mainContainer.bind(MeoCordApp).toConstantValue(meoCordApp)

    // Bind the App class dynamically with all resolved dependencies
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
