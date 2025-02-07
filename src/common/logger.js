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

const { inspect } = require('util')
const colors = require('@colors/colors')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')
const path = require('path')
const { existsSync } = require('fs')

dayjs.extend(utc)
dayjs.extend(timezone)

const meocordConfigPath = path.resolve(process.cwd(), 'meocord.config.ts')

class Logger {
  constructor(context) {
    this.context = context
    this.meocordConfig = {
      appName: 'MeoCord',
    }

    this.colorMap = {
      LOG: colors.green,
      INFO: colors.cyan,
      WARN: colors.yellow,
      ERROR: colors.red,
      DEBUG: colors.magenta,
    }
  }

  log(...args) {
    this.logWithContext('log', args)
  }

  info(...args) {
    this.logWithContext('log', args)
  }

  warn(...args) {
    this.logWithContext('warn', args)
  }

  error(...args) {
    this.logWithContext('error', args)
  }

  debug(...args) {
    this.logWithContext('debug', args)
  }

  verbose(...args) {
    this.logWithContext('log', args)
  }

  formatMessage(message, logType) {
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

  async logWithContext(method, args) {
    ;(await require('ts-node')).register()
    if (existsSync(meocordConfigPath)) {
      this.meocordConfig = (await require(meocordConfigPath)).default
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

module.exports = { Logger }
