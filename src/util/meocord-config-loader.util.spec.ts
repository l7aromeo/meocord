import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { vi } from 'vitest'

let project: string

/** A fresh copy of the module, so its cache starts empty. */
async function freshLoader() {
  vi.resetModules()
  return import('@src/util/meocord-config-loader.util.js')
}

beforeEach(() => {
  project = mkdtempSync(path.join(tmpdir(), 'meocord-config-'))
  vi.spyOn(process, 'cwd').mockReturnValue(project)
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(project, { recursive: true, force: true })
})

function writeCompiledConfig(source: string) {
  mkdirSync(path.join(project, 'dist'), { recursive: true })
  writeFileSync(path.join(project, 'dist', 'meocord.config.mjs'), source)
}

describe('loadMeoCordConfig', () => {
  it('loads the default export of dist/meocord.config.mjs', async () => {
    writeCompiledConfig(`export default { appName: 'Compiled', discordToken: 'token' }\n`)
    const { loadMeoCordConfig } = await freshLoader()

    expect(loadMeoCordConfig()).toEqual({ appName: 'Compiled', discordToken: 'token' })
  })

  // The source is the CLI's to read. A bot has no transpiler for it, and in production no source.
  it('does not read meocord.config.ts, even when there is no compiled config', async () => {
    writeFileSync(path.join(project, 'meocord.config.ts'), `export default { appName: 'Source' }\n`)
    const { loadMeoCordConfig } = await freshLoader()

    expect(loadMeoCordConfig()).toBeUndefined()
  })

  it('reports a compiled config that fails to load, and returns undefined', async () => {
    writeCompiledConfig(`throw new Error('broken config')\n`)
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { loadMeoCordConfig } = await freshLoader()

    expect(loadMeoCordConfig()).toBeUndefined()
    expect(error).toHaveBeenCalledWith(expect.stringContaining('broken config'))
  })

  it('loads once and returns the cached result after', async () => {
    writeCompiledConfig(`export default { appName: 'First' }\n`)
    const { loadMeoCordConfig } = await freshLoader()
    const first = loadMeoCordConfig()
    writeCompiledConfig(`export default { appName: 'Second' }\n`)

    expect(loadMeoCordConfig()).toBe(first)
  })

  // The logger and the factory import this module, so a bot bundled with bundleDependencies
  // carries whatever it imports. jiti would be most of a minimal bot's bundle.
  it('imports no transpiler', () => {
    const source = readFileSync(path.join(import.meta.dirname, 'meocord-config-loader.util.ts'), 'utf8')
    const imports = [...source.matchAll(/^import .* from '([^']+)'/gm)].map(match => match[1])

    expect(imports).not.toContain('jiti')
    expect(imports.filter(specifier => specifier.startsWith('@src/'))).toEqual(['@src/interface/index.js'])
  })
})
