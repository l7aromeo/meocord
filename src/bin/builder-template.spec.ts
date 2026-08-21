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
import { Command } from '@src/decorator/controller.decorator.js'
import { CommandType } from '@src/enum/index.js'

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

const COMMAND_CALL = /@Command\(\s*'([^']+)'\s*,\s*CommandType\.(\w+)\s*\)/g

interface TemplateCommand {
  template: string
  pattern: string
  type: CommandType
}

function commandsOf(file: string): TemplateCommand[] {
  const source = readFileSync(file, 'utf8')
  const template = path.relative(templateDir, file)

  return [...source.matchAll(COMMAND_CALL)].map(([, pattern, member]) => ({
    template,
    pattern,
    type: CommandType[member as keyof typeof CommandType],
  }))
}

const allCommands = templateFiles(templateDir).flatMap(commandsOf)

// An invalid pattern is not a compile error -- `@Command` throws while the class is
// being defined, so a template carrying one typechecks, ships, and takes the user's
// bot down on the first import. `verify:generated` cannot see it either: it only
// typechecks the generated files, it never loads them.
describe('generator template command patterns', () => {
  it('finds command patterns to check', () => {
    expect(allCommands.length).toBeGreaterThan(0)
  })

  it.each(allCommands.map(({ template, pattern, type }) => [template, pattern, type] as const))(
    '%s declares a registrable pattern: %s',
    (_template, pattern, type) => {
      expect(type).toBeDefined()

      const declare = () => {
        const descriptor = { value: () => undefined } as TypedPropertyDescriptor<() => void>
        Command(pattern, type)({}, 'handle', descriptor as never)
      }

      expect(declare).not.toThrow()
    },
  )
})
