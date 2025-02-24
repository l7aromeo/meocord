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

import { inspect } from 'node:util'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc.js'
import timezone from 'dayjs/plugin/timezone.js'
import { loadMeoCordConfig } from '@src/util/meocord-config-loader.util.js'
import chalk from 'chalk'

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

  log(...args: any[]): void {
    this.logWithContext('log', args)
  }

  info(...args: any[]): void {
    this.logWithContext('log', args)
  }

  warn(...args: any[]): void {
    this.logWithContext('warn', args)
  }

  error(...args: any[]): void {
    this.logWithContext('error', args)
  }

  debug(...args: any[]): void {
    this.logWithContext('debug', args)
  }

  verbose(...args: any[]): void {
    this.logWithContext('log', args)
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

    const config = loadMeoCordConfig()
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
