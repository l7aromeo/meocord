require('ts-node').register()
const path = require('path')
const NodeExternals = require('webpack-node-externals')
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')
const { existsSync } = require('fs')

const prepareModifiedTsConfig = require('./src/util/tsconfig.util')
const meocordConfigPath = path.resolve(process.cwd(), 'meocord.config.ts')
const meocordConfig = existsSync(meocordConfigPath) ? require(meocordConfigPath).default : null

const tsConfigPath = prepareModifiedTsConfig()

const baseRules = [
  {
    test: /\.ts$/,
    use: 'ts-loader',
    exclude: /node_modules/,
  },
  {
    test: /\.(gif|jpg|jpeg|png|svg|woff|woff2|eot|ttf|otf)$/i,
    type: 'javascript/auto',
    exclude: /node_modules/,
    use: {
      loader: 'file-loader',
      options: { name: '[path][name].[ext]' },
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
 * @param {Object} [config={}] - Custom overrides for the base configuration.
 * @param {Object} [config.module] - Additional module configuration (like rules).
 * @param {string} [config.mode] - Webpack mode (e.g., development or production).
 * @returns {Object} The Webpack configuration object.
 */
const baseConfig = (config = {}) => ({
  mode: config.mode || (process.env.NODE_ENV === 'production' ? 'production' : 'development'),
  entry: path.resolve(process.cwd(), 'src/main.ts'),
  target: 'node',
  optimization: {
    minimize: process.env.NODE_ENV === 'production',
    minimizer: [
      new TerserPlugin({
        terserOptions: { keep_classnames: true },
      }),
    ],
  },
  externals: [NodeExternals()],
  module: {
    ...config.module,
    rules: [...baseRules, ...(config.module?.rules || [])],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    plugins: [
      new TsconfigPathsPlugin({
        configFile: tsConfigPath,
      }),
    ],
  },
  output: {
    filename: 'main.js',
    path: path.resolve(process.cwd(), 'dist'),
    publicPath: 'dist/',
  },
  stats: 'errors-only',
})

module.exports = meocordConfig?.webpack?.(baseConfig) || baseConfig()
