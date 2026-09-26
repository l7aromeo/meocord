import { vi, type MockInstance } from 'vitest'

vi.mock('@src/util/meocord-config-loader.util.js', () => ({
  loadMeoCordConfig: vi.fn().mockReturnValue({ appName: 'TestApp', discordToken: 'token' }),
}))

import { stripVTControlCharacters } from 'node:util'
import { Logger } from '@src/common/logger.js'
import { resetLogLevel } from '@src/common/log-level.js'
import { loadMeoCordConfig } from '@src/util/meocord-config-loader.util.js'
import { type MeoCordConfig } from '@src/interface/index.js'

describe('Logger', () => {
  let logSpy: MockInstance<typeof console.log>
  let warnSpy: MockInstance<typeof console.warn>
  let errorSpy: MockInstance<typeof console.error>
  let debugSpy: MockInstance<typeof console.debug>

  beforeEach(() => {
    // Every level shows, so each method's own console call is what these check
    vi.stubEnv('MEOCORD_LOG_LEVEL', 'debug')
    resetLogLevel()
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
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

describe('Logger levels', () => {
  const printed = () =>
    [console.debug, console.log, console.warn, console.error].flatMap(method =>
      vi.mocked(method).mock.calls.map(call => stripVTControlCharacters(call.map(String).join(' '))),
    )
  const logEveryLevel = () => {
    const logger = new Logger()
    logger.debug('d')
    logger.log('l')
    logger.info('i')
    logger.verbose('v')
    logger.warn('w')
    logger.error('e')
  }
  const levelsShown = () =>
    printed()
      .map(line => /\[(DEBUG|LOG|WARN|ERROR)\]/.exec(line)?.[1])
      .join(',')

  beforeEach(() => {
    for (const method of ['debug', 'log', 'warn', 'error'] as const) vi.spyOn(console, method).mockImplementation(() => {})
    vi.mocked(loadMeoCordConfig).mockClear().mockReturnValue({ discordToken: 'token' })
    vi.stubEnv('MEOCORD_LOG_LEVEL', undefined)
    resetLogLevel()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    resetLogLevel()
  })

  it('shows debug in development, as under meocord start --dev', () => {
    vi.stubEnv('NODE_ENV', 'development')

    logEveryLevel()

    expect(levelsShown()).toBe('DEBUG,LOG,LOG,LOG,WARN,ERROR')
  })

  it('hides debug anywhere else', () => {
    for (const env of ['production', 'test', undefined]) {
      vi.stubEnv('NODE_ENV', env)
      resetLogLevel()
      for (const method of ['debug', 'log', 'warn', 'error'] as const) vi.mocked(console[method]).mockClear()

      logEveryLevel()

      expect(levelsShown()).toBe('LOG,LOG,LOG,WARN,ERROR')
    }
  })

  it.each([
    ['debug', 'DEBUG,LOG,LOG,LOG,WARN,ERROR'],
    ['log', 'LOG,LOG,LOG,WARN,ERROR'],
    ['warn', 'WARN,ERROR'],
    ['error', 'ERROR'],
    ['silent', ''],
  ] as const)('shows what logLevel %s allows', (level, shown) => {
    vi.mocked(loadMeoCordConfig).mockReturnValue({ discordToken: 'token', logLevel: level } as MeoCordConfig)

    logEveryLevel()

    expect(levelsShown()).toBe(shown)
  })

  it('takes MEOCORD_LOG_LEVEL over the config and the environment', () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.stubEnv('MEOCORD_LOG_LEVEL', 'error')
    vi.mocked(loadMeoCordConfig).mockReturnValue({ discordToken: 'token', logLevel: 'debug' } as MeoCordConfig)

    logEveryLevel()

    expect(levelsShown()).toBe('ERROR')
  })

  it('warns once about an unknown MEOCORD_LOG_LEVEL, naming the levels, and falls back to the config', () => {
    vi.stubEnv('MEOCORD_LOG_LEVEL', 'verbose')
    vi.mocked(loadMeoCordConfig).mockReturnValue({ discordToken: 'token', logLevel: 'warn' } as MeoCordConfig)

    logEveryLevel()
    logEveryLevel()

    const warnings = printed().filter(line => line.includes('MEOCORD_LOG_LEVEL'))
    expect(warnings).toEqual([expect.stringContaining('MEOCORD_LOG_LEVEL is "verbose", which is not a log level: use debug, log, warn, error or silent.')])
    // Grouped by console method: the warning and two warns, then two errors
    expect(levelsShown()).toBe('WARN,WARN,WARN,ERROR,ERROR')
  })

  it('reads MEOCORD_LOG_LEVEL after loading the config, which may load it from .env', () => {
    vi.mocked(loadMeoCordConfig).mockImplementation(() => {
      process.env.MEOCORD_LOG_LEVEL = 'error'
      return { discordToken: 'token' }
    })

    logEveryLevel()

    expect(levelsShown()).toBe('ERROR')
  })

  // Resolved once, so a busy bot does not read process.env on every call
  it('keeps the level it resolved first until reset', () => {
    new Logger().debug('before')
    vi.stubEnv('MEOCORD_LOG_LEVEL', 'debug')
    new Logger().debug('still hidden')
    resetLogLevel()
    new Logger().debug('shown')

    expect(printed()).toEqual([expect.stringContaining('shown')])
  })

  it('formats nothing it does not show', () => {
    const inspected = { [Symbol.for('nodejs.util.inspect.custom')]: vi.fn(() => 'x') }

    new Logger().debug(inspected)

    expect(inspected[Symbol.for('nodejs.util.inspect.custom')]).not.toHaveBeenCalled()
    expect(loadMeoCordConfig).toHaveBeenCalledTimes(1)
  })
})

