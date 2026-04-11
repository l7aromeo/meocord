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

const mockLoadConfig = jest.fn()
jest.unstable_mockModule('@src/util/meocord-config-loader.util.js', () => ({
  loadMeoCordConfig: mockLoadConfig,
}))

const { MeoCordFactory } = await import('@src/core/meocord-factory.js')
const { MeoCordApp } = await import('@src/core/meocord.app.js')
const { MetadataKey } = await import('@src/enum/index.js')

describe('MeoCordFactory.create()', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('throws when the target has no @MeoCord() options metadata', () => {
    class NoMetadataApp {}
    expect(() => MeoCordFactory.create(NoMetadataApp)).toThrow('Target class is not decorated with @MeoCord().')
  })

  it('throws when meocord config is missing', () => {
    mockLoadConfig.mockReturnValue(null)

    class MyApp {}
    Reflect.defineMetadata(MetadataKey.AppOptions, { controllers: [], clientOptions: { intents: [] } }, MyApp)

    expect(() => MeoCordFactory.create(MyApp)).toThrow('MeoCord config not found')
  })

  it('returns a MeoCordApp instance when config and options are valid', () => {
    mockLoadConfig.mockReturnValue({ discordToken: 'test-token' })

    class MyApp {}
    Reflect.defineMetadata(MetadataKey.AppOptions, { controllers: [], clientOptions: { intents: [] } }, MyApp)

    const result = MeoCordFactory.create(MyApp)
    expect(result).toBeInstanceOf(MeoCordApp)
  })
})
