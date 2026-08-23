/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { populateTemplate } from '@src/util/generator-cli.util.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Marks a packaged template file, and is dropped from the name that gets written. */
const TEMPLATE_SUFFIX = '.template'

/**
 * Stands in for a leading dot while the file is packaged.
 *
 * npm omits a `.gitignore` from a published tarball, and this repository's own tooling
 * would treat a packaged `.ts` as one of its sources, so nothing here is stored under
 * the name it is written as.
 */
const DOT_PREFIX = '_'

/** Values substituted into the template's `{{...}}` placeholders. */
export interface AppTemplateVariables extends Record<string, string> {
  /** Package name for the generated application, in kebab case. */
  appName: string
  /** Human-readable name, used for the logger prefix and the README heading. */
  displayName: string
  /** Version of the framework doing the generating, which the application pins. */
  version: string
  /** Package manager the application was created with, used in its README examples. */
  packageManager: string
  /**
   * Prefix that puts the framework's own commands on the chosen runtime.
   *
   * Only the `meocord` scripts carry it. Applying the runtime project-wide, through
   * bun's `[run] bun = true`, would also move the linter and the test runner onto it,
   * which is a much larger claim than the application needs to make.
   */
  runtimePrefix: string
}

/**
 * The prefix each package manager needs for the framework to run on its runtime.
 *
 * The separating space belongs to the value, because the template writes
 * `{{runtimePrefix}}meocord` with nothing between them — a package manager that needs
 * no prefix has to render as `meocord …` rather than ` meocord …`. Trimming an entry
 * here would join it to the command that follows.
 */
const RUNTIME_PREFIXES: Record<string, string> = {
  // Without `--bun`, bun honours the CLI's `#!/usr/bin/env node` line and hands it to
  // node, which an image built on bun alone does not have.
  bun: 'bun --bun ',
}

/**
 * The script prefix for a package manager.
 *
 * @param packageManager - Package manager the application was created with.
 */
export function runtimePrefixFor(packageManager: string): string {
  return RUNTIME_PREFIXES[packageManager] ?? ''
}

/** The name a packaged template is written under. */
function outputName(templateName: string): string {
  const name = templateName.endsWith(TEMPLATE_SUFFIX)
    ? templateName.slice(0, -TEMPLATE_SUFFIX.length)
    : templateName

  return name.startsWith(DOT_PREFIX) ? `.${name.slice(DOT_PREFIX.length)}` : name
}

/**
 * Writes a new application from the template packaged with this framework.
 *
 * The template ships inside the package rather than being fetched, so the application a
 * given release scaffolds is always one that release can run. A template resolved at
 * generation time drifts from the CLI asking for it, in whichever direction happens to
 * be newer.
 */
export class AppGeneratorHelper {
  private readonly templateDir = path.resolve(__dirname, '..', 'app-template')

  /**
   * Renders every packaged template file into the target directory.
   *
   * @param targetDir - Directory to write the application into.
   * @param variables - Values substituted into the template.
   * @returns The written paths, relative to the target directory.
   */
  generateApp(targetDir: string, variables: AppTemplateVariables): string[] {
    return this.templateFiles(this.templateDir).map(templatePath => {
      const relative = path
        .relative(this.templateDir, templatePath)
        .split(path.sep)
        .map(segment => outputName(segment))
        .join(path.sep)

      const destination = path.join(targetDir, relative)
      fs.mkdirSync(path.dirname(destination), { recursive: true })
      fs.writeFileSync(destination, populateTemplate(templatePath, variables))

      return relative
    })
  }

  private templateFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name)
      return entry.isDirectory() ? this.templateFiles(full) : [full]
    })
  }
}
