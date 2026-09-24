import path from 'path'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { createRequire } from 'module'
import { parseJsonc } from '@src/util/json.util.js'

/**
 * An `extends` made to work from another directory: a relative path made absolute, and a package
 * resolved from the project's `node_modules`, or kept as it is when it cannot be found there.
 */
function resolveExtends(value: string | string[], cwd: string): string | string[] {
  const projectRequire = createRequire(path.join(cwd, 'tsconfig.json'))
  const resolve = (entry: string) => {
    if (entry.startsWith('.') || path.isAbsolute(entry)) return path.resolve(cwd, entry)
    try {
      return projectRequire.resolve(entry)
    } catch {
      return entry
    }
  }
  return Array.isArray(value) ? value.map(resolve) : resolve(value)
}

/**
 * Writes a copy of the project's `tsconfig.json` for the bundler to a temporary file, with comments
 * and trailing commas removed, paths made absolute and `noEmit` removed. The project's file is never
 * changed. Each call gets a directory of its own,
 * removed when the process exits, so builds running at once never share or overwrite the file.
 * @returns The absolute path to the temporary tsconfig.
 * @throws When `tsconfig.json` is missing or cannot be parsed.
 */
export function prepareModifiedTsConfig(): string {
  const tsConfigPath = path.resolve(process.cwd(), 'tsconfig.json')

  // Ensure tsconfig.json exists
  if (!existsSync(tsConfigPath)) {
    throw new Error(`tsconfig.json not found in: ${process.cwd()}`)
  }

  const tsConfigContent = readFileSync(tsConfigPath, 'utf-8')

  let parsedConfig: any
  try {
    // TypeScript allows comments and trailing commas; the project's file itself is only read, never written
    parsedConfig = parseJsonc(tsConfigContent)
  } catch (error) {
    throw new Error(
      `Could not parse tsconfig.json in ${process.cwd()}: ${error instanceof Error ? error.message : String(error)}. ` +
        `Fix the JSON, then build again.`,
    )
  }

  // The copy lives in the temp directory, so every path in it is made absolute from the project
  const cwd = process.cwd()
  if (parsedConfig?.extends) parsedConfig.extends = resolveExtends(parsedConfig.extends, cwd)
  for (const key of ['include', 'exclude', 'files']) {
    if (Array.isArray(parsedConfig?.[key])) parsedConfig[key] = parsedConfig[key].map((p: string) => path.resolve(cwd, p))
  }

  // Process compilerOptions
  if (parsedConfig?.compilerOptions) {
    const pathOptions = ['outDir', 'rootDir', 'baseUrl', 'tsBuildInfoFile']

    // Convert relative paths to absolute paths in `compilerOptions`
    pathOptions.forEach(option => {
      if (parsedConfig.compilerOptions[option]) {
        parsedConfig.compilerOptions[option] = path.resolve(process.cwd(), parsedConfig.compilerOptions[option])
      }
    })

    if (Array.isArray(parsedConfig.compilerOptions.typeRoots)) {
      parsedConfig.compilerOptions.typeRoots = parsedConfig.compilerOptions.typeRoots.map((p: string) => path.resolve(cwd, p))
    }

    // Resolve path mappings in `paths` if present
    if (parsedConfig.compilerOptions.paths) {
      Object.keys(parsedConfig.compilerOptions.paths).forEach(alias => {
        parsedConfig.compilerOptions.paths[alias] = parsedConfig.compilerOptions.paths[alias].map((p: string) =>
          path.resolve(process.cwd(), p),
        )
      })
    }

    // Remove `noEmit` option if it exists
    if ('noEmit' in parsedConfig.compilerOptions) {
      delete parsedConfig.compilerOptions.noEmit
    }
  }

  // Kept until the process exits: a development build reads it again on every rebuild
  const tempDir = mkdtempSync(path.join(tmpdir(), 'meocord-tsconfig-'))
  process.once('exit', () => rmSync(tempDir, { recursive: true, force: true }))

  const tempTsConfigPath = path.join(tempDir, 'modified-tsconfig.json')
  writeFileSync(tempTsConfigPath, JSON.stringify(parsedConfig, null, 2))
  return tempTsConfigPath
}
