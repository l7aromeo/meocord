/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { jest } from '@jest/globals'

jest.mock('@src/util/meocord-config-loader.util.js', () => ({
  loadMeoCordConfig: jest.fn().mockReturnValue({ appName: 'TestApp', discordToken: 'token' }),
}))

import { Logger } from '@src/common/logger.js'

describe('Logger', () => {
  let logSpy: jest.SpiedFunction<typeof console.log>
  let warnSpy: jest.SpiedFunction<typeof console.warn>
  let errorSpy: jest.SpiedFunction<typeof console.error>
  let debugSpy: jest.SpiedFunction<typeof console.debug>

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {})
  })

  it('calls console.log for log()', () => {
    new Logger('Ctx').log('message')
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('calls console.log for info()', () => {
    new Logger().info('message')
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('calls console.warn for warn()', () => {
    new Logger().warn('message')
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('calls console.error for error()', () => {
    new Logger().error('message')
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('calls console.debug for debug()', () => {
    new Logger().debug('message')
    expect(debugSpy).toHaveBeenCalledTimes(1)
  })

  it('calls console.log for verbose()', () => {
    new Logger().verbose('message')
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('does not log when called with no arguments', () => {
    new Logger().log()
    expect(logSpy).not.toHaveBeenCalled()
  })

  it('handles object arguments without throwing', () => {
    expect(() => new Logger().log({ key: 'value' })).not.toThrow()
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('handles multiple arguments', () => {
    new Logger().log('a', 'b', 'c')
    expect(logSpy).toHaveBeenCalledTimes(1)
  })

  it('works without a context', () => {
    expect(() => new Logger().log('no context')).not.toThrow()
  })
})
