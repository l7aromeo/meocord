/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { jest } from '@jest/globals'

jest.mock('@src/common/index.js', () => ({
  Logger: jest.fn().mockImplementation(() => ({
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
    verbose: jest.fn(),
  })),
}))

import { MeoCordFactory } from '@src/core/meocord-factory.js'
import { mainContainer } from '@src/decorator/container.js'
import { MeoCordApp } from '@src/core/meocord.app.js'
import { MetadataKey } from '@src/enum/index.js'

afterEach(() => {
  mainContainer.unbindAll()
})

describe('MeoCordFactory.create()', () => {
  it('throws when the target has no inversify:container metadata', () => {
    class NoMetadataApp {}
    expect(() => MeoCordFactory.create(NoMetadataApp)).toThrow('No container found on the target class.')
  })

  it('returns the MeoCordApp from the container', () => {
    const mockApp = {} as MeoCordApp
    mainContainer.bind(MeoCordApp).toConstantValue(mockApp)

    class MyApp {}
    Reflect.defineMetadata(MetadataKey.Container, mainContainer, MyApp)

    const result = MeoCordFactory.create(MyApp)
    expect(result).toBe(mockApp)
  })
})
