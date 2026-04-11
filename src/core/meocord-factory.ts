/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { Container, injectable, type ServiceIdentifier } from 'inversify'
import { Client } from 'discord.js'
import { Logger } from '@src/common/index.js'
import { MeoCordApp } from '@src/core/meocord.app.js'
import { loadMeoCordConfig } from '@src/util/meocord-config-loader.util.js'
import { MetadataKey } from '@src/enum/index.js'

/**
 * Recursively binds a class and all its constructor dependencies to the container in singleton scope.
 */
function bindDependencies(container: Container, cls: any): void {
  if (container.isBound(cls)) return

  if (!Reflect.hasMetadata(MetadataKey.Injectable, cls)) {
    injectable()(cls)
  }

  container.bind(cls).toSelf().inSingletonScope()

  const deps: any[] = Reflect.getMetadata(MetadataKey.ParamTypes, cls) || []
  for (const dep of deps) {
    if (dep === Client) continue
    bindDependencies(container, dep)
  }
}

export class MeoCordFactory {
  private static logger = new Logger()

  static create(target: ServiceIdentifier): MeoCordApp {
    const options = Reflect.getMetadata(MetadataKey.AppOptions, target)

    if (!options) {
      if (typeof target === 'function') {
        this.logger.error(`No @MeoCord() options found for class: ${(target as any).name}`)
      } else {
        this.logger.error('No @MeoCord() options found for the provided target.')
      }
      throw new Error('Target class is not decorated with @MeoCord().')
    }

    const meocordConfig = loadMeoCordConfig()
    if (!meocordConfig) {
      throw new Error('MeoCord config not found. Ensure meocord.config.ts exists.')
    }

    const container = new Container()

    // Bind the Discord client as a constant value
    const discordClient = new Client(options.clientOptions)
    container.bind(Client).toConstantValue(discordClient)

    // Bind all controllers and their transitive dependencies
    for (const ctrl of options.controllers as any[]) {
      bindDependencies(container, ctrl)
    }

    // Bind and eagerly instantiate standalone services so their constructors run.
    // This is critical for event-driven services that register Discord event
    // listeners (or connect to external systems) inside their constructor.
    for (const svc of (options.services ?? []) as any[]) {
      bindDependencies(container, svc)
      container.get(svc)
    }

    // Stamp each controller class with the container so @UseGuard can resolve guards
    for (const ctrl of options.controllers as any[]) {
      Reflect.defineMetadata(MetadataKey.Container, container, ctrl)
    }

    return new MeoCordApp(options.controllers, container, discordClient, meocordConfig.discordToken, options.activities)
  }
}
