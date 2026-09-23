import type { Linter } from 'eslint'

/**
 * Default MeoCord ESLint configuration, with the TypeScript config on it as `typescriptConfig`.
 * `meocord.eslint.cjs` assigns the array to `module.exports`, so `require('meocord/eslint')` is the
 * array itself.
 */
declare const config: Linter.Config[] & {
  /** Pre-configured TypeScript ESLint config for MeoCord projects. */
  typescriptConfig: Linter.Config
}

export = config
