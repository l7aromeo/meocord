import { stripVTControlCharacters } from 'node:util'
import type { Rspack } from '@rsbuild/core'

const NAME = 'MeoCordOptionalProbesPlugin'

/** Packages dependencies try to load inside a `try` and run without, as `debug` does `supports-color`. */
const OPTIONAL_PROBES: readonly string[] = ['supports-color']

const UNRESOLVED = /Module not found: Can't resolve '([^']+)' in '([^']+)'/

/**
 * The warning to show instead of the bundler's "Can't resolve" for a package a dependency only probes
 * for, naming the dependency and `optionalExternals`; undefined for any other warning.
 */
export function optionalProbeWarning(message: string): string | undefined {
  // A colour terminal gets the message with ANSI codes around the request and the directory
  const [, request, directory] = UNRESOLVED.exec(stripVTControlCharacters(message)) ?? []
  if (!request || !OPTIONAL_PROBES.includes(request)) return undefined

  const packages = [...directory.matchAll(/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/g)]
  const requester = packages.at(-1)?.[1].replace(/\\/g, '/') ?? 'A module'
  return (
    `${requester} tries to load ${request}, which is not installed, and runs without it. List it in ` +
    `optionalExternals in meocord.config.ts to load it when it is installed and silence this warning: ` +
    `optionalExternals: ['${request}'].`
  )
}

/**
 * Replaces the bundler's "Module not found" warning for a package a dependency only probes for with one
 * that says it is harmless and names `optionalExternals` (see {@link optionalProbeWarning}), once per
 * package that probes for it.
 */
export class OptionalProbesPlugin implements Rspack.RspackPluginInstance {
  apply(compiler: Rspack.Compiler): void {
    const { WebpackError } = compiler.rspack

    compiler.hooks.thisCompilation.tap(NAME, compilation => {
      compilation.hooks.processWarnings.tap(NAME, warnings => {
        const replaced = new Set<string>()
        return warnings.flatMap(warning => {
          const message = optionalProbeWarning(warning.message)
          if (!message) return [warning]
          if (replaced.has(message)) return []
          replaced.add(message)
          return [new WebpackError(message)]
        })
      })
    })
  }
}
