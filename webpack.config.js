/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import path from 'path'
import TsconfigPathsPlugin from 'tsconfig-paths-webpack-plugin'
import TerserPlugin from 'terser-webpack-plugin'
import { loadMeoCordConfig } from './dist/esm/util/meocord-config-loader.util.js'
import { prepareModifiedTsConfig } from './dist/esm/util/tsconfig.util.js'
import nodeExternals from 'webpack-node-externals'

const CWD = process.cwd()
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const SRC_DIR = path.resolve(CWD, 'src')
const DIST_DIR = path.resolve(CWD, 'dist')

// Note: meocordConfig is loaded lazily inside createWebpackConfig()
// to avoid Bun's aggressive module caching issues in Docker containers
const tsConfigPath = prepareModifiedTsConfig()

const baseRules = [
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
    externals: mergeUnique([nodeExternals({ importType: 'module' })], overrides.externals),
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

// Load user config lazily (fixes Bun Docker caching issues)
const meocordConfig = loadMeoCordConfig()
const initialConfig = createWebpackConfig()
const userModifiedConfig = meocordConfig?.webpack?.(initialConfig)
export default createWebpackConfig(userModifiedConfig ?? {})
