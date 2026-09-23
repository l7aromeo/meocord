import fs from 'fs'
import path from 'path'
import { execFile } from 'child_process'
import { Logger } from '@src/common/index.js'
import { camelCase, kebabCase, startCase } from 'lodash-es'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const logger = new Logger('MeoCord')

/**
 * Converts a given name to a properly formatted class name.
 * @param originalName - The original name to be converted to a class name.
 * @returns The formatted class name.
 * @throws Will exit the process if the generated class name is invalid.
 */
export function toClassName(originalName: string): string {
  const className = startCase(camelCase(originalName)).replace(/\s/g, '')

  const classNameRegex = /^[A-Z][A-Za-z0-9]*$/
  if (!classNameRegex.test(className)) {
    logger.error(`Invalid class name "${originalName}". Must start with a letter and contain alphanumeric characters.`)
    process.exit(1)
  }

  return className
}

/**
 * Validates and formats a given name, splitting it into parts,
 * converting it to kebab-case, and generating a class name.
 * @param originalName - The name to validate and format. It can include slashes for nested paths.
 * @returns An object containing the name parts, kebab-case name, and class name.
 * @throws Will exit the process if the name is undefined, invalid,
 *         or the generated class name is invalid.
 */
export function validateAndFormatName(originalName?: string): {
  parts: string[]
  kebabCaseName: string
  className: string
  commandName: string
} {
  // Shared by every generator -- controllers, services and guards -- so the messages name none.
  if (!originalName) {
    logger.error('A name is required.')
    process.exit(1)
  }

  const parts = originalName.split('/')
  const fileName = parts.pop()
  if (!fileName) {
    logger.error(`Invalid name: "${originalName}".`)
    process.exit(1)
  }

  const kebabCaseName = kebabCase(fileName)
  const className = toClassName(fileName)

  return { parts, kebabCaseName, className, commandName: commandNameFor(parts, kebabCaseName) }
}

/**
 * The Discord command name a generated controller registers.
 *
 * The whole path, not only its last segment: `admin/ban` becomes `admin-ban`. Files are kept
 * apart by their directories, but a Discord command name is global to the application, so two
 * controllers named `ban` in different folders must not both register `ban`.
 *
 * @param parts - The folders the name is nested in.
 * @param kebabCaseName - The name's last segment, already kebab-cased.
 */
export function commandNameFor(parts: string[], kebabCaseName: string): string {
  return [...parts.map(part => kebabCase(part)), kebabCaseName].filter(Boolean).join('-')
}

/**
 * Stops a generator before it writes anything, if any file it would write already exists.
 *
 * Checked for every file up front rather than one at a time, so a refusal never leaves half a
 * component behind, and a file the user has edited is never replaced.
 *
 * @param filePaths - Absolute paths the generator is about to create.
 */
export function assertFilesAbsent(filePaths: string[]): void {
  const existing = filePaths.filter(filePath => fs.existsSync(filePath))
  if (existing.length === 0) return

  const names = existing.map(filePath => path.relative(process.cwd(), filePath)).join(', ')
  logger.error(
    `Refusing to overwrite ${existing.length === 1 ? 'an existing file' : 'existing files'}: ${names}. ` +
      'Nothing was generated. Choose another name, or move the existing file first.',
  )
  process.exit(1)
}

/**
 * Ensures that a given directory exists. Creates the directory and any necessary parent directories if they do not exist.
 * @param directory - The absolute path of the directory to create.
 */
export function createDirectoryIfNotExists(directory: string) {
  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true })
  }
}

/**
 * Writes the provided content to a new file and runs ESLint on the file for formatting.
 *
 * Never replaces a file: the write is exclusive, so an existing file is left exactly as it was.
 * Generators check with {@link assertFilesAbsent} before writing anything; this is the last line
 * behind that. A failed write sets a non-zero exit code rather than ending with the success status
 * of a run that produced nothing.
 *
 * @param filePath - The absolute path of the file to create.
 * @param content - The content to write to the file.
 */
export function generateFile(filePath: string, content: string): void {
  const relative = path.relative(process.cwd(), filePath)
  try {
    fs.writeFileSync(filePath, content, { flag: 'wx' })
    logger.log(`Created ${relative}`)
    formatWithLocalESLint(filePath)
  } catch (error) {
    process.exitCode = 1
    if ((error as NodeJS.ErrnoException)?.code === 'EEXIST') {
      logger.error(`${relative} already exists; left it untouched.`)
      return
    }
    logger.error(`Failed to create ${relative}`, error)
  }
}

/**
 * Formats a generated file with the project's own ESLint, when it has one.
 *
 * Reaching for `npx` instead would start downloading ESLint into a project that
 * deliberately does not have it, once per generated file, with no way to see it happen —
 * the call is not awaited. A project with its own rules still gets them applied.
 */
function formatWithLocalESLint(filePath: string): void {
  const binary = path.resolve(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'eslint.cmd' : 'eslint')
  if (!fs.existsSync(binary)) return

  execFile(binary, ['--fix', filePath], () => {
    // Formatting is a courtesy; a project whose rules reject the template should still
    // end up with the file it asked for.
  })
}

/**
 * Builds and returns a template string for a given class name using a specific template file.
 * @param className - The name of the class to insert into the template.
 * @param templateFileName - The name of the template file to use.
 * @returns The populated template string.
 * @throws Will throw an error if the template file cannot be read.
 */
export function buildTemplate(className: string, templateFileName: string, extra: Record<string, string> = {}): string {
  const filePath = path.resolve(__dirname, '..', 'bin', 'builder-template', templateFileName)
  let template = fs.readFileSync(filePath, 'utf-8')

  for (const [key, value] of Object.entries({ className, ...extra })) {
    template = template.replaceAll(`{{${key}}}`, value)
  }

  return template
}

/**
 * Populates a template file with the provided variables by replacing placeholders in the template.
 * @param filePath - The path to the template file.
 * @param variables - An object containing variable names and their replacement values.
 * @returns The populated template string.
 * @throws Will throw an error if the template file cannot be read.
 */
export function populateTemplate(filePath: string, variables: Record<string, string>): string {
  let template = fs.readFileSync(filePath, 'utf-8')
  for (const [key, value] of Object.entries(variables)) {
    template = template.replaceAll(`{{${key}}}`, value)
  }
  return template
}
