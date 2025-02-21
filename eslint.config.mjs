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

import importPlugin from 'eslint-plugin-import'
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import eslintJs from '@eslint/js'
import eslintTs from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import eslintPluginPrettier from 'eslint-plugin-prettier'
import unusedImports from 'eslint-plugin-unused-imports'

const tsFiles = ['**/*.ts']
const jsFiles = ['**/*.js']

const languageOptions = {
  globals: {
    ...globals.node,
    ...globals.jest,
  },
  ecmaVersion: 2023,
  sourceType: 'commonjs',
  parserOptions: {
    project: './tsconfig.json',
  },
}

const typescriptConfig = {
  files: tsFiles,
  plugins: {
    import: importPlugin,
    prettier: eslintPluginPrettier,
    'unused-imports': unusedImports,
  },
  languageOptions: {
    ...languageOptions,
    parser: tsParser,
  },
  settings: {
    'import/parsers': {
      '@typescript-eslint/parser': ['.ts'],
    },
    'import/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json',
      },
    },
  },
  rules: {
    ...importPlugin.configs.typescript.rules,
    'prettier/prettier': 'error',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-var-requires': 'warn',
    'unused-imports/no-unused-imports': 'error',
    '@typescript-eslint/no-unused-expressions': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        ignoreRestSiblings: true,
        args: 'none',
      },
    ],
  },
}

const javaScriptConfig = {
  files: jsFiles,
  plugins: {
    import: importPlugin,
    prettier: eslintPluginPrettier,
    'unused-imports': unusedImports,
  },
  languageOptions,
  rules: {
    ...eslintJs.configs.recommended.rules,
    ...importPlugin.configs.recommended.rules,
    'prettier/prettier': 'error',
    'unused-imports/no-unused-imports': 'error',
    'no-var': 'error',
    'prefer-const': 'warn',
    'no-unused-vars': [
      'error',
      {
        ignoreRestSiblings: true,
        args: 'none',
      },
    ],
  },
}

const recommendedTypeScriptConfigs = [
  ...eslintTs.configs.recommended.map(config => ({
    ...config,
    files: tsFiles,
  })),
  ...eslintTs.configs.stylistic.map(config => ({
    ...config,
    files: tsFiles,
  })),
]

export default [
  { ignores: ['dist/*'] },
  ...recommendedTypeScriptConfigs,
  eslintConfigPrettier,
  typescriptConfig,
  javaScriptConfig,
]
