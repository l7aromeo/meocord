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

export default [...meocordESLint, customConfig]
