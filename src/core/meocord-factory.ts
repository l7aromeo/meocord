/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { Container, type ServiceIdentifier } from 'inversify'
import { Logger } from '@src/common/index.js'
import { MeoCordApp } from '@src/core/meocord.app.js'
import { mainContainer } from '@src/decorator/index.js'
import { MetadataKey } from '@src/enum/index.js'

export class MeoCordFactory {
  private static logger = new Logger()

  static create(target: ServiceIdentifier): MeoCordApp {
    const container: Container = Reflect.getMetadata(MetadataKey.Container, target)

    if (!container) {
      if (typeof target === 'function') {
        this.logger.error(`No container found for class: ${target.name}`)
      } else {
        this.logger.error('No container found for the provided target.')
      }
      throw new Error('No container found on the target class.')
    }

    return mainContainer.get(MeoCordApp)
  }
}
