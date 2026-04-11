/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { importX } from 'eslint-plugin-import-x'
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import eslintJs from '@eslint/js'
import eslintTs from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import eslintPluginPrettier from 'eslint-plugin-prettier'
import unusedImports from 'eslint-plugin-unused-imports'
import headers from 'eslint-plugin-headers'

const tsFiles = ['**/*.ts']
const jsFiles = ['**/*.js']

const languageOptions = {
  globals: {
    ...globals.node,
    ...globals.jest,
  },
  ecmaVersion: 2023,
  sourceType: 'module',
  parserOptions: {
    project: ['./tsconfig.json', './tsconfig.test.json'],
  },
}

const typescriptConfig = {
  files: tsFiles,
  plugins: {
    headers,
    'import-x': importX,
    prettier: eslintPluginPrettier,
    'unused-imports': unusedImports,
  },
  languageOptions: {
    ...languageOptions,
    parser: tsParser,
  },
  settings: {
    'import-x/parsers': {
      '@typescript-eslint/parser': ['.ts'],
    },
    'import-x/resolver': {
      typescript: {
        alwaysTryTypes: true,
        project: ['./tsconfig.json', './tsconfig.test.json'],
      },
    },
  },
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-var-requires': 'warn',
    'unused-imports/no-unused-imports': 'error',
    '@typescript-eslint/no-unused-expressions': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'all',
        argsIgnorePattern: '^_',
      },
    ],
    "headers/header-format": [
      "error",
      {
        source: "string",
        content:
          "MeoCord Framework\n" +
          "Copyright (c) 2025 Ukasyah Rahmatullah Zada\n" +
          "SPDX-License-Identifier: MIT"
      }
    ]
  },
}

const javaScriptConfig = {
  files: jsFiles,
  plugins: {
    headers,
    'import-x': importX,
    prettier: eslintPluginPrettier,
    'unused-imports': unusedImports,
  },
  languageOptions,
  rules: {
    ...eslintJs.configs.recommended.rules,
    'prettier/prettier': 'error',
    'unused-imports/no-unused-imports': 'error',
    'no-var': 'error',
    'prefer-const': 'warn',
    'no-unused-vars': [
      'error',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'all',
        argsIgnorePattern: '^_',
      },
    ],
  },
}

const webpackConfig = {
  files: ['webpack.config.js'],
  plugins: {
    headers,
    'import-x': importX,
    prettier: eslintPluginPrettier,
    'unused-imports': unusedImports,
  },
  languageOptions,
  rules: {
    ...eslintJs.configs.recommended.rules,
    'prettier/prettier': 'error',
    'unused-imports/no-unused-imports': 'error',
    'no-var': 'error',
    'prefer-const': 'warn',
    'no-unused-vars': [
      'error',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'all',
        argsIgnorePattern: '^_',
      },
    ],
    'import-x/no-unresolved': 'off',
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

const specConfig = {
  files: ['**/*.spec.ts'],
  rules: {
    '@typescript-eslint/no-empty-function': 'off',
  },
}

export default [
  { ignores: ['dist/*', 'rollup.config.js'] },
  ...recommendedTypeScriptConfigs,
  eslintConfigPrettier,
  typescriptConfig,
  specConfig,
  javaScriptConfig,
  webpackConfig,
]
