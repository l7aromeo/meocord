const path = require('path')
const NodeExternals = require('webpack-node-externals')
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin')
const TerserPlugin = require('terser-webpack-plugin')
const { loadMeoCordConfig } = require(path.resolve(__dirname, 'dist/util/meocord-config-loader.util'))
const meocordConfig = loadMeoCordConfig()
const { prepareModifiedTsConfig } = require(path.resolve(__dirname, 'dist/util/tsconfig.util'))
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
    minimize: config?.optimization?.minimize || true,
    minimizer: [
      new TerserPlugin({
        terserOptions: { keep_classnames: true },
      }),
      ...(config?.optimization?.minimizer || []),
    ],
  },
  externals: [NodeExternals(), ...(config?.externals || [])],
  module: {
    ...config?.module,
    rules: [...baseRules, ...(config?.module?.rules || [])],
  },
  resolve: {
    ...config?.resolve,
    extensions: ['.ts', '.js', ...(config?.resolve?.extensions || [])],
    plugins: [
      new TsconfigPathsPlugin({
        configFile: tsConfigPath,
      }),
      ...(config?.resolve?.plugins || []),
    ],
  },
  output: {
    filename: 'main.js',
    path: path.resolve(process.cwd(), 'dist'),
    publicPath: 'dist/',
    ...config?.output,
  },
  stats: config?.stats || 'errors-only',
})

module.exports = meocordConfig?.webpack?.(baseConfig()) || baseConfig()
