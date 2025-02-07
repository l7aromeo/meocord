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

import { inspect } from 'util'
import colors from '@colors/colors'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import path from 'path'
import { existsSync } from 'fs'
import { MeoCordConfig } from '@src/interface'

dayjs.extend(utc)
dayjs.extend(timezone)

const meocordConfigPath = path.resolve(process.cwd(), 'meocord.config.ts')

export class Logger {
  private meocordConfig: MeoCordConfig = {
    appName: 'MeoCord',
  }

  private readonly colorMap: Record<string, (msg: string) => string> = {
    LOG: colors.green,
    INFO: colors.cyan,
    WARN: colors.yellow,
    ERROR: colors.red,
    DEBUG: colors.magenta,
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

  private async logWithContext(method: string, args: any[]): Promise<void> {
    ;(await import('ts-node')).register()
    if (existsSync(meocordConfigPath)) {
      this.meocordConfig = (await import(meocordConfigPath)).default as MeoCordConfig
    }

    if (args.length === 0) return

    const logType = method.toUpperCase()
    const colorize = this.colorMap[logType] || (msg => msg)
    const formattedMessages = args.map(arg => this.formatMessage(arg, logType))

    const appName = colorize(colors.bold(`[${this.meocordConfig.appName}]`))
    const datetime = colors.bold(dayjs().format('dddd, MMMM D, YYYY HH:mm:ss [UTC]Z')).reset
    const logMethod = colorize(colors.bold(`[${logType}]`))
    const context = this.context ? colors.bold(`[${this.context}]`).yellow : ''

    if (this.context) {
      console[method](appName, datetime, logMethod, context, ...formattedMessages)
    } else {
      console[method](appName, datetime, logMethod, ...formattedMessages)
    }
  }
}
