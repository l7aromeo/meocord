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

import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
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
} {
  if (!originalName) {
    logger.error('Guard name is required.')
    process.exit(1)
  }

  const parts = originalName.split('/')
  const fileName = parts.pop()
  if (!fileName) {
    logger.error('Invalid guard name.')
    process.exit(1)
  }

  const kebabCaseName = kebabCase(fileName)
  const className = toClassName(fileName)

  return { parts, kebabCaseName, className }
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
 * Writes the provided content to a file and runs ESLint on the file for formatting.
 * @param filePath - The absolute path of the file to create or overwrite.
 * @param content - The content to write to the file.
 * @throws Logs an error if the file creation or ESLint command fails.
 */
export function generateFile(filePath: string, content: string): void {
  try {
    fs.writeFileSync(filePath, content)
    logger.log(`Guard file created at: ${path.relative(process.cwd(), filePath)}`)
    exec(`npx eslint --fix ${filePath}`)
  } catch (error) {
    logger.error(`Failed to create guard file at ${filePath}`, error)
  }
}

/**
 * Builds and returns a template string for a given class name using a specific template file.
 * @param className - The name of the class to insert into the template.
 * @param templateFileName - The name of the template file to use.
 * @returns The populated template string.
 * @throws Will throw an error if the template file cannot be read.
 */
export function buildTemplate(className: string, templateFileName: string): string {
  const filePath = path.resolve(__dirname, '..', 'bin', 'builder-template', templateFileName)
  let template = fs.readFileSync(filePath, 'utf-8')

  const variables = {
    className,
  }

  for (const [key, value] of Object.entries(variables)) {
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
