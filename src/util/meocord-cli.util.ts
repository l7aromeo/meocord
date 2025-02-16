/**
 * Configures custom help formatting for a command and its subcommands.
 *
 * @param command - The command for which to configure help.
 */
import { Argument, Command, Help, Option } from 'commander'
import CliTable3 from 'cli-table3'
import { findModulePackageDir } from '@src/util/common.util'
import path from 'node:path'
import fs from 'node:fs'
import wait from '@src/util/wait.util'
import chalk from '@src/lib/chalk'

export function configureCommandHelp(command: Command) {
  command.configureHelp({
    formatHelp: (cmd, helper) => {
      return formatHelp(cmd, helper, command.options)
    },
  })

  command.commands.forEach(cmd => {
    configureCommandHelp(cmd)
  })
}

/**
 * Formats the help output for a command.
 *
 * @param cmd - The command for which to format help.
 * @param helper - The helper object for formatting.
 * @param options - The options available for the command.
 * @returns The formatted help text.
 */
export function formatHelp(cmd: Command, helper: Help, options: readonly Option[]): string {
  let helpText = `MeoCord Copyright (C) 2025  Ukasyah Rahmatullah Zada
    This program comes with ABSOLUTELY NO WARRANTY; for details type \`meocord show -w'.
    This is free software, and you are welcome to redistribute it
    under certain conditions; type \`meocord show -c' for details.\n\n`

  helpText += `${helper.commandUsage(cmd)}\n\n`
  helpText += `${helper.commandDescription(cmd)}\n\n`

  if (cmd.registeredArguments.length > 0) {
    helpText += generateArgumentsTable(cmd.registeredArguments)
    helpText += '\n\n'
  }

  if (options.length > 0) {
    helpText += 'Available Options:\n'
    helpText += generateOptionsTable(options, helper)
    helpText += '\n\n'
  }

  if (cmd.commands.length > 0) {
    helpText += 'Available Commands:\n'
    helpText += generateCommandsTable(cmd)
    helpText += '\n'
  }

  return helpText
}

/**
 * Generates a table of commands with their aliases and descriptions.
 *
 * @param cmd - The command for which to generate the table.
 * @returns The formatted table of commands.
 */
export function generateCommandsTable(cmd: Command): string {
  const table = new CliTable3({
    head: ['Command', 'Alias', 'Description'],
  })

  cmd.commands.forEach(cmd => {
    const alias = cmd.aliases().length > 0 ? cmd.aliases().join(', ') : '—'
    const description = cmd.description() || 'No description provided'
    table.push([cmd.name(), alias, description])
  })

  return table.toString()
}

/**
 * Generates a table of commands with their aliases and descriptions.
 *
 * @param options
 * @param helper
 * @returns The formatted table of commands.
 */
export function generateOptionsTable(options: readonly Option[], helper: Help): string {
  const table = new CliTable3({
    head: ['Option', 'Description'],
  })

  options.forEach(option => table.push([helper.optionTerm(option), helper.optionDescription(option)]))

  return table.toString()
}

/**
 * Generates a formatted table of arguments for the specified command.
 *
 * This method creates two tables:
 * 1. A table displaying argument names and their descriptions.
 * 2. (If applicable) A table showing available choices for arguments with predefined choices.
 *
 * @param args - The list of arguments for the command.
 * @returns A string representation of the formatted tables, including available arguments and their choices.
 */
export function generateArgumentsTable(args: readonly Argument[]): string {
  const table = new CliTable3({
    head: ['Argument', 'Description'],
  })

  const choiceTable = new CliTable3({
    head: ['Choice'],
  })

  let hasChoices = false

  args.forEach(arg => {
    if (arg.argChoices) {
      hasChoices = true
      arg.argChoices.forEach(choice => {
        choiceTable.push([choice])
      })
    }
    table.push([arg.name(), arg.description || 'No description provided'])
  })

  let text = ''

  if (hasChoices) {
    text += 'Available Choices:\n'
    text += choiceTable.toString()
    text += '\n\n'
  } else {
    text += 'No available choices.\n\n'
  }

  text += 'Available Arguments:\n'
  text += table.toString()

  return text
}

/**
 * Ensures that the script is being run from the root directory of the project.
 * Validates the existence of required files, dependencies, and configuration.
 * If validation fails, it logs an error message and terminates the process.
 */
export async function ensureReady() {
  const meocordPath = findModulePackageDir('meocord')
  const packageJsonPath = path.resolve(process.cwd(), 'package.json')

  try {
    // Ensure the root package.json exists
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('package.json not found. This script must be run from the root directory of the project.')
    }

    // Ensure the MeoCord package directory is found
    if (!meocordPath) {
      throw new Error('Cannot locate the "MeoCord" package directory.')
    }

    // Read and parse the root package.json
    const { dependencies } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))

    // Read and parse the MeoCord package.json
    const internalPackageJsonPath = path.join(meocordPath, 'package.json')
    const { name: internalPackageName } = JSON.parse(fs.readFileSync(internalPackageJsonPath, 'utf-8'))

    // Validate that MeoCord is listed as a dependency in the root package.json
    if (!dependencies?.[internalPackageName]) {
      throw new Error('The package.json does not list "MeoCord" as a dependency. Ensure you are in the root directory.')
    }
  } catch (error) {
    // Log the error and exit the process
    console.error(chalk.red(error instanceof Error ? error.message : 'An unknown error occurred during validation.'))
    await wait(100)
    process.exit(1)
  }
}
