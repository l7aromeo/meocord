/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { ControllerType } from '@src/enum/controller.enum.js'
import { ControllerGeneratorHelper } from '@src/bin/helper/controller-generator.helper.js'
import { toClassName } from '@src/util/generator-cli.util.js'

describe('ControllerGeneratorHelper', () => {
  const helper = new ControllerGeneratorHelper()

  // The type list the CLI offers is derived from the enum, so a member without a
  // template file is not a compile error -- it is a crash the first time somebody
  // generates that controller.
  it.each(Object.values(ControllerType))('renders a template for the %s controller type', type => {
    const rendered = helper.buildControllerTemplate('Sample', type)

    expect(rendered).toContain('@Controller()')
    expect(rendered).toContain('Sample')
    expect(rendered).not.toContain('{{className}}')
  })

  // The generated spec file imports `<Name><Type>Controller`, derived from the type
  // rather than read from the template. A template that names its class anything else
  // produces a spec that does not compile.
  it.each(Object.values(ControllerType))('names the %s controller class the way its spec imports it', type => {
    const expected = `Sample${toClassName(type.replace(/-/g, ' '))}Controller`

    expect(helper.buildControllerTemplate('Sample', type)).toContain(`export class ${expected}`)
  })

  // The builder is written beside the controller, so a nested controller name moves it
  // too. A hard-coded `@src/controllers/<type>/builders/...` import only ever pointed
  // at the top-level one, so a nested slash controller imported a file that did not
  // exist and the generated app failed to build.
  describe('builder import path', () => {
    const builderTypes = [ControllerType.SLASH, ControllerType.CONTEXT_MENU, ControllerType.PRIMARY_ENTRY_POINT]

    it.each(builderTypes)('points at the top-level builder for a flat %s name', type => {
      expect(helper.buildControllerTemplate('Sample', type)).toContain(
        `'@src/controllers/${type}/builders/sample.builder'`,
      )
    })

    it.each(builderTypes)('follows a nested %s name to where the builder is written', type => {
      expect(helper.buildControllerTemplate('Profile', type, ['admin'])).toContain(
        `'@src/controllers/${type}/admin/builders/sample.builder'`,
      )
    })

    it('follows more than one level of nesting', () => {
      expect(helper.buildControllerTemplate('Profile', ControllerType.SLASH, ['admin', 'users'])).toContain(
        "'@src/controllers/slash/admin/users/builders/sample.builder'",
      )
    })
  })

  it('rejects a controller type it has no template for', () => {
    expect(() => helper.buildControllerTemplate('Sample', 'nope' as ControllerType)).toThrow(
      'Unsupported controller type: nope',
    )
  })
})
