/*
 * MeoCord Framework
 * Copyright (C) 2025 Ukasyah Rahmatullah Zada
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

import * as path from 'path'
import { execSync } from 'child_process'
import { findModulePackageDir } from '@src/util/common.util'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { MeoCordConfig } from '@src/interface'
import { fixJSON } from '@src/util/json.util'

const tempOutputDir = path.resolve(process.cwd(), 'dist', '.meocord-temp')

/**
 * Compiles the TypeScript configuration file (meocord.config.ts) to JavaScript
 * and stores it in the temporary directory.
 *
 * @returns {boolean} Whether the TypeScript compilation was successful.
 */
export function compileMeoCordConfig(): boolean {
  const meocordModulePath = findModulePackageDir('meocord')
  if (!meocordModulePath) return false

  const buildTsConfigTempPath = path.resolve(process.cwd(), 'tsconfig.build.json')

  const rootTsConfigPath = path.resolve(process.cwd(), 'tsconfig.json')

  // Ensure tsconfig.json exists
  if (!existsSync(rootTsConfigPath)) {
    throw new Error(`tsconfig.json not found in: ${process.cwd()}`)
  }

  const rootTsConfigContent = JSON.parse(fixJSON(readFileSync(rootTsConfigPath, 'utf-8')))

  const removeUndefinedKeys = (obj: any): void => {
    Object.keys(obj).forEach(key => {
      if (obj[key] === undefined) {
        delete obj[key]
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        removeUndefinedKeys(obj[key])
      }
    })
  }

  const buildTsConfigContent = {
    compilerOptions: {
      tsBuildInfoFile: null,
      strict: true,
      module: 'NodeNext',
      target: 'ESNext',
      moduleResolution: 'NodeNext',
      esModuleInterop: true,
      declaration: true,
      emitDecoratorMetadata: true,
      experimentalDecorators: true,
      resolveJsonModule: true,
      allowSyntheticDefaultImports: true,
      sourceMap: false,
      baseUrl: '.',
      rootDir: '.',
      outDir: tempOutputDir,
      paths: rootTsConfigContent?.compilerOptions?.paths,
      skipLibCheck: true,
      noImplicitAny: false,
      forceConsistentCasingInFileNames: true,
    },
    include: ['meocord.config.ts'],
  }

  removeUndefinedKeys(buildTsConfigContent)

  // Copy the build config to the working directory
  writeFileSync(buildTsConfigTempPath, fixJSON(JSON.stringify(buildTsConfigContent)))

  // Ensure the tsconfig.build.json exists
  if (!existsSync(buildTsConfigTempPath)) {
    console.error(`[MeoCord] tsconfig.build.json file not found: ${buildTsConfigTempPath}`)
    return false
  }

  // Ensure the temp directory exists
  if (!existsSync(tempOutputDir)) {
    mkdirSync(tempOutputDir, { recursive: true })
  }

  try {
    // Run TypeScript build and alias transformation
    execSync(`npx -y tsc -p "${buildTsConfigTempPath}" && npx -y tsc-alias -p "${buildTsConfigTempPath}"`, {
      stdio: 'inherit',
    })
    return true
  } catch (error) {
    if (error instanceof Error) {
      console.error(`[MeoCord] Failed to transpile config: ${error.message}`)
    } else {
      console.error(`[MeoCord] Failed to transpile config: Unknown error`)
    }
    return false
  } finally {
    rmSync(buildTsConfigTempPath)
  }
}

/**
 * Loads the MeoCord configuration file (meocord.config.js) from the temporary directory
 * and returns it as a JavaScript object.
 *
 * @returns {MeoCordConfig | undefined} The loaded configuration object, or undefined if loading fails.
 */
export function loadMeoCordConfig(): MeoCordConfig | undefined {
  const meocordModulePath = findModulePackageDir('meocord')
  if (!meocordModulePath) return undefined

  const tempConfigFilePath = path.join(tempOutputDir, 'meocord.config.js')

  if (existsSync(tempConfigFilePath)) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports,@typescript-eslint/no-var-requires
      return require(tempConfigFilePath).default as MeoCordConfig
    } catch (error) {
      if (error instanceof Error) {
        console.error(`[MeoCord] Failed to load config: ${error.message}`)
      } else {
        console.error(`[MeoCord] Failed to load config: Unknown error`)
      }
      return undefined
    }
  }

  return undefined
}
