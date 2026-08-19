/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { readdirSync, readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as discord from 'discord.js'
import * as meocordCommon from '@src/common/index.js'
import * as meocordDecorator from '@src/decorator/index.js'
import * as meocordEnum from '@src/enum/index.js'
import * as meocordTesting from '@src/testing/index.js'

const templateDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'builder-template')

/**
 * The modules a template may import runtime values from, and what they really export.
 *
 * `meocord/interface` is absent on purpose: it ships types only, so there is nothing
 * to check at runtime and a name imported from it cannot be verified this way.
 * `@src/...` imports point into the generated application, which does not exist yet.
 */
const RUNTIME_MODULES: Record<string, object> = {
  'meocord/common': meocordCommon,
  'meocord/decorator': meocordDecorator,
  'meocord/enum': meocordEnum,
  'meocord/testing': meocordTesting,
  'discord.js': discord,
}

const NAMED_IMPORT = /import\s*\{([^}]*)\}\s*from\s*'([^']+)'/g

interface TemplateImport {
  template: string
  module: string
  name: string
}

function templateFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return templateFiles(full)
    return entry.name.endsWith('.template') ? [full] : []
  })
}

function importsOf(file: string): TemplateImport[] {
  const source = readFileSync(file, 'utf8')
  const template = path.relative(templateDir, file)
  const imports: TemplateImport[] = []

  for (const [, clause, module] of source.matchAll(NAMED_IMPORT)) {
    if (!(module in RUNTIME_MODULES)) continue

    for (const specifier of clause.split(',')) {
      const name = specifier.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0]
      // A type-only import has no runtime binding to look for.
      if (name === '' || specifier.trim().startsWith('type ')) continue
      imports.push({ template, module, name })
    }
  }

  return imports
}

const allImports = templateFiles(templateDir).flatMap(importsOf)

// Rendering a template proves nothing about whether the code it produces compiles.
// `context-menu` imported `CommandType` from `meocord/decorator`, which does not
// export it, so the generated controller failed to build -- and every render-only
// assertion passed regardless.
describe('generator templates', () => {
  it('finds imports to check', () => {
    expect(allImports.length).toBeGreaterThan(0)
  })

  it.each(allImports.map(({ template, module, name }) => [template, name, module] as const))(
    '%s imports %s from a module that exports it (%s)',
    (_template, name, module) => {
      expect(Object.keys(RUNTIME_MODULES[module])).toContain(name)
    },
  )
})
