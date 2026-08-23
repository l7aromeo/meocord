#!/usr/bin/env node

/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import path from 'path'
import webpack from 'webpack'
import { Logger } from '@src/common/index.js'
import { spawn, ChildProcess } from 'node:child_process'
import { capitalize } from 'lodash-es'
import wait from '@src/util/wait.util.js'
import { GeneratorCLI } from '@src/bin/generator.js'
import { AppGeneratorHelper } from '@src/bin/helper/app-generator.helper.js'
import * as fs from 'node:fs'
import { compileAndValidateConfig, setEnvironment, validateDiscordToken } from '@src/util/common.util.js'
import { prepareModifiedTsConfig } from '@src/util/tsconfig.util.js'
import { Command } from 'commander'
import { simpleGit } from 'simple-git'
import { execSync } from 'child_process'
import * as p from '@clack/prompts'
import { detectInstalledPMs, getInstallCommand, type PackageManager } from '@src/util/package-manager.util.js'
import { configureCommandHelp, ensureReady } from '@src/util/meocord-cli.util.js'
import { resolveOwnVersion } from '@src/util/package-version.util.js'
import { buildAppCommand, resolveRuntime } from '@src/util/runtime.util.js'
import packageJson from '../../package.json' with { type: 'json' }
import { fileURLToPath } from 'url'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import nodeExternals from 'webpack-node-externals'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * A Command Line Interface (CLI) for managing the MeoCord application.
 */
/**
 * Oldest Node the framework supports, mirroring `engines.node`.
 *
 * A test holds the two together, since a floor that drifted from the manifest would warn
 * about versions npm is happy to install on.
 */
export const MINIMUM_NODE_MAJOR = 22

/**
 * Warns when the running Node is older than the framework supports.
 *
 * Advisory only. Comparing against the newest LTS release meant warning about being a
 * patch behind, and reaching the network to find out meant a failed request could stop
 * the command outright — for a check whose only outcome is a warning.
 */
function warnIfNodeIsBelowSupported(): void {
  const major = Number.parseInt(process.versions.node.split('.')[0], 10)

  if (Number.isFinite(major) && major < MINIMUM_NODE_MAJOR) {
    p.log.warn(
      `Node ${process.versions.node} is older than the supported minimum (v${MINIMUM_NODE_MAJOR}). ` +
        `The app will be created, but may not run.`,
    )
  }
}

/**
 * The package manager's own complaint, which `execSync` buries on the thrown object.
 *
 * Its `message` says only that a command exited non-zero, which is never the part worth
 * reading.
 */
function installFailure(error: unknown): Error {
  const { stderr, message } = (error ?? {}) as { stderr?: Buffer | string; message?: string }
  const reported = stderr?.toString().trim()

  return new Error(reported || message || String(error))
}

export class MeoCordCLI {
  private readonly appName = 'MeoCord'
  readonly logger = new Logger(this.appName)
  private readonly projectRoot = process.cwd()
  private readonly mainJSPath = path.join(this.projectRoot, 'dist', 'main.js')
  private readonly webpackConfigPath = path.resolve(__dirname, '..', '..', '..', 'webpack.config.js')
  private readonly generatorCLI = new GeneratorCLI(this.appName)
  private readonly appGeneratorHelper = new AppGeneratorHelper()
  private readonly version = resolveOwnVersion(__dirname, packageJson.version)

  /**
   * Binary the application is spawned with, so it runs on the same runtime as the CLI
   * rather than on whichever one happens to be named in the source.
   */
  private readonly runtime = resolveRuntime(process.env, process.execPath)

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
      .option('-c, --license', 'Display license')
      .action(options => {
        if (!options.warranty && !options.license) {
          program.commands.find(cmd => cmd.name() === 'show')?.outputHelp()
          process.exit(1)
        }
        if (options.warranty) {
          console.log(`
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
      `)
        }
        if (options.license) {
          console.log(`
MIT License

Copyright (c) 2025 Ukasyah Rahmatullah Zada

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
      `)
        }
      })

    program
      .command('create <app-name>')
      .description('Create a new MeoCord application')
      .option('--use-npm', 'Use npm as the package manager')
      .option('--use-yarn', 'Use Yarn as the package manager')
      .option('--use-pnpm', 'Use pnpm as the package manager')
      .option('--use-bun', 'Use Bun as the package manager')
      .action(async (appName, options) => await this.createApp(appName, options))

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

        // Checked for every start, including one that skips the build: this is the point
        // where the application actually needs to log in.
        await validateDiscordToken()

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

  async createApp(
    appName: string,
    options: { useNpm?: boolean; useYarn?: boolean; usePnpm?: boolean; useBun?: boolean },
  ) {
    const kebabCaseAppName = appName
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')

    const appPath = path.resolve(process.cwd(), kebabCaseAppName)

    p.intro(`meocord v${this.version}`)

    // Validate directory
    if (fs.existsSync(appPath)) {
      p.cancel(`Directory "${kebabCaseAppName}" already exists.`)
      await wait(100)
      process.exit(1)
    }

    warnIfNodeIsBelowSupported()

    // Determine package manager
    const installedPMs = detectInstalledPMs()
    let pm: PackageManager

    const flagMap: Record<string, PackageManager> = {
      useNpm: 'npm',
      useYarn: 'yarn',
      usePnpm: 'pnpm',
      useBun: 'bun',
    }

    const selectedFlag = Object.entries(flagMap).find(([key]) => options[key as keyof typeof options])

    if (selectedFlag) {
      pm = selectedFlag[1]
      if (!installedPMs.includes(pm)) {
        p.cancel(`${pm} is not installed.`)
        await wait(100)
        process.exit(1)
      }
    } else {
      const defaultPM = installedPMs.includes('bun') ? 'bun' : 'npm'
      const selected = await p.select<PackageManager>({
        message: 'Which package manager do you want to use?',
        options: installedPMs.map(name => ({
          value: name,
          label: name,
          hint: name === defaultPM ? 'default' : undefined,
        })),
        initialValue: defaultPM,
      })

      if (p.isCancel(selected)) {
        p.cancel('Operation cancelled.')
        process.exit(0)
      }

      pm = selected
    }

    const s = p.spinner()

    s.start(`Creating a new MeoCord app: ${kebabCaseAppName}`)
    try {
      this.appGeneratorHelper.generateApp(appPath, {
        appName: kebabCaseAppName,
        displayName: appName,
        version: this.version,
        packageManager: pm,
      })
    } catch (error) {
      s.stop('Failed to create the app.')
      await this.abortCreate(appPath, error)
    }
    s.stop(`App created at: ${appPath}`)

    s.start('Initializing Git repository...')
    try {
      const git = simpleGit(appPath)
      await git.init()
      await git.add('./*')
      await git.commit('Initial commit')
    } catch (error) {
      s.stop('Failed to initialize Git.')
      await this.abortCreate(appPath, error)
    }
    s.stop('Git repository initialized.')

    s.start(`Installing dependencies with ${pm}...`)
    try {
      // Output is captured rather than discarded: a failed install is only actionable
      // if the resolver's complaint survives to the error message.
      execSync(getInstallCommand(pm), { cwd: appPath, stdio: 'pipe' })
    } catch (error) {
      s.stop('Failed to install dependencies.')
      await this.abortCreate(appPath, installFailure(error))
    }
    s.stop('Dependencies installed.')

    p.outro(`MeoCord app "${kebabCaseAppName}" is ready!`)
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
        mode: 'none',
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

  /** The running application, while a watch session owns one. */
  private appProcess: ChildProcess | null = null

  /**
   * Replaces the running application with one built from the current sources.
   *
   * The replacement is spawned only once the previous process has exited. Both would
   * hold the same gateway session, and claiming it before the first lets go produces a
   * login conflict rather than a reload.
   */
  private restartApp(): void {
    const previous = this.appProcess
    this.appProcess = null

    if (!previous || previous.killed) {
      this.appProcess = this.spawnApp()
      return
    }

    previous.removeAllListeners('exit')
    previous.once('exit', () => {
      this.appProcess = this.spawnApp()
    })
    previous.kill()
  }

  /**
   * Runs the built application.
   *
   * Shared by both start modes so watching and production launch the bundle the same
   * way; a watcher that spawned it differently could pass in development and fail in
   * production on the difference alone.
   *
   * @returns The application process.
   */
  private spawnApp(): ChildProcess {
    const { command, args } = buildAppCommand(this.runtime, this.mainJSPath)

    return spawn(command, args, {
      cwd: this.projectRoot,
      stdio: 'inherit',
    })
  }

  /**
   * Starts the MeoCord application in development mode with live updates.
   */
  async startDev() {
    try {
      this.clearConsole()
      this.logger.log('Starting watch mode...')
      await this.compileConfig()
      const webpackConfig = (await import(this.webpackConfigPath)).default
      const compiler = webpack({ ...webpackConfig, mode: 'development' })

      if (!compiler) {
        this.logger.error('Failed to create webpack compiler instance.')
        await wait(100)
        process.exit(1)
      }

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
            this.restartApp()
            isRunning = true
          }
        })
      watch()

      let debounceWatcher: NodeJS.Timeout

      const fsWatcher = fs.watch(path.resolve(process.cwd(), 'meocord.config.ts'), () => {
        clearTimeout(debounceWatcher)
        debounceWatcher = setTimeout(async () => {
          if (isRunning && this.appProcess) {
            isRunning = false
            this.logger.log('MeoCord config change detected, reloading config...')
            if (this.appProcess && !this.appProcess.killed) {
              this.appProcess.kill()
              this.appProcess = null
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
          if (this.appProcess && !this.appProcess.killed) this.appProcess.kill('SIGKILL')
          process.exit(1)
        }
        sigintReceived = true
        // The application already received SIGINT from the process group. Clean up
        // parent-owned resources and wait for it to exit on its own terms.
        fsWatcher.close()
        if (this.appProcess && !this.appProcess.killed) {
          this.appProcess.on('exit', async () => {
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

      const start = this.spawnApp().on('spawn', this.clearConsole)

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
   * Reports why creation failed and removes what was written.
   *
   * A directory left behind from a failed attempt is indistinguishable from one the user
   * meant to keep, and the next attempt refuses to start because the name is taken.
   */
  private async abortCreate(appPath: string, error: unknown): Promise<never> {
    fs.rmSync(appPath, { recursive: true, force: true })
    p.cancel(error instanceof Error ? error.message : String(error))
    await wait(100)
    process.exit(1)
  }

  /**
   * Clears the console on all platforms.
   */
  private clearConsole() {
    process.stdout.write('\u001b[3J\u001b[2J\u001b[H')
  }
}

/**
 * Whether this file is what the process was started with.
 *
 * The bin ships behind a `node_modules/.bin` symlink, so `argv[1]` is the link while
 * `import.meta.url` is its target; the two only agree once the link is resolved.
 * Anything undecidable counts as a launch, so the published CLI still starts in cases
 * this cannot classify.
 */
function isProcessEntry(): boolean {
  const invoked = process.argv[1]
  if (invoked === undefined) return true

  try {
    return fs.realpathSync(invoked) === __filename
  } catch {
    return true
  }
}

// Importing this module must not launch the command parser: its own tests do exactly
// that to inspect how the application is spawned.
if (isProcessEntry()) {
  const cli = new MeoCordCLI()
  cli.run().catch(async error => {
    cli.logger.error('Failed to initialize CLI:', error?.message || error)
    await wait(100)
    process.exit(1)
  })
}
