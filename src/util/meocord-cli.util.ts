/**
 * Configures custom help formatting for a command and its subcommands.
 *
 * @param command - The command for which to configure help.
 */
import { Argument, Command, Help, Option } from 'commander'
import CliTable3 from 'cli-table3'

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
