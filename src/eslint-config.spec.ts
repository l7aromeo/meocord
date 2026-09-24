import { createRequire } from 'module'
import { ESLint, type Linter } from 'eslint'
import esmConfig from '../meocord.eslint.mjs'

// `meocord/eslint` is what a generated application lints with, and flat config does not read
// .gitignore, so build and coverage output is skipped only if these configs ignore it themselves.
const cjsConfig: Linter.Config[] = createRequire(import.meta.url)('../meocord.eslint.cjs')

describe.each([
  ['meocord.eslint.mjs', esmConfig as Linter.Config[]],
  ['meocord.eslint.cjs', cjsConfig],
])('%s', (_name, config) => {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config })

  it.each(['dist/main.js', 'coverage/prettify.js', 'coverage/lcov-report/sorter.js'])(
    'ignores %s',
    async file => {
      expect(await eslint.isPathIgnored(file)).toBe(true)
    },
  )

  it('still lints application sources', async () => {
    expect(await eslint.isPathIgnored('src/main.ts')).toBe(false)
  })
})
