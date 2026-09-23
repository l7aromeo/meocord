/**
 * MeoCord Framework
 * Copyright (c) 2025-present Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import path from 'path'
import { type RsbuildConfig } from '@rsbuild/core'
import { prepareModifiedTsConfig } from '@src/util/tsconfig.util.js'

/** How the bundler is asked to build an application. */
export interface RsbuildConfigOptions {
  /** Production enables minification; development keeps readable output. */
  mode: 'production' | 'development'
  /** Entry module. Defaults to `src/main.ts` under the current working directory. */
  entry?: string
  /**
   * Bundle production dependencies into the output so it runs without `node_modules`.
   *
   * Off by default, which is what webpack-node-externals did: dependencies stay runtime
   * imports and have to be installed beside the output.
   */
  bundleDependencies?: boolean
  /**
   * Modules to leave as runtime imports even when bundling.
   *
   * Native addons cannot be bundled -- a `.node` binary is not JavaScript and is built for
   * one platform -- so anything reaching one has to be listed here and installed in
   * production. `sharp` and canvas bindings are the usual cases.
   */
  externals?: (string | RegExp)[]
}

/**
 * The bundler configuration MeoCord builds an application with.
 *
 * Returned rather than written to disk: it used to live in a `webpack.config.js` at the
 * package root that was shipped and then re-read at runtime by walking three directories up
 * from `dist/esm/bin`. Building it here makes it typed, testable, and not something a
 * consumer can edit by accident.
 */
export function createRsbuildConfig(options: RsbuildConfigOptions): RsbuildConfig {
  const { mode, bundleDependencies = false, externals = [] } = options
  const cwd = process.cwd()
  const entry = options.entry ?? path.resolve(cwd, 'src', 'main.ts')

  return {
    source: {
      entry: { main: entry },
      // Equivalent to experimentalDecorators. The decorators themselves are only half of
      // what MeoCord needs -- see tools.swc below for the half that carries the metadata.
      decorators: { version: 'legacy' },
      tsconfigPath: prepareModifiedTsConfig(),
    },
    tools: {
      swc: {
        jsc: {
          // Rsbuild leaves externalHelpers on, which emits the decorator helpers as imports
          // from `@swc/helpers` -- which in turn wants `tslib` resolvable in the application.
          // Inlining them keeps the output self-contained, which matters most when
          // bundleDependencies is on and there is no node_modules to resolve through.
          externalHelpers: false,
          transform: {
            legacyDecorator: true,
            // Inversify resolves constructor arguments from `design:paramtypes`, which swc
            // emits only with this on. Without it every @Controller throws while its class is
            // being defined. It is deep-merged into builtin:swc-loader rather than replacing
            // it, so the rest of Rsbuild's swc defaults still apply.
            decoratorMetadata: true,
          },
        },
      },
    },
    output: {
      target: 'node',
      // Rsbuild 2 already defaults Node builds to ESM; stated so the output format does not
      // silently change with a future default.
      module: true,
      // Inverted deliberately: autoExternal leaves dependencies as runtime imports, so
      // bundling them means turning it off.
      autoExternal: !bundleDependencies,
      externals,
      // Rsbuild would put the bundle in dist/static/js and assets in dist/static/*. The
      // application's entry is dist/main.js, which is what `meocord start` runs.
      distPath: { root: path.resolve(cwd, 'dist'), js: '', image: 'assets', svg: 'assets', font: 'assets', media: 'assets' },
      filename: { js: '[name].js' },
      minify: {
        // Off by default for Node targets in Rsbuild 2, so production builds would ship
        // unminified unless this is stated.
        js: mode === 'production',
        jsOptions: {
          minimizerOptions: {
            // Inversify resolves dependencies by class identity, so a mangled class name
            // breaks injection in production while development stays fine. The webpack build
            // carried the same setting through terser's `keep_classnames`.
            mangle: { keep_classnames: true, keep_fnames: true },
            compress: { keep_classnames: true, keep_fnames: true },
          },
        },
      },
    },
    mode,
    performance: {
      // The bot is not served over a network; splitting it only makes startup resolve more files.
      chunkSplit: { strategy: 'all-in-one' },
    },
  }
}
