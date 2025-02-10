#!/usr/bin/env node

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

import './generator'
import * as path from 'node:path'
import webpack from 'webpack'
import { Logger } from '@src/common'
import { spawn, ChildProcess } from 'node:child_process'
import { capitalize } from 'lodash'
import wait from '@src/util/wait.util'
import { GeneratorCLI } from '@src/bin/generator'
import * as fs from 'node:fs'
import { compileAndValidateConfig, findModulePackageDir, setEnvironment } from '@src/util/common.util'
import { Argument, Command, Help, Option } from 'commander'
import CliTable3 from 'cli-table3'
import { compileMeoCordConfig } from '@src/util/meocord-config-loader.util'

/**
 * A Command Line Interface (CLI) for managing the MeoCord application.
 */
class MeoCordCLI {
  private readonly appName = 'MeoCord'
  readonly logger = new Logger(this.appName)
  private readonly projectRoot = process.cwd()
  private readonly mainJSPath = path.join(this.projectRoot, 'dist', 'main.js')
  private readonly webpackConfigPath = path.resolve(__dirname, '..', '..', 'webpack.config.js')
  private readonly generatorCLI = new GeneratorCLI(this.appName)

  /**
   * Configures and runs the MeoCord CLI.
   */
  async run() {
    await this.ensureReady()
    let program = new Command()

    program
      .name(this.appName.toLowerCase())
      .description(`CLI for managing the ${this.appName} application`)
      .version('1.0.0')

    program
      .command('show')
      .description('Display information')
      .option('-w, --warranty', 'Display warranty disclaimer')
      .option('-c, --license', 'Display licensing conditions and usage rights')
      .action(options => {
        if (!options.warranty && !options.license) {
          program.commands.find(cmd => cmd.name() === 'show')?.outputHelp()
          process.exit(1)
        }
        if (options.warranty) {
          console.log(`
This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

The authors of this software are not responsible for damages caused
by the usage, misuse, or inability to use the software.

See the GNU General Public License for full details:
<https://www.gnu.org/licenses/>.
      `)
        }
        if (options.license) {
          console.log(`
This program is free software: you can redistribute it and/or
modify it under the terms of the GNU General Public License as
published by the Free Software Foundation, either version 3 of
the License, or (at your option) any later version.

Key conditions of the GNU GPL v3:
- You can use this software for personal, academic, or commercial purposes.
- If you distribute modified versions, you must share the source code under the same GPL v3 license.
- The original copyright must be retained.

For full license details, refer to:
<https://www.gnu.org/licenses/gpl-3.0.txt>
      `)
        }
      })

    program
      .command('build')
      .description('Build the application')
      .option('-d, --dev', 'Build in development mode')
      .option('-p, --prod', 'Build in production mode')
      .action(async options => {
        const mode = options.prod ? 'production' : 'development'
        setEnvironment(mode)

        await compileAndValidateConfig()

        await this.build(mode)
      })

    program
      .command('start')
      .description('Start the application')
      .option('-b, --build', 'Pre-build before starting')
      .option('-d, --dev', 'Start in development mode')
      .option('-p, --prod', 'Start in production mode')
      .action(async options => {
        const mode = options.prod ? 'production' : 'development'
        setEnvironment(mode)

        if (options.build || options.dev) {
          await compileAndValidateConfig()
        }

        if (options.build) {
          await this.build(mode)
        }

        options.prod ? await this.startProd() : await this.startDev()
      })

    program = this.generatorCLI.register(program)

    this.configureCommandHelp(program)

    program.showHelpAfterError().parse(process.argv)
  }

  /**
   * Builds the MeoCord application in the specified mode.
   *
   * @param mode - The build mode ('production' or 'development').
   */
  async build(mode: 'production' | 'development') {
    try {
      this.clearConsole()
      this.logger.info(`Building ${mode} version...`)

      const webpackConfig = (await import(this.webpackConfigPath)).default

      const compiler = webpack({
        ...webpackConfig,
        mode,
      })

      await new Promise<void>((resolve, reject) => {
        compiler.run((err, stats) => {
          if (err) {
            this.logger.error(`Build encountered an error: ${err.message}`)
            reject(`Build encountered an error: ${err.message}`)
            return
          }

          if (stats?.hasErrors()) {
            this.logger.error('Build failed due to errors in the compilation process:', stats.compilation.errors)
          } else {
            this.logger.info(`${capitalize(mode)} build completed successfully.`)
          }

          compiler.close(closeErr => {
            if (closeErr) {
              this.logger.error(`Error occurred while closing the compiler: ${closeErr.message}`)
              reject(`Error occurred while closing the compiler: ${closeErr.message}`)
              return
            }
            resolve()
          })
        })
      })
    } catch (error: any) {
      this.logger.error(`Build process failed: ${error.message}`)
      await wait(100) // Ensure that `wait` is defined or imported correctly
      process.exit(1)
    }
  }

  /**
   * Starts the MeoCord application in development mode with live updates.
   */
  async startDev() {
    try {
      this.clearConsole()
      this.logger.log('Starting watch mode...')
      const webpackConfig = (await import(this.webpackConfigPath)).default
      const compiler = webpack({ ...webpackConfig, mode: 'development' })

      let nodemonProcess: ChildProcess | null = null
      let isRunning = false

      const watch = () =>
        compiler.watch({}, (err, stats) => {
          if (err) {
            this.logger.error(`Webpack Error: ${err.message}`)
            return
          }

          if (stats?.hasErrors()) {
            this.logger.error('Build failed due to errors in the compilation process:', stats.compilation.errors)
          } else {
            if (nodemonProcess) {
              nodemonProcess.kill()
              nodemonProcess = null
            }

            nodemonProcess = spawn('nodemon', ['-q', this.mainJSPath], {
              shell: true,
              cwd: this.projectRoot,
              stdio: 'inherit',
            })

            isRunning = true
          }
        })
      watch()

      let debounceWatcher: NodeJS.Timeout

      const fsWatcher = fs.watch(path.resolve(process.cwd(), 'meocord.config.ts'), () => {
        clearTimeout(debounceWatcher)
        debounceWatcher = setTimeout(async () => {
          if (isRunning && nodemonProcess) {
            isRunning = false
            this.logger.log('MeoCord config change detected, recompiling config...')
            if (nodemonProcess && !nodemonProcess.killed) {
              nodemonProcess.kill()
              nodemonProcess = null
            }
            await new Promise(resolve => compiler.close(resolve))
            compileMeoCordConfig()
            watch()
          }
        }, 300)
      })

      process.on('SIGINT', async () => {
        await wait(1000)
        if (nodemonProcess && !nodemonProcess.killed) nodemonProcess.kill()
        await new Promise(resolve => compiler.close(resolve))
        fsWatcher.close()
        await wait(100)
        process.exit(0)
      })
    } catch (error: any) {
      this.logger.error(`Failed to start: ${error.message}`)
    }
  }

  /**
   * Starts the MeoCord application in production mode.
   */
  async startProd() {
    try {
      this.clearConsole()
      this.logger.log('Starting...')
      const start = spawn(`node ${this.mainJSPath}`, {
        shell: true,
        cwd: this.projectRoot,
        stdio: 'inherit',
      }).on('spawn', this.clearConsole)

      process.on('SIGINT', async () => {
        await wait(1000)
        if (start && !start.killed) start.kill()
        await wait(100)
        process.exit(0)
      })
    } catch (error: any) {
      this.logger.error('Failed to start:', error?.message)
    }
  }

  /**
   * Ensures that the script is being run from the root directory of the project.
   * Validates the existence of required files, dependencies, and configuration.
   * If validation fails, it logs an error message and terminates the process.
   */
  private async ensureReady() {
    const meocordPath = findModulePackageDir('meocord')
    const packageJsonPath = path.resolve(process.cwd(), 'package.json')

    try {
      // Ensure the root package.json exists
      if (!fs.existsSync(packageJsonPath)) {
        throw new Error('package.json not found. This script must be run from the root directory of the project.')
      }

      // Ensure the MeoCord package directory is found
      if (!meocordPath) {
        throw new Error('Cannot locate the "MeoCord" package directory.')
      }

      // Read and parse the root package.json
      const { dependencies } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

      // Read and parse the MeoCord package.json
      const internalPackageJsonPath = path.join(meocordPath, 'package.json')
      const { name: internalPackageName } = JSON.parse(fs.readFileSync(internalPackageJsonPath, 'utf-8'))

      // Validate that MeoCord is listed as a dependency in the root package.json
      if (!dependencies?.[internalPackageName]) {
        throw new Error(
          'The package.json does not list "MeoCord" as a dependency. Ensure you are in the root directory.',
        )
      }
    } catch (error) {
      // Log the error and exit the process
      this.logger.error(error instanceof Error ? error.message : 'An unknown error occurred during validation.')
      await wait(100)
      process.exit(1)
    }
  }

  /**
   * Clears the console on all platforms.
   */
  private clearConsole() {
    process.stdout.write('\u001b[3J\u001b[2J\u001b[H')
  }

  /**
   * Configures custom help formatting for a command and its subcommands.
   *
   * @param command - The command for which to configure help.
   */
  private configureCommandHelp(command: Command) {
    command.configureHelp({
      formatHelp: (cmd, helper) => {
        return this.formatHelp(cmd, helper, command.options)
      },
    })

    command.commands.forEach(cmd => {
      this.configureCommandHelp(cmd)
    })
  }

  /**
   * Formats the help output for a command.
   *
   * @param cmd - The command for which to format help.
   * @param helper - The helper object for formatting.
   * @param options - The options available for the command.
   * @returns The formatted help text.
   */
  private formatHelp(cmd: Command, helper: Help, options: readonly Option[]): string {
    let helpText = `MeoCord Copyright (C) 2025  Ukasyah Rahmatullah Zada
    This program comes with ABSOLUTELY NO WARRANTY; for details type \`meocord show -w'.
    This is free software, and you are welcome to redistribute it
    under certain conditions; type \`meocord show -c' for details.\n\n`

    helpText += `${helper.commandUsage(cmd)}\n\n`
    helpText += `${helper.commandDescription(cmd)}\n\n`

    if (cmd.registeredArguments.length > 0) {
      helpText += this.generateArgumentsTable(cmd.registeredArguments)
      helpText += '\n\n'
    }

    if (options.length > 0) {
      helpText += 'Available Options:\n'
      helpText += this.generateOptionsTable(options, helper)
      helpText += '\n\n'
    }

    if (cmd.commands.length > 0) {
      helpText += 'Available Commands:\n'
      helpText += this.generateCommandsTable(cmd)
      helpText += '\n'
    }

    return helpText
  }

  /**
   * Generates a table of commands with their aliases and descriptions.
   *
   * @param cmd - The command for which to generate the table.
   * @returns The formatted table of commands.
   */
  private generateCommandsTable(cmd: Command): string {
    const table = new CliTable3({
      head: ['Command', 'Alias', 'Description'],
    })

    cmd.commands.forEach(cmd => {
      const alias = cmd.aliases().length > 0 ? cmd.aliases().join(', ') : '—'
      const description = cmd.description() || 'No description provided'
      table.push([cmd.name(), alias, description])
    })

    return table.toString()
  }

  /**
   * Generates a table of commands with their aliases and descriptions.
   *
   * @param options
   * @param helper
   * @returns The formatted table of commands.
   */
  private generateOptionsTable(options: readonly Option[], helper: Help): string {
    const table = new CliTable3({
      head: ['Option', 'Description'],
    })

    options.forEach(option => table.push([helper.optionTerm(option), helper.optionDescription(option)]))

    return table.toString()
  }

  /**
   * Generates a formatted table of arguments for the specified command.
   *
   * This method creates two tables:
   * 1. A table displaying argument names and their descriptions.
   * 2. (If applicable) A table showing available choices for arguments with predefined choices.
   *
   * @param args - The list of arguments for the command.
   * @returns A string representation of the formatted tables, including available arguments and their choices.
   */
  private generateArgumentsTable(args: readonly Argument[]): string {
    const table = new CliTable3({
      head: ['Argument', 'Description'],
    })

    const choiceTable = new CliTable3({
      head: ['Choice'],
    })

    let hasChoices = false

    args.forEach(arg => {
      if (arg.argChoices) {
        hasChoices = true
        arg.argChoices.forEach(choice => {
          choiceTable.push([choice])
        })
      }
      table.push([arg.name(), arg.description || 'No description provided'])
    })

    let text = ''

    if (hasChoices) {
      text += 'Available Choices:\n'
      text += choiceTable.toString()
      text += '\n\n'
    } else {
      text += 'No available choices.\n\n'
    }

    text += 'Available Arguments:\n'
    text += table.toString()

    return text
  }
}

// Create an instance of the CLI and run it
const cli = new MeoCordCLI()
cli.run().catch(async error => {
  cli.logger.error('Failed to initialize CLI:', error?.message || error)
  await wait(100)
  process.exit(1)
})
