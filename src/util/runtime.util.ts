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

/** `-y` answers npx's install prompt, which would otherwise block a non-interactive watch. */
const NPX_COMMAND = 'npx'
const NPX_ARGS = ['-y', 'nodemon'] as const

/** Keeps nodemon's own banner out of the application's output. */
const NODEMON_QUIET = '-q'

/** nodemon runs its target with `node` unless the runtime is named explicitly. */
const NODEMON_EXEC = '--exec'

/** A command to spawn, split so it can be passed without a shell. */
export interface RuntimeCommand {
  command: string
  args: string[]
}

/**
 * The binary the application should be spawned with.
 *
 * Defaults to the binary already executing this CLI rather than the literal `node`.
 * `bun --bun meocord start` then runs the bot under bun and a plain node install runs it
 * under node, with nothing to configure either way. Naming a runtime instead would mean
 * the launcher and the application are different processes on different allocators — the
 * bot would inherit glibc malloc no matter what it was launched with.
 *
 * @param env - Environment to read the override from.
 * @param execPath - Binary executing the CLI, i.e. `process.execPath`.
 * @returns The binary to spawn.
 */
export function resolveRuntime(env: NodeJS.ProcessEnv, execPath: string): string {
  const override = env[RUNTIME_OVERRIDE_ENV]?.trim()

  // An override of only whitespace would spawn '' and fail with an ENOENT naming nothing,
  // so it is treated as absent rather than passed through.
  return override ? override : execPath
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

/**
 * Runs the built application under nodemon, so a rebuild restarts it.
 *
 * @param runtime - Binary to run the application with.
 * @param mainJsPath - Absolute path to the built entry file.
 */
export function buildWatchCommand(runtime: string, mainJsPath: string): RuntimeCommand {
  return { command: NPX_COMMAND, args: [...NPX_ARGS, NODEMON_QUIET, NODEMON_EXEC, runtime, mainJsPath] }
}
