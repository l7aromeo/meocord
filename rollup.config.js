/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import swc from '@rollup/plugin-swc'
import alias from '@rollup/plugin-alias'
import resolve from '@rollup/plugin-node-resolve'
import json from '@rollup/plugin-json'
import copy from 'rollup-plugin-copy'
import dts from 'rollup-plugin-dts'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const libraryEntries = {
  'core/index': 'src/core/index.ts',
  'common/index': 'src/common/index.ts',
  'decorator/index': 'src/decorator/index.ts',
  'interface/index': 'src/interface/index.ts',
  'enum/index': 'src/enum/index.ts',
  'testing/index': 'src/testing/index.ts',
}

const cliEntry = {
  'bin/meocord': 'src/bin/meocord.ts',
}

/** Internal utils consumed by webpack.config.js (not in exports map) */
const internalEntries = {
  'util/tsconfig.util': 'src/util/tsconfig.util.ts',
}

const allEntries = { ...libraryEntries, ...cliEntry, ...internalEntries }

const aliasPlugin = alias({
  entries: [{ find: /^@src\/(.*)/, replacement: path.resolve(__dirname, 'src/$1') }],
})

const swcPlugin = swc({
  include: /\.ts$/,
  swc: {
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
})

const resolvePlugin = resolve({ extensions: ['.ts', '.js'] })

const external = id => {
  // Internal path aliases are NOT external
  if (id.startsWith('@src/')) return false
  // Node built-ins
  if (/^node:/.test(id)) return true
  if (/^(fs|path|os|url|module|child_process)$/.test(id)) return true
  // All node_modules
  if (/^[a-zA-Z@]/.test(id)) return true
  return false
}

/** Suppress expected warnings for type-only barrel files */
const onwarn = (warning, warn) => {
  if (warning.code === 'EMPTY_BUNDLE' && warning.message.includes('interface/index')) {
    return // Type-only files produce empty bundles by design
  }
  warn(warning)
}

/** CJS build: library entries only (no CLI) */
const cjsBuild = {
  input: libraryEntries,
  external,
  onwarn,
  plugins: [aliasPlugin, swcPlugin, json(), resolvePlugin],
  output: {
    dir: 'dist/cjs',
    format: 'cjs',
    entryFileNames: '[name].cjs',
    chunkFileNames: '_shared/[name]-[hash].cjs',
    preserveModules: false,
    sourcemap: false,
  },
}

/** ESM build: all entries (library + CLI), preserves directory structure */
const esmBuild = {
  input: allEntries,
  external,
  onwarn,
  plugins: [
    aliasPlugin,
    swcPlugin,
    json(),
    resolvePlugin,
    copy({
      targets: [
        {
          src: 'src/bin/builder-template',
          dest: 'dist/esm/bin',
        },
      ],
    }),
  ],
  output: {
    dir: 'dist/esm',
    format: 'es',
    entryFileNames: '[name].js',
    chunkFileNames: '[name].js',
    preserveModules: true,
    preserveModulesRoot: 'src',
    sourcemap: false,
  },
}

/** Declaration build: library entries only */
const dtsBuild = {
  input: libraryEntries,
  external,
  onwarn,
  plugins: [aliasPlugin, dts()],
  output: {
    dir: 'dist/types',
    format: 'es',
    entryFileNames: '[name].d.ts',
  },
}

export default [esmBuild, cjsBuild, dtsBuild]
