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

import path from 'path'
import { findModulePackageDir } from '@src/util/common.util.js'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { MeoCordConfig } from '@src/interface/index.js'
import { fixJSON } from '@src/util/json.util.js'
import { createRequire } from 'module'
import webpack, { Configuration } from 'webpack'
import NodeExternals from 'webpack-node-externals'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
const require = createRequire(import.meta.url)

const tempOutputDir = path.resolve(process.cwd(), 'dist', '.meocord-temp')

/**
 * Compiles the TypeScript configuration file (meocord.config.ts) to JavaScript
 * and stores it in the temporary directory.
 *
 * @returns {boolean} Whether the TypeScript compilation was successful.
 */
export async function compileMeoCordConfig(): Promise<boolean> {
  const meocordModulePath = findModulePackageDir('meocord')
  if (!meocordModulePath) return false

  const buildTsConfigTempPath = path.resolve(process.cwd(), 'tsconfig.build.json')

  const rootTsConfigPath = path.resolve(process.cwd(), 'tsconfig.json')

  // Ensure tsconfig.json exists
  if (!existsSync(rootTsConfigPath)) {
    throw new Error(`tsconfig.json not found in: ${process.cwd()}`)
  }

  const rootTsConfigContent = JSON.parse(fixJSON(readFileSync(rootTsConfigPath, 'utf-8')))

  const removeUndefinedKeys = (obj: any): void => {
    Object.keys(obj).forEach(key => {
      if (obj[key] === undefined) {
        delete obj[key]
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        removeUndefinedKeys(obj[key])
      }
    })
  }

  const buildTsConfigContent = {
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
      outDir: tempOutputDir,
      paths: rootTsConfigContent?.compilerOptions?.paths,
      skipLibCheck: true,
      noImplicitAny: false,
      forceConsistentCasingInFileNames: true,
    },
    include: ['meocord.config.ts'],
  }

  removeUndefinedKeys(buildTsConfigContent)

  // Copy the build config to the working directory
  writeFileSync(buildTsConfigTempPath, fixJSON(JSON.stringify(buildTsConfigContent)))

  // Ensure the tsconfig.build.json exists
  if (!existsSync(buildTsConfigTempPath)) {
    console.error(`[MeoCord] tsconfig.build.json file not found: ${buildTsConfigTempPath}`)
    return false
  }

  // Ensure the temp directory exists
  if (!existsSync(tempOutputDir)) {
    mkdirSync(tempOutputDir, { recursive: true })
  }

  const webpackConfig: Configuration = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    entry: 'meocord.config.ts',
    target: 'node',
    externals: NodeExternals({ importType: 'module' }),
    experiments: {
      outputModule: true,
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: {
            loader: 'ts-loader',
            options: {
              configFile: buildTsConfigTempPath,
            },
          },
          exclude: /node_modules/,
        },
      ],
    },
    resolve: {
      plugins: [new TsconfigPathsPlugin({ configFile: buildTsConfigTempPath })],
      extensions: ['.ts', '.js'],
    },
    output: {
      filename: 'meocord.config.js',
      path: tempOutputDir,
      publicPath: tempOutputDir,
      library: {
        type: 'module',
      },
    },
  }

  const compiler = webpack(webpackConfig)

  try {
    return await new Promise<boolean>((resolve, reject) => {
      compiler.run((err, stats) => {
        if (err) {
          console.error(`Build encountered an error: ${err.message}`)
          return reject(`Build encountered an error: ${err.message}`)
        }

        if (stats?.hasErrors()) {
          console.error('Build failed due to errors in the compilation process:', stats.compilation.errors)
          return reject(`Build encountered an error: ${stats.compilation.errors}`)
        }

        compiler.close(closeErr => {
          if (closeErr) {
            console.error(`Error occurred while closing the compiler: ${closeErr.message}`)
            return reject(`Error occurred while closing the compiler: ${closeErr.message}`)
          }
          resolve(true)
        })
      })
    })
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[MeoCord] Failed to transpile config: ${error.message}`)
    } else {
      console.error(`[MeoCord] Failed to transpile config: Unknown error`)
    }
    return false
  } finally {
    rmSync(buildTsConfigTempPath, { force: true })
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

  const tempConfigFilePath = path.join(tempOutputDir, 'meocord.config.js')

  if (existsSync(tempConfigFilePath)) {
    try {
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
