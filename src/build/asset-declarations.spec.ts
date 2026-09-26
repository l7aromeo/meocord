import { readFileSync } from 'fs'
import path from 'path'
import { createRsbuild, type Rspack } from '@rsbuild/core'
import { createRsbuildConfig } from '@src/build/rsbuild-config.js'

/**
 * A new application's src/assets.d.ts types what importing a file gives. It must name every extension the
 * build emits as an asset, and the ones its config reads as text, or an import that builds fails the app's
 * own typecheck.
 */
const template = (file: string) => readFileSync(path.join(import.meta.dirname, '..', 'bin', 'app-template', file), 'utf8')
const declared = [...template('src/assets.d.ts.template').matchAll(/^declare module '\*\.([a-z\d]+)'/gm)].map(([, ext]) => ext)

/** The extensions a rule's test names, from the `\.(?:a|b)$` or `\.a$` form Rsbuild writes them in. */
function extensionsOf(test: unknown): string[] {
  const source = test instanceof RegExp ? test.source : ''
  const match = source.match(/^\\\.(?:\(\?:([a-z\d|]+)\)|([a-z\d]+))\$$/)
  return match ? (match[1] ?? match[2]).split('|') : []
}

async function emittedExtensions(): Promise<string[]> {
  const rsbuild = await createRsbuild({ config: createRsbuildConfig({ mode: 'production', entry: 'src/main.ts' }) })
  const [config] = await rsbuild.initConfigs()
  const rules = (config.module?.rules ?? []) as Rspack.RuleSetRule[]
  // An asset rule sends a plain import, one with no query, to a rule of type 'asset' or 'asset/resource'
  return rules
    .filter(rule => rule?.oneOf?.some(inner => inner && (inner.type === 'asset' || inner.type === 'asset/resource')))
    .flatMap(rule => extensionsOf(rule.test))
}

describe('the application template’s asset declarations', () => {
  it('declare every extension the build emits as an asset, and no other', async () => {
    const emitted = await emittedExtensions()

    expect(emitted.length).toBeGreaterThan(20)
    expect(declared.filter(ext => !['md', 'html'].includes(ext)).sort()).toEqual([...new Set(emitted)].sort())
  })

  it('declare the extensions the template’s config reads as text', () => {
    const rule = template('meocord.config.ts.template').match(/test: \/\\\.\(([a-z|]+)\)\$\/i, type: 'asset\/source'/)

    expect(rule?.[1].split('|').sort()).toEqual(['html', 'md'])
    expect(declared).toEqual(expect.arrayContaining(['md', 'html']))
  })
})
