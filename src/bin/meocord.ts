#!/usr/bin/env node

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

import path from 'path'
import webpack from 'webpack'
import { Logger } from '@src/common/index.js'
import { spawn, ChildProcess } from 'node:child_process'
import { capitalize } from 'lodash-es'
import wait from '@src/util/wait.util.js'
import { GeneratorCLI } from '@src/bin/generator.js'
import * as fs from 'node:fs'
import { compileAndValidateConfig, setEnvironment } from '@src/util/common.util.js'
import { prepareModifiedTsConfig } from '@src/util/tsconfig.util.js'
import { Command } from 'commander'
import { simpleGit } from 'simple-git'
import chalk from 'chalk'
import { execSync } from 'child_process'
import { configureCommandHelp, ensureReady } from '@src/util/meocord-cli.util.js'
import packageJson from '../../package.json' with { type: 'json' }
import { fileURLToPath } from 'url'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import nodeExternals from 'webpack-node-externals'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * A Command Line Interface (CLI) for managing the MeoCord application.
 */
class MeoCordCLI {
  private readonly appName = 'MeoCord'
  readonly logger = new Logger(this.appName)
  private readonly projectRoot = process.cwd()
  private readonly mainJSPath = path.join(this.projectRoot, 'dist', 'main.js')
  private readonly webpackConfigPath = path.resolve(__dirname, '..', '..', '..', 'webpack.config.js')
  private readonly generatorCLI = new GeneratorCLI(this.appName)
  private readonly version = packageJson.version

  /**
   * Configures and runs the MeoCord CLI.
   */
  async run() {
    let program = new Command()

    program
      .name(this.appName.toLowerCase())
      .description(`CLI for managing the ${this.appName} application`)
      .version(this.version)

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
      .command('create <app-name>')
      .description('Create a new MeoCord application')
      .action(async appName => await this.createApp(appName))

    program
      .command('build')
      .description('Build the application')
      .option('-d, --dev', 'Build in development mode')
      .option('-p, --prod', 'Build in production mode')
      .action(async options => {
        await ensureReady()

        const mode = options.prod ? 'production' : 'development'
        setEnvironment(mode)

        await compileAndValidateConfig()

        await this.build(mode)
        await this.compileConfig()
      })

    program
      .command('start')
      .description('Start the application')
      .option('-b, --build', 'Pre-build before starting')
      .option('-d, --dev', 'Start in development mode')
      .option('-p, --prod', 'Start in production mode')
      .action(async options => {
        await ensureReady()

        const mode = options.prod ? 'production' : 'development'
        setEnvironment(mode)

        if (options.build || options.dev) {
          await compileAndValidateConfig()
        }

        if (options.build) {
          await this.build(mode)
          await this.compileConfig()
        }

        options.prod ? await this.startProd() : await this.startDev()
      })

    program = this.generatorCLI.register(program)

    configureCommandHelp(program)

    program.showHelpAfterError().parse(process.argv)
  }

  async createApp(appName: string) {
    const kebabCaseAppName = appName
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const appPath = path.resolve(process.cwd(), kebabCaseAppName)
    const gitRepo = 'https://github.com/l7aromeo/meocord-template.git'

    console.info(chalk.blueBright(`🚀 Creating a new MeoCord app: ${chalk.bold(kebabCaseAppName)}`))

    try {
      // Validate if directory already exists
      if (fs.existsSync(appPath)) {
        console.error(chalk.red(`❌ Directory "${chalk.bold(kebabCaseAppName)}" already exists.`))
        await wait(100)
        process.exit(1)
      }

      // Check Node.js version
      const MINIMUM_NODE_VERSION = '22.14.0'
      const [major, minor, patch] = process.version.slice(1).split('.').map(Number)
      const [minMajor, minMinor, minPatch] = MINIMUM_NODE_VERSION.split('.').map(Number)

      if (
        major < minMajor ||
        (major === minMajor && minor < minMinor) ||
        (major === minMajor && minor === minMinor && patch < minPatch)
      ) {
        console.error(
          chalk.red(`❌ Node.js v${MINIMUM_NODE_VERSION} or higher is required. Current version: v${process.version}.`),
        )
        await wait(100)
        process.exit(1)
      }

      // Clone the template repository
      console.info(chalk.blueBright('📦 Fetching template...'))
      await simpleGit().clone(gitRepo, appPath)
      console.log(chalk.green(`✔ App successfully created at: ${chalk.bold(appPath)}`))

      // Remove .git history from template
      fs.rmSync(path.join(appPath, '.git'), { recursive: true, force: true })

      // Initialize a new Git repository
      console.info(chalk.blueBright('🔧 Initializing Git repository...'))
      const git = simpleGit(appPath)
      await git.init()
      await git.add('./*')
      await git.commit('Initial commit')
      console.log(chalk.green('✔ Git repository initialized.'))

      // Install dependencies
      console.info(chalk.blueBright('📦 Installing dependencies...'))
      execSync(`cd ${kebabCaseAppName} && corepack enable && yarn install`, { stdio: 'inherit' })
      console.log(chalk.green('✔ Dependencies installed successfully.'))

      console.log(chalk.greenBright(`🎉 MeoCord app "${chalk.bold(kebabCaseAppName)}" is ready!`))
    } catch (error) {
      console.error(chalk.red(`❌ Failed to create app: ${error instanceof Error ? error.message : String(error)}`))
      await wait(100)
      process.exit(1)
    }
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

      if (!compiler) {
        this.logger.error('Failed to create webpack compiler instance.')
        throw new Error('Failed to create webpack compiler instance.')
      }

      // Workaround for Bun: Keep the event loop alive while webpack runs
      // Bun sometimes exits before async callbacks fire
      let keepAliveTimer: ReturnType<typeof setInterval> | null = null

      await new Promise<void>((resolve, reject) => {
        keepAliveTimer = setInterval(() => {
          // Keeps event loop active
        }, 100)

        compiler.run((err, stats) => {
          if (keepAliveTimer) {
            clearInterval(keepAliveTimer)
            keepAliveTimer = null
          }

          if (err) {
            this.logger.error(`Build encountered an error: ${err.message}`)
            return reject(`Build encountered an error: ${err.message}`)
          }

          if (stats?.hasErrors()) {
            this.logger.error('Build failed due to errors in the compilation process:', stats.compilation.errors)
          } else {
            this.logger.info(`${capitalize(mode)} build completed successfully.`)
          }

          compiler.close(closeErr => {
            if (closeErr) {
              this.logger.error(`Error occurred while closing the compiler: ${closeErr.message}`)
              return reject(`Error occurred while closing the compiler: ${closeErr.message}`)
            }
            resolve()
          })
        })
      })
    } catch (error: any) {
      this.logger.error(`Build process failed: ${error.message}`)
      await wait(100)
      process.exit(1)
    }
  }

  /**
   * Compiles meocord.config.ts to dist/meocord.config.mjs so the config
   * can be loaded at runtime without jiti, tsconfig, or source files.
   */
  async compileConfig() {
    const configPath = path.resolve(this.projectRoot, 'meocord.config.ts')
    if (!fs.existsSync(configPath)) return

    try {
      const tsConfigPath = prepareModifiedTsConfig()

      const compiler = webpack({
        entry: configPath,
        target: 'node',
        mode: 'production',
        externals: [nodeExternals({ importType: 'module' }) as any],
        module: {
          rules: [
            {
              test: /\.ts$/,
              use: {
                loader: 'swc-loader',
                options: {
                  jsc: {
                    parser: { syntax: 'typescript', tsx: false, decorators: true },
                    transform: { decoratorMetadata: true, legacyDecorator: true },
                  },
                },
              },
              exclude: /node_modules/,
            },
          ],
        },
        resolve: {
          extensions: ['.ts', '.js'],
          plugins: [new (TsconfigPathsPlugin as any)({ configFile: tsConfigPath })],
        },
        output: {
          filename: 'meocord.config.mjs',
          path: path.resolve(this.projectRoot, 'dist'),
          library: { type: 'module' },
        },
        experiments: { outputModule: true },
        optimization: { minimize: false },
      })

      await new Promise<void>(resolve => {
        compiler.run((err, stats) => {
          if (err || stats?.hasErrors()) {
            this.logger.warn('Failed to compile meocord.config.ts — runtime will fall back to source config.')
            resolve()
            return
          }
          compiler.close(closeErr => {
            if (closeErr) {
              resolve()
              return
            }
            this.logger.info('Config compiled to dist/meocord.config.mjs')
            resolve()
          })
        })
      })
    } catch {
      this.logger.warn('Failed to compile meocord.config.ts — runtime will fall back to source config.')
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

      if (!compiler) {
        this.logger.error('Failed to create webpack compiler instance.')
        await wait(100)
        process.exit(1)
      }

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

            nodemonProcess = spawn('npx -y nodemon', ['-q', this.mainJSPath], {
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
            this.logger.log('MeoCord config change detected, reloading config...')
            if (nodemonProcess && !nodemonProcess.killed) {
              nodemonProcess.kill()
              nodemonProcess = null
            }
            await new Promise(resolve => compiler.close(resolve))
            watch()
          }
        }, 300)
      })

      let sigintReceived = false
      process.on('SIGINT', async () => {
        if (sigintReceived) {
          // Second Ctrl+C — force kill and exit immediately
          if (nodemonProcess && !nodemonProcess.killed) nodemonProcess.kill('SIGKILL')
          process.exit(1)
        }
        sigintReceived = true
        // Nodemon and the bot already received SIGINT from the process group.
        // Clean up parent-owned resources and wait for nodemon to exit.
        fsWatcher.close()
        if (nodemonProcess && !nodemonProcess.killed) {
          nodemonProcess.on('exit', async () => {
            await new Promise(resolve => compiler.close(resolve))
            process.exit(0)
          })
        } else {
          await new Promise(resolve => compiler.close(resolve))
          process.exit(0)
        }
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
      // Check if mainJS exists before proceeding
      if (!fs.existsSync(this.mainJSPath)) {
        this.logger.error(
          `Main entry file (main.js) not found! You might need to build before running in production mode.`,
        )
        await wait(100)
        process.exit(1)
      }

      this.clearConsole()
      this.logger.log('Starting...')

      const start = spawn(`node ${this.mainJSPath}`, {
        shell: true,
        cwd: this.projectRoot,
        stdio: 'inherit',
      }).on('spawn', this.clearConsole)

      start.on('exit', code => {
        process.exit(code ?? 0)
      })

      let sigintReceived = false
      process.on('SIGINT', () => {
        if (sigintReceived) {
          // Second Ctrl+C — force kill child and exit immediately
          if (!start.killed) start.kill('SIGKILL')
          process.exit(1)
        }
        sigintReceived = true
        // Child process receives SIGINT from the process group directly.
        // Wait for it to exit via the 'exit' handler above.
      })
    } catch (error) {
      this.logger.error('Failed to start:', error instanceof Error ? error.message : String(error))
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
}

// Create an instance of the CLI and run it
const cli = new MeoCordCLI()
cli.run().catch(async error => {
  cli.logger.error('Failed to initialize CLI:', error?.message || error)
  await wait(100)
  process.exit(1)
})
