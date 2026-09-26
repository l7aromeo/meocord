import { inspect } from 'node:util'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import { loadMeoCordConfig } from '@src/util/meocord-config-loader.util.js'
import { isBuiltApplication } from '@src/util/bundle-entry.util.js'
import chalk from 'chalk'
import { LOG_LEVEL_ENV, LOG_LEVEL_RANK, logThreshold, takeRejectedLogLevel } from '@src/common/log-level.js'

dayjs.extend(utc)
dayjs.extend(timezone)

export class Logger {
  private readonly colorMap: Record<string, (msg: string) => string> = {
    LOG: chalk.green,
    INFO: chalk.cyan,
    WARN: chalk.yellow,
    ERROR: chalk.red,
    DEBUG: chalk.magenta,
  }

  constructor(private context?: string) {}

  /**
   * Whether a line of this level prints. An unknown `MEOCORD_LOG_LEVEL` is reported once, whatever the
   * level, since the level it falls back to may hide warnings.
   */
  private static shows(level: 'debug' | 'log' | 'warn' | 'error'): boolean {
    const threshold = logThreshold()
    const rejected = takeRejectedLogLevel()
    if (rejected !== undefined) {
      new Logger('Logger').logWithContext('warn', [
        `${LOG_LEVEL_ENV} is "${rejected}", which is not a log level: use debug, log, warn, error or silent.`,
      ])
    }
    return LOG_LEVEL_RANK[level] >= threshold
  }

  log(...args: any[]): void {
    if (Logger.shows('log')) this.logWithContext('log', args)
  }

  info(...args: any[]): void {
    if (Logger.shows('log')) this.logWithContext('log', args)
  }

  warn(...args: any[]): void {
    if (Logger.shows('warn')) this.logWithContext('warn', args)
  }

  error(...args: any[]): void {
    if (Logger.shows('error')) this.logWithContext('error', args)
  }

  debug(...args: any[]): void {
    if (Logger.shows('debug')) this.logWithContext('debug', args)
  }

  verbose(...args: any[]): void {
    if (Logger.shows('log')) this.logWithContext('log', args)
  }

  private formatMessage(message: any, logType: string): string {
    if (typeof message === 'object' && message !== null) {
      return inspect(message, {
        showHidden: true,
        depth: null,
        colors: true,
        compact: false,
        showProxy: true,
      })
    }

    return (this.colorMap[logType] || (msg => msg))(message)
  }

  private logWithContext(logLevel: string, messages: any[]): void {
    if (messages.length === 0) return

    // The built bot's own config only: elsewhere dist holds a previous build's, and loading it runs its dotenv import
    const config = isBuiltApplication() ? loadMeoCordConfig() : undefined
    const logType = logLevel.toUpperCase()
    const applyColor = this.colorMap[logType] || (msg => msg)
    const formattedMessages = messages.map(message => this.formatMessage(message, logType))

    const coloredAppName = config?.appName ? applyColor(chalk.bold(`[${config.appName}]`)) : undefined
    const timestamp = chalk.bold(dayjs().format('dddd, MMMM D, YYYY HH:mm:ss [UTC]Z'))
    const coloredLogLevel = applyColor(chalk.bold(`[${logType}]`))
    const coloredContext = this.context ? chalk.yellow.bold(`[${this.context}]`) : ''

    const logTexts = [coloredAppName, timestamp, coloredLogLevel, coloredContext, ...formattedMessages].filter(
      log => !!log,
    )
    console[logLevel](...logTexts)
  }
}
