import importPlugin from 'eslint-plugin-import'
import globals from 'globals'
import tsParser from '@typescript-eslint/parser'
import eslintTs from 'typescript-eslint'
import eslintConfigPrettier from 'eslint-config-prettier'
import eslintPluginPrettier from 'eslint-plugin-prettier'

const tsFiles = ['**/*.ts']

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

export const typescriptConfig = {
  files: tsFiles,
  plugins: {
    import: importPlugin,
    prettier: eslintPluginPrettier,
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
  { ignores: ['docs/*', 'build/*', 'lib/*', 'dist/*', 'meocord.config.ts', 'jest.config.ts'] },
  ...recommendedTypeScriptConfigs,
  eslintConfigPrettier,
  typescriptConfig,
]
