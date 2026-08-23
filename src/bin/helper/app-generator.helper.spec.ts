/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { AppGeneratorHelper, type AppTemplateVariables } from '@src/bin/helper/app-generator.helper.js'

const VARIABLES: AppTemplateVariables = {
  appName: 'my-cool-bot',
  displayName: 'My Cool Bot',
  version: '3.1.0',
  packageManager: 'bun',
}

describe('AppGeneratorHelper', () => {
  const helper = new AppGeneratorHelper()
  const targets: string[] = []
  let target: string
  let written: string[]

  beforeAll(() => {
    target = fs.mkdtempSync(path.join(os.tmpdir(), 'meocord-app-'))
    targets.push(target)
    written = helper.generateApp(target, VARIABLES)
  })

  afterAll(() => targets.forEach(dir => fs.rmSync(dir, { recursive: true, force: true })))

  const read = (relative: string) => fs.readFileSync(path.join(target, relative), 'utf8')

  it('writes the whole template', () => {
    expect(written.length).toBeGreaterThan(20)
    expect(written).toContain(path.join('src', 'main.ts'))
  })

  // The suffix marks a file as packaged; leaving it on would ship a project of
  // `.template` files that no toolchain recognises.
  it('drops the template suffix from every written name', () => {
    expect(written.filter(name => name.endsWith('.template'))).toEqual([])
  })

  // npm omits dotfiles from a published tarball, so they are packaged under a stand-in
  // prefix and have to come back as dotfiles here.
  it.each(['.gitignore', '.env.example', '.prettierrc.mjs'])('restores %s as a dotfile', name => {
    expect(fs.existsSync(path.join(target, name))).toBe(true)
  })

  it('names the package after the application', () => {
    expect(JSON.parse(read('package.json')).name).toBe('my-cool-bot')
  })

  // A scaffolded application has to depend on the framework that scaffolded it; resolving
  // the template separately is what let a v3 CLI hand out a v1 project.
  it('pins the framework to the version doing the generating', () => {
    expect(JSON.parse(read('package.json')).dependencies.meocord).toBe('^3.1.0')
  })

  it('carries the readable name into the config and the readme', () => {
    expect(read('meocord.config.ts')).toContain("appName: 'My Cool Bot'")
    expect(read('README.md')).toContain('# My Cool Bot')
  })

  it('uses the chosen package manager in the readme', () => {
    expect(read('README.md')).toContain('bun run start:dev')
  })

  it('leaves no placeholder unsubstituted', () => {
    const unresolved = written.filter(name => /\{\{\w+\}\}/.test(read(name)))

    expect(unresolved).toEqual([])
  })

  // The token is read from the environment because this file is committed.
  it('does not write a token into the committed config', () => {
    expect(read('meocord.config.ts')).toContain('process.env.DISCORD_TOKEN')
    expect(read('.gitignore')).toContain('.env')
  })

  // A parameter has to own its segment, so a pattern the framework rejects would leave
  // every generated application crashing on the first import.
  it('ships component patterns the framework accepts', () => {
    expect(read(path.join('src', 'controllers', 'button', 'sample.button.controller.ts'))).toContain(
      "@Command('button-with/{id}', CommandType.BUTTON)",
    )
  })

  // The builder is reused by more than one @Command, so ignoring the name it is given
  // registers the same command twice and Discord rejects the payload.
  it('builds slash commands under the name they were registered with', () => {
    expect(read(path.join('src', 'controllers', 'slash', 'builders', 'sample.builder.ts'))).toContain(
      'setName(commandName)',
    )
  })
})
