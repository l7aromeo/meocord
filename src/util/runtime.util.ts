/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

/**
 * Environment variable that pins the binary the application is spawned with.
 *
 * An escape hatch for pinning a specific install, or for running the application under a
 * different runtime than the CLI to compare behaviour. Unset is the normal case.
 */
export const RUNTIME_OVERRIDE_ENV = 'MEOCORD_RUNTIME'

/** A command to spawn, split so it can be passed without a shell. */
export interface RuntimeCommand {
  command: string
  args: string[]
}

/**
 * Runners that are themselves JavaScript runtimes.
 *
 * `npm_execpath` names the binary that launched the script. npm, pnpm and yarn set it to
 * a `.js` file, which cannot run the application, so only the runners listed here are
 * read as a runtime. An entry belongs here only once it has been checked against that
 * runner's real environment, since guessing wrong means spawning something that cannot
 * execute the bundle.
 */
const RUNTIME_RUNNERS: ReadonlySet<string> = new Set(['bun'])

/**
 * The runtime that launched the CLI, when the CLI is not itself running on it.
 *
 * `bun run` honours the bin's `#!/usr/bin/env node` shebang, so the CLI lands on node
 * even though the user asked for bun. What they chose is still recoverable: bun sets
 * `npm_config_user_agent` to `bun/<version> …` and `npm_execpath` to its own binary.
 *
 * @param env - Environment the CLI was launched with.
 * @returns The launcher's binary, or `undefined` when it cannot run the application.
 */
function launcherRuntime(env: NodeJS.ProcessEnv): string | undefined {
  const runner = env.npm_config_user_agent?.split('/')[0]
  const launcher = env.npm_execpath?.trim()

  if (runner === undefined || !launcher) return undefined

  return RUNTIME_RUNNERS.has(runner) ? launcher : undefined
}

/**
 * The binary the application should be spawned with.
 *
 * Follows the runtime the user chose rather than naming one. Someone who typed `bun`
 * gets a bun process, and an image built on bun alone stays that way — pinning `node`
 * would oblige them to install a second runtime beside the one they picked, or to
 * remember `--bun` on every command.
 *
 * Preference runs from the most explicit signal to the least: an override, then the
 * runner that launched the CLI, then the binary executing it.
 *
 * @param env - Environment the CLI was launched with.
 * @param execPath - Binary executing the CLI, i.e. `process.execPath`.
 * @returns The binary to spawn.
 */
export function resolveRuntime(env: NodeJS.ProcessEnv, execPath: string): string {
  const override = env[RUNTIME_OVERRIDE_ENV]?.trim()

  // An override of only whitespace would spawn '' and fail with an ENOENT naming nothing,
  // so it is treated as absent rather than passed through.
  if (override) return override

  return launcherRuntime(env) ?? execPath
}

/**
 * Runs the built application directly.
 *
 * @param runtime - Binary to run the application with.
 * @param mainJsPath - Absolute path to the built entry file.
 */
export function buildAppCommand(runtime: string, mainJsPath: string): RuntimeCommand {
  return { command: runtime, args: [mainJsPath] }
}

