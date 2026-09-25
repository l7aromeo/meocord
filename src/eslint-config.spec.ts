import { vi } from 'vitest'
import fs from 'fs'
import { createRequire } from 'module'
import os from 'os'
import path from 'path'
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

describe('import-x/no-cycle', () => {
  // The real path: macOS links its temp folder, and the resolver answers with where the link points
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'meocord-no-cycle-')))
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

  // A project of its own, with the three tsconfigs the config's type-aware parser reads
  const tsconfig = { compilerOptions: { strict: true, module: 'ESNext', moduleResolution: 'Bundler' }, include: ['src/**/*.ts'] }
  for (const name of ['tsconfig.json', 'tsconfig.test.json', 'tsconfig.eslint.json']) {
    fs.writeFileSync(path.join(root, name), JSON.stringify(tsconfig))
  }
  const files: Record<string, string> = {
    // Two classes that import each other, as two services injecting one another would
    'notes.ts': "import { Store } from './store'\n\nexport class Notes {\n  constructor(readonly store: Store) {}\n}\n",
    'store.ts': "import { Notes } from './notes'\n\nexport class Store {\n  constructor(readonly notes: Notes) {}\n}\n",
    // A cycle through a type-only import loses nothing at runtime
    'user.ts': "import type { Team } from './team'\n\nexport interface User {\n  team: Team\n}\n",
    'team.ts': "import type { User } from './user'\n\nexport interface Team {\n  members: User[]\n}\n",
  }
  fs.mkdirSync(path.join(root, 'src'))
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(root, 'src', name), text)

  const lintCycles = async (file: string) => {
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [
        ...(esmConfig as Linter.Config[]),
        { files: ['**/*.ts'], languageOptions: { parserOptions: { tsconfigRootDir: root } } },
      ],
    })
    const [result] = await eslint.lintFiles([path.join(root, 'src', file)])
    return result.messages
      .filter(message => message.ruleId === 'import-x/no-cycle')
      .map(message => [message.severity, message.message])
  }

  it('warns on two modules that import each other', async () => {
    expect(await lintCycles('notes.ts')).toEqual([[1, 'Dependency cycle detected']])
  })

  // A project created before the resolver joined the template: its imports cannot be resolved, so the check
  // stays off rather than warn on every import and fail `eslint --max-warnings=0`
  it('is left out, with the resolver setting, where the project cannot resolve the TypeScript resolver', async () => {
    const cwd = vi.spyOn(process, 'cwd').mockReturnValue(root)
    try {
      vi.resetModules()
      const esm = ((await import('../meocord.eslint.mjs')) as { default: Linter.Config[] }).default
      const requireFresh = createRequire(import.meta.url)
      delete requireFresh.cache[requireFresh.resolve('../meocord.eslint.cjs')]
      const cjs: Linter.Config[] = requireFresh('../meocord.eslint.cjs')

      for (const config of [esm, cjs]) {
        const merged = config.filter(entry => entry.rules?.['prettier/prettier'])
        expect(merged.map(entry => entry.rules?.['import-x/no-cycle'])).toEqual([undefined])
        expect(merged.map(entry => entry.settings?.['import-x/resolver'])).toEqual([undefined])

        const eslint = new ESLint({
          cwd: root,
          overrideConfigFile: true,
          overrideConfig: [...config, { files: ['**/*.ts'], languageOptions: { parserOptions: { tsconfigRootDir: root } } }],
        })
        const results = await eslint.lintFiles([path.join(root, 'src', 'notes.ts'), path.join(root, 'src', 'store.ts')])
        expect(results.flatMap(result => result.messages).filter(message => message.ruleId !== 'prettier/prettier')).toEqual([])
      }
    } finally {
      cwd.mockRestore()
    }
  })

  it('ignores a cycle made only of type imports', async () => {
    expect(await lintCycles('user.ts')).toEqual([])
  })
})
