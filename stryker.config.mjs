// @ts-check
/**
 * Mutation testing for the framework's core, run by hand with `bun run test:mutation [module]`; it is
 * not a CI check. Each module is mutated on its own, and every mutant faces the framework's whole
 * runtime suite (vitest.mutation.config.ts). Reports land in reports/mutation/.
 *
 * The command runner activates a mutant through the environment. The vitest runner would be faster,
 * but on Vitest 5 it reports covered mutants as survived: stryker-mutator/stryker-js#6210.
 */

/** Each module: the files it mutates. */
export const modules = {
  'guard-runner': {
    mutate: ['src/core/guard-runner.ts'],
  },
  'filter-runner': {
    mutate: ['src/core/filter-runner.ts'],
  },
  'interceptor-runner': {
    mutate: ['src/core/interceptor-runner.ts'],
  },
  'handler-pipeline': {
    mutate: ['src/core/handler-pipeline.ts'],
  },
  'input-runner': {
    mutate: ['src/core/input-runner.ts'],
  },
  response: {
    mutate: ['src/common/response/*.ts', '!src/common/response/*.spec.ts', '!src/common/response/*.test-d.ts'],
  },
  defer: {
    mutate: ['src/core/defer.ts', 'src/decorator/defer.decorator.ts'],
  },
  'command-registration': {
    mutate: ['src/core/command-registration.ts'],
  },
  cooldown: {
    mutate: ['src/core/cooldown-runner.ts', 'src/common/cooldown-store.ts', 'src/decorator/cooldown.decorator.ts'],
  },
  translator: {
    mutate: ['src/common/translator.ts'],
  },
}

const name = process.env.MUTATION_MODULE ?? 'translator'
const module = modules[/** @type {keyof typeof modules} */ (name)]
if (!module) throw new Error(`Unknown mutation module "${name}"; one of: ${Object.keys(modules).join(', ')}.`)

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: 'command',
  commandRunner: { command: 'node node_modules/vitest/vitest.mjs run --config vitest.mutation.config.ts' },
  coverageAnalysis: 'off',
  // Each run starts the whole suite with workers of its own; more at once only starves them into timeouts.
  concurrency: 4,
  timeoutMS: 30_000,
  mutate: module.mutate,
  reporters: ['clear-text', 'progress-append-only', 'html', 'json'],
  htmlReporter: { fileName: `reports/mutation/${name}.html` },
  jsonReporter: { fileName: `reports/mutation/${name}.json` },
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
}
