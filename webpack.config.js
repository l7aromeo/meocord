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
import NodeExternals from 'webpack-node-externals'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import TerserPlugin from 'terser-webpack-plugin'
import { loadMeoCordConfig } from './dist/util/meocord-config-loader.util.js'
import { prepareModifiedTsConfig } from './dist/util/tsconfig.util.js'

const CWD = process.cwd()
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const SRC_DIR = path.resolve(CWD, 'src')
const DIST_DIR = path.resolve(CWD, 'dist')

const meocordConfig = loadMeoCordConfig()
const tsConfigPath = prepareModifiedTsConfig()

const baseRules = [
  {
    test: /\.ts$/,
    loader: 'ts-loader',
    options: {
      configFile: tsConfigPath,
      transpileOnly: true,
    },
    exclude: /node_modules/,
  },
]

/**
 * Merges two arrays returning unique elements
 */
const mergeUnique = (base = [], additions = []) => Array.from(new Set([...base, ...additions]))

/**
 * Creates webpack configuration with framework defaults
 */
const createWebpackConfig = (overrides = {}) => {
  const baseConfig = {
    mode: overrides.mode ?? (IS_PRODUCTION ? 'production' : 'development'),
    entry: overrides.entry ?? path.resolve(SRC_DIR, 'main.ts'),
    target: 'node',
    externals: mergeUnique([NodeExternals({ importType: 'module' })], overrides.externals),
    module: {
      ...overrides.module,
      rules: mergeUnique(baseRules, overrides.module?.rules),
    },
    resolve: {
      ...overrides.resolve,
      extensions: mergeUnique(['.ts', '.js'], overrides.resolve?.extensions),
      plugins: mergeUnique([new TsconfigPathsPlugin({ configFile: tsConfigPath })], overrides.resolve?.plugins),
    },
    output: {
      filename: 'main.js',
      path: DIST_DIR,
      publicPath: path.join(process.cwd(), 'dist/'),
      library: { type: 'module' },
      clean: IS_PRODUCTION,
      ...overrides.output,
    },
    experiments: {
      outputModule: true,
      ...overrides.experiments,
    },
    stats: overrides.stats ?? (IS_PRODUCTION ? 'normal' : 'errors-warnings'),
    devtool: overrides.devtool ?? (IS_PRODUCTION ? 'source-map' : 'eval-source-map'),
    performance: {
      hints: overrides.performance?.hints ?? (IS_PRODUCTION ? 'warning' : false),
      ...overrides.performance,
    },
    ...overrides,
    optimization: {
      ...overrides.optimization,
      minimize: overrides.optimization?.minimize ?? IS_PRODUCTION,
      minimizer: [],
    },
  }

  const finalMinimizerArray = []
  const shouldMinimize = baseConfig.optimization.minimize

  if (shouldMinimize) {
    const userProvidedMinimizers = overrides.optimization?.minimizer
    let lastTerserInstance = null
    const otherMinimizers = []

    if (Array.isArray(userProvidedMinimizers)) {
      for (let i = userProvidedMinimizers.length - 1; i >= 0; i--) {
        const minimizer = userProvidedMinimizers[i]
        if (minimizer?.constructor?.name === 'TerserPlugin') {
          if (!lastTerserInstance) {
            lastTerserInstance = minimizer
          }
        } else if (minimizer) {
          otherMinimizers.unshift(minimizer)
        }
      }
    }

    finalMinimizerArray.push(...otherMinimizers)

    let terserPluginToUse
    if (lastTerserInstance) {
      terserPluginToUse = new TerserPlugin({
        test: lastTerserInstance.options?.test,
        include: lastTerserInstance.options?.include,
        exclude: lastTerserInstance.options?.exclude,
        extractComments: lastTerserInstance.options?.extractComments,
        parallel: lastTerserInstance.options?.parallel,
        minify: lastTerserInstance.options?.minify,
        terserOptions: {
          ...(lastTerserInstance.options?.terserOptions || {}),
          keep_classnames: true,
        },
      })
    } else {
      terserPluginToUse = new TerserPlugin({ terserOptions: { keep_classnames: true } })
    }

    finalMinimizerArray.push(terserPluginToUse)
  }

  baseConfig.optimization.minimizer = finalMinimizerArray

  return baseConfig
}

const initialConfig = createWebpackConfig()
const userModifiedConfig = meocordConfig?.webpack?.(initialConfig)
export default createWebpackConfig(userModifiedConfig ?? {})
