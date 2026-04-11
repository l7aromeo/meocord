/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

const {importX} = require('eslint-plugin-import-x')
const globals = require('globals')
const tsParser = require('@typescript-eslint/parser')
const eslintTs = require('typescript-eslint')
const eslintConfigPrettier = require('eslint-config-prettier')
const eslintPluginPrettier = require('eslint-plugin-prettier')

const tsFiles = ['**/*.ts']

const languageOptions = {
  globals: {
    ...globals.node,
    ...globals.jest,
  },
  ecmaVersion: 2023,
  sourceType: 'module',
  parserOptions: {
    project: ['./tsconfig.json', './tsconfig.test.json', './tsconfig.eslint.json'],
  },
}

const typescriptConfig = {
  files: tsFiles,
  plugins: {
    'import-x': importX,
    prettier: eslintPluginPrettier,
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
        project: ['./tsconfig.json', './tsconfig.test.json', './tsconfig.eslint.json'],
      },
    },
  },
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-var-requires': 'warn',
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

module.exports = [
  {ignores: ['docs/*', 'build/*', 'lib/*', 'dist/*', 'meocord.config.ts', 'jest.config.ts']},
  ...recommendedTypeScriptConfigs,
  specConfig,
  eslintConfigPrettier,
  typescriptConfig,
]

module.exports.typescriptConfig = typescriptConfig
