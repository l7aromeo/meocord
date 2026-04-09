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
