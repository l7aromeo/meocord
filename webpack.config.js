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

const meocordConfig = loadMeoCordConfig()
const tsConfigPath = prepareModifiedTsConfig()

const baseRules = [
  {
    test: /\.ts$/,
    use: {
      loader: 'ts-loader',
      options: {
        configFile: tsConfigPath,
      },
    },
    exclude: /node_modules/,
  },
  {
    test: /\.(gif|jpg|jpeg|png|svg|woff|woff2|eot|ttf|otf)$/i,
    type: 'javascript/auto',
    exclude: /node_modules/,
    use: {
      loader: 'file-loader',
      options: { name: '[path][name].[ext]', context: path.resolve(process.cwd(), 'src') },
    },
  },
  {
    test: /\.html$/i,
    use: 'raw-loader',
  },
]

/**
 * Generates the base Webpack configuration for the project.
 * Uses `tsconfig` for resolving paths and applies custom `meocord` configuration if available.
 *
 * @param {import('webpack').Configuration} [config={}] Custom overrides for the base configuration.
 * @returns {import('webpack').Configuration} The Webpack configuration object.
 */
const baseConfig = (config = {}) => ({
  ...config,
  mode: config.mode || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
  entry: path.resolve(process.cwd(), config.entry || 'src/main.ts'),
  target: 'node',
  optimization: {
    ...config?.optimization,
    minimize: config?.optimization?.minimize ?? true,
    minimizer: Array.from(
      new Set([
        ...(config?.optimization?.minimizer || []),
        new TerserPlugin({ terserOptions: { keep_classnames: true } }),
      ]),
    ),
  },
  externals: Array.from(new Set([NodeExternals({ importType: 'module' }), ...(config?.externals || [])])),
  module: {
    ...config?.module,
    rules: Array.from(new Set([...baseRules, ...(config?.module?.rules || [])])),
  },
  resolve: {
    ...config?.resolve,
    plugins: Array.from(
      new Set([new TsconfigPathsPlugin({ configFile: tsConfigPath }), ...(config?.resolve?.plugins || [])]),
    ),
    extensions: Array.from(new Set(['.ts', '.js', ...(config?.resolve?.extensions || [])])),
  },
  output: {
    ...config?.output,
    filename: 'main.js',
    path: path.resolve(process.cwd(), 'dist'),
    publicPath: 'dist/',
    library: {
      type: 'module',
    },
  },
  experiments: {
    outputModule: true,
  },
  stats: config?.stats || 'errors-only',
})

const userConfig = meocordConfig?.webpack?.(baseConfig())
export default baseConfig(userConfig)
