import fs from 'fs'
import path from 'path'
import { loadMeoCordCliConfig } from '@src/util/meocord-source-config.util.js'
import wait from '@src/util/wait.util.js'
import chalk from 'chalk'

/** The directory of an installed package, searching `node_modules` upward from `baseDir`, or null. */
export const findModulePackageDir = (moduleName: string, baseDir: string = process.cwd()): string | null => {
  try {
    // Resolve the node_modules directory from the base directory
    let currentDir = baseDir

    // Traverse the node_modules directories upwards until the package is found
    while (currentDir !== path.parse(currentDir).root) {
      const modulePath = path.join(currentDir, 'node_modules', moduleName)

      if (fs.existsSync(modulePath)) {
        return modulePath // Return the full path to the module directory
      }

      // Move up one level in the directory structure
      currentDir = path.join(currentDir, '..')
    }

    throw new Error(`Module ${moduleName} not found in node_modules.`)
  } catch (error) {
    if (error instanceof Error) {
      console.error(chalk.red(`Error finding package directory for ${moduleName}:`, error.message))
    } else {
      console.error(chalk.red(`Error finding package directory for ${moduleName}:`, error))
    }
    return null
  }
}

/** Exits the process unless `meocord.config.ts` exists, then loads it. */
export async function compileAndValidateConfig() {
  const meocordConfigPath = path.resolve(process.cwd(), 'meocord.config.ts')
  if (!fs.existsSync(meocordConfigPath)) {
    console.error(chalk.red('Configuration file "meocord.config.ts" is missing!'))
    await wait(100)
    process.exit(1)
  }

  loadMeoCordCliConfig()
}

/**
 * Ensures a Discord token is configured.
 *
 * Kept apart from {@link compileAndValidateConfig} because producing a bundle needs no
 * credentials — only connecting to the gateway does. Requiring one to build would stop a
 * freshly created application from building until it has a token.
 */
export async function validateDiscordToken() {
  if (!loadMeoCordCliConfig()?.discordToken) {
    console.error(chalk.red('Discord token is missing!'))
    await wait(100)
    process.exit(1)
  }
}

/** Sets `NODE_ENV` to `mode` unless it is already set. */
export function setEnvironment(mode: 'production' | 'development') {
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = mode
  }
}
