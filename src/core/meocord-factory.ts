/**
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
import { Container, interfaces } from 'inversify'
import { Logger } from '@src/common/index.js'
import { MeoCordApp } from '@src/core/index.js'
import { mainContainer } from '@src/decorator/index.js'

type ServiceIdentifier = interfaces.ServiceIdentifier

export class MeoCordFactory {
  private static logger = new Logger()

  static create(target: ServiceIdentifier): MeoCordApp {
    const container: Container = Reflect.getMetadata('inversify:container', target)

    if (!container) {
      if (target instanceof Function) {
        this.logger.error(`No container found for class: ${target.name}`)
      } else {
        this.logger.error('No container found for the provided target.')
      }
      throw new Error('No container found on the target class.')
    }

    return mainContainer.get(MeoCordApp)
  }
}
