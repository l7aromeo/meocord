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

import { type Configuration } from 'webpack'
import webpack from 'webpack'
import { TsconfigPathsPlugin } from 'tsconfig-paths-webpack-plugin'
import path from 'path'
import { createRequire } from 'module'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { type MeoCordConfig } from '@src/interface/index.js'
import { findModulePackageDir } from '@src/util/common.util.js'
import { fixJSON } from '@src/util/json.util.js'
import nodeExternals from 'webpack-node-externals'

const require = createRequire(import.meta.url)
const TEMP_OUTPUT_DIR = path.resolve(process.cwd(), 'dist', '.meocord-temp')

/**
 * Recursively removes undefined keys from an object
 */
const removeUndefinedKeys = (obj: Record<string, any>): void => {
  Object.keys(obj).forEach(key => {
    if (obj[key] === undefined) {
      delete obj[key]
    } else if (typeof obj[key] === 'object' && obj[key] !== null) {
      removeUndefinedKeys(obj[key])
    }
  })
}

/**
 * Creates the build TypeScript configuration
 */
const createBuildTsConfig = (rootTsConfigContent: any) => ({
  compilerOptions: {
    tsBuildInfoFile: null,
    strict: true,
    module: 'NodeNext',
    target: 'ESNext',
    moduleResolution: 'NodeNext',
    esModuleInterop: true,
    resolveJsonModule: true,
    allowSyntheticDefaultImports: true,
    sourceMap: false,
    baseUrl: '.',
    rootDir: '.',
    outDir: TEMP_OUTPUT_DIR,
    paths: rootTsConfigContent?.compilerOptions?.paths,
    skipLibCheck: true,
    noImplicitAny: false,
    forceConsistentCasingInFileNames: true,
  },
  include: ['meocord.config.ts'],
})

/**
 * Creates webpack configuration for compiling the config
 */
const createWebpackConfig = (buildTsConfigPath: string): Configuration => ({
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: 'meocord.config.ts',
  target: 'node',
  externals: [nodeExternals({ importType: 'module' })],
  experiments: {
    outputModule: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'swc-loader',
          options: {
            jsc: {
              parser: {
                syntax: 'typescript',
                tsx: false,
                decorators: true,
              },
              transform: {
                decoratorMetadata: true,
                legacyDecorator: true,
              },
            },
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    plugins: [new TsconfigPathsPlugin({ configFile: buildTsConfigPath })],
    extensions: ['.ts', '.js'],
  },
  output: {
    filename: 'meocord.config.js',
    path: TEMP_OUTPUT_DIR,
    publicPath: TEMP_OUTPUT_DIR,
    library: {
      type: 'module',
    },
  },
})

/**
 * Compiles the TypeScript configuration file (meocord.config.ts) to JavaScript
 * and stores it in the temporary directory.
 *
 * @returns {boolean} Whether the TypeScript compilation was successful.
 */
export async function compileMeoCordConfig(): Promise<boolean> {
  const meocordModulePath = findModulePackageDir('meocord')
  if (!meocordModulePath) return false

  const buildTsConfigPath = path.resolve(process.cwd(), 'tsconfig.build.json')
  const rootTsConfigPath = path.resolve(process.cwd(), 'tsconfig.json')

  if (!existsSync(rootTsConfigPath)) {
    throw new Error(`tsconfig.json not found in: ${process.cwd()}`)
  }

  const rootTsConfigContent = JSON.parse(fixJSON(readFileSync(rootTsConfigPath, 'utf-8')))
  const buildTsConfigContent = createBuildTsConfig(rootTsConfigContent)
  removeUndefinedKeys(buildTsConfigContent)

  writeFileSync(buildTsConfigPath, fixJSON(JSON.stringify(buildTsConfigContent)))

  if (!existsSync(buildTsConfigPath)) {
    console.error(`[MeoCord] tsconfig.build.json file not found: ${buildTsConfigPath}`)
    return false
  }

  if (!existsSync(TEMP_OUTPUT_DIR)) {
    mkdirSync(TEMP_OUTPUT_DIR, { recursive: true })
  }

  const webpackConfig = createWebpackConfig(buildTsConfigPath)
  const compiler = webpack(webpackConfig)

  if (!compiler) {
    console.error('[MeoCord] Failed to create webpack compiler instance.')
    return false
  }

  try {
    // Workaround for Bun: Keep the event loop alive while webpack runs
    // Bun sometimes exits before async callbacks fire
    let keepAliveTimer: ReturnType<typeof setInterval> | null = null

    const runCompiler = (): Promise<boolean> => {
      return new Promise((resolve, reject) => {
        keepAliveTimer = setInterval(() => {
          // Keeps event loop active
        }, 100)

        compiler.run((err, stats) => {
          if (keepAliveTimer) {
            clearInterval(keepAliveTimer)
            keepAliveTimer = null
          }

          if (err) {
            console.error(`[MeoCord] Build error: ${err.message}`)
            reject(err)
            return
          }

          if (stats?.hasErrors()) {
            console.error('[MeoCord] Compilation errors:', stats.compilation.errors)
            reject(new Error('Compilation failed'))
            return
          }

          compiler.close(closeErr => {
            if (closeErr) {
              console.error(`[MeoCord] Close error: ${closeErr.message}`)
              reject(closeErr)
              return
            }
            resolve(true)
          })
        })
      })
    }

    return await runCompiler()
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[MeoCord] Failed to transpile config: ${error.message}`)
    } else {
      console.error(`[MeoCord] Failed to transpile config: Unknown error`)
    }
    return false
  } finally {
    rmSync(buildTsConfigPath, { force: true })
  }
}

/**
 * Loads the MeoCord configuration file (meocord.config.js) from the temporary directory
 * and returns it as a JavaScript object.
 *
 * @returns {MeoCordConfig | undefined} The loaded configuration object, or undefined if loading fails.
 */
export function loadMeoCordConfig(): MeoCordConfig | undefined {
  const meocordModulePath = findModulePackageDir('meocord')
  if (!meocordModulePath) return undefined

  const tempConfigFilePath = path.join(TEMP_OUTPUT_DIR, 'meocord.config.js')

  if (existsSync(tempConfigFilePath)) {
    try {
      // Clear require cache to ensure fresh load (fixes Bun Docker caching issues)
      delete require.cache[require.resolve(tempConfigFilePath)]
      return require(tempConfigFilePath).default as MeoCordConfig
    } catch (error) {
      if (error instanceof Error) {
        console.error(`[MeoCord] Failed to load config: ${error.message}`)
      } else {
        console.error(`[MeoCord] Failed to load config: Unknown error`)
      }
      return undefined
    }
  }

  return undefined
}
