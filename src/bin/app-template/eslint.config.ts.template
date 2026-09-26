import unusedImports from 'eslint-plugin-unused-imports'
import meocordESLint, { typescriptConfig } from 'meocord/eslint'

const customConfig = {
  ...typescriptConfig,
  plugins: {
    ...typescriptConfig.plugins,
    'unused-imports': unusedImports,
  },
  rules: {
    ...typescriptConfig.rules,
    // Names what replaces an API MeoCord or a library has deprecated, in the editor and in lint
    '@typescript-eslint/no-deprecated': 'warn',
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'error',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_',
      },
    ],
  },
}

// Specs reference mocked methods whose overloads include deprecated ones, as `expect(interaction.reply)` does
const specConfig = {
  files: ['**/*.spec.ts'],
  rules: {
    '@typescript-eslint/no-deprecated': 'off',
  },
}

export default [...meocordESLint, customConfig, specConfig]
