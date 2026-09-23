import path from 'path'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { Logger } from '@src/common/index.js'
import { tmpdir } from 'os'
import { fixJSON } from '@src/util/json.util.js'

const logger = new Logger()

/**
 * Writes a copy of the project's `tsconfig.json` for the bundler to a temporary file, with invalid
 * JSON repaired, paths made absolute and `noEmit` removed.
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
    parsedConfig = JSON.parse(tsConfigContent)
  } catch (error) {
    logger.warn('Invalid JSON detected in tsconfig.json!', error)
    logger.log('Attempting to fix JSON...')
    try {
      const fixedContent = fixJSON(tsConfigContent)
      parsedConfig = JSON.parse(fixedContent)
      writeFileSync(tsConfigPath, fixedContent, 'utf-8')
      logger.info('Fixed and updated tsconfig.json successfully.')
    } catch (fixError) {
      throw new Error(
        `Failed to parse tsconfig.json, even after attempting to fix: ${
          fixError instanceof Error ? fixError.message : fixError
        }`,
      )
    }
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

    const additionalKeys = ['include', 'exclude', 'typeRoots']

    // Convert relative paths to absolute paths in additional keys
    additionalKeys.forEach(key => {
      if (parsedConfig[key]) {
        parsedConfig[key] = parsedConfig[key].map((p: string) => path.resolve(process.cwd(), p))
      }
    })

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

  // Write the modified configuration to a temporary location for usage
  const tempTsConfigPath = path.resolve(path.join(tmpdir(), 'modified-tsconfig.json'))
  writeFileSync(tempTsConfigPath, JSON.stringify(parsedConfig, null, 2))
  return tempTsConfigPath
}
