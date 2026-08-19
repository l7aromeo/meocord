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

  it('rejects a controller type it has no template for', () => {
    expect(() => helper.buildControllerTemplate('Sample', 'nope' as ControllerType)).toThrow(
      'Unsupported controller type: nope',
    )
  })
})
