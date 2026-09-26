import { optionalProbeWarning } from '@src/build/optional-probes.js'

const unresolved = (request: string, from: string) =>
  `  ⚠ Module not found: Can't resolve '${request}' in '${from}'\n    ╭─[32:26]\n 32 │     const supportsColor = require('${request}');\n`

describe('optionalProbeWarning', () => {
  it('names the package that probes for supports-color and the option that silences it', () => {
    expect(optionalProbeWarning(unresolved('supports-color', '/app/node_modules/debug/src'))).toBe(
      "debug tries to load supports-color, which is not installed, and runs without it. List it in optionalExternals in meocord.config.ts to load it when it is installed and silence this warning: optionalExternals: ['supports-color'].",
    )
  })

  it('names the innermost package, scoped or not, on any path separator', () => {
    expect(optionalProbeWarning(unresolved('supports-color', '/app/node_modules/axios/node_modules/debug/src'))).toMatch(/^debug tries/)
    expect(optionalProbeWarning(unresolved('supports-color', 'C:\\app\\node_modules\\@scope\\logger\\lib'))).toMatch(/^@scope\/logger tries/)
  })

  it('says a module probes for it when the path names no package', () => {
    expect(optionalProbeWarning(unresolved('supports-color', '/app/src'))).toMatch(/^A module tries to load supports-color/)
  })

  // A colour terminal gets the bundler's warnings with ANSI codes around its parts
  it('recognises the warning in colour', () => {
    const coloured = `  \u001b[33m⚠\u001b[0m Module not found: Can't resolve \u001b[1m'supports-color'\u001b[22m in \u001b[1m'/app/node_modules/debug/src'\u001b[22m`

    expect(optionalProbeWarning(coloured)).toMatch(/^debug tries to load supports-color, /)
  })

  it('leaves any other warning alone', () => {
    expect(optionalProbeWarning(unresolved('left-pad', '/app/node_modules/debug/src'))).toBeUndefined()
    expect(optionalProbeWarning('export was not found')).toBeUndefined()
  })
})
