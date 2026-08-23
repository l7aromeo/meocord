/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { vi } from 'vitest'

vi.mock('@src/common/index.js', () => ({
  Logger: vi.fn(
    class {
      log = vi.fn()
      error = vi.fn()
      warn = vi.fn()
      debug = vi.fn()
      info = vi.fn()
      verbose = vi.fn()
    },
  ),
}))

vi.mock('node:child_process', async importOriginal => ({
  ...(await importOriginal<typeof import('node:child_process')>()),
  spawn: vi.fn(),
}))

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>()
  return { ...actual, default: { ...actual }, existsSync: vi.fn().mockReturnValue(true) }
})

import { spawn } from 'node:child_process'
import { MeoCordCLI } from '@src/bin/meocord.js'
import { RUNTIME_OVERRIDE_ENV } from '@src/util/runtime.util.js'

/** Stands in for the spawned application; `.on` is chained straight off `spawn`. */
const createChild = () => ({ on: vi.fn().mockReturnThis(), kill: vi.fn(), killed: false })

const spawnMock = vi.mocked(spawn)

const lastSpawn = () => {
  const call = spawnMock.mock.calls.at(-1)
  if (!call) throw new Error('spawn was never called')
  const [command, args, options] = call as [string, string[], Record<string, unknown>]
  return { command, args, options }
}

describe('spawning the application', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    spawnMock.mockReturnValue(createChild() as never)
    vi.spyOn(process.stdout, 'write').mockReturnValue(true)
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete process.env[RUNTIME_OVERRIDE_ENV]
  })

  // The CLI is launched by whichever runtime the user chose -- `bun --bun meocord start`
  // makes that bun. Naming a runtime in the source would hand the application to node
  // regardless, leaving a launcher process behind and putting the bot on a different
  // allocator than the one it was started with.
  describe('startProd()', () => {
    it('runs the entry file with the binary executing the CLI', async () => {
      await new MeoCordCLI().startProd()

      const { command, args } = lastSpawn()
      expect(command).toBe(process.execPath)
      expect(args).toEqual([expect.stringContaining('main.js')])
    })

    it('honours the runtime override', async () => {
      process.env[RUNTIME_OVERRIDE_ENV] = '/opt/custom/bun'

      await new MeoCordCLI().startProd()

      expect(lastSpawn().command).toBe('/opt/custom/bun')
    })

    // A command string has to be re-split by a shell, and it splits on the space in a
    // project path such as `/Users/a b/bot`.
    it('passes the entry file as an argument rather than a command string', async () => {
      await new MeoCordCLI().startProd()

      const { command, args } = lastSpawn()
      expect(command).not.toContain('main.js')
      expect(args).toHaveLength(1)
    })

    it('does not run through a shell', async () => {
      await new MeoCordCLI().startProd()

      expect(lastSpawn().options).not.toHaveProperty('shell', true)
    })

    it('propagates the exit code of the application', async () => {
      await new MeoCordCLI().startProd()

      const child = spawnMock.mock.results.at(-1)?.value as { on: ReturnType<typeof vi.fn> }
      const onExit = child.on.mock.calls.find(([event]) => event === 'exit')?.[1] as (code: number | null) => void

      onExit(3)

      expect(exitSpy).toHaveBeenCalledWith(3)
    })

    it('exits zero when the application reports no code', async () => {
      await new MeoCordCLI().startProd()

      const child = spawnMock.mock.results.at(-1)?.value as { on: ReturnType<typeof vi.fn> }
      const onExit = child.on.mock.calls.find(([event]) => event === 'exit')?.[1] as (code: number | null) => void

      onExit(null)

      expect(exitSpy).toHaveBeenCalledWith(0)
    })

    // The first Ctrl+C lets the child shut down on the SIGINT it already received from
    // the process group; the second stops waiting for it.
    it('force-kills the application on a second interrupt', async () => {
      const before = process.listeners('SIGINT').length
      await new MeoCordCLI().startProd()

      const child = spawnMock.mock.results.at(-1)?.value as { kill: ReturnType<typeof vi.fn> }
      const onSigint = process.listeners('SIGINT').at(-1) as () => void

      onSigint()
      expect(child.kill).not.toHaveBeenCalled()

      onSigint()
      expect(child.kill).toHaveBeenCalledWith('SIGKILL')
      expect(exitSpy).toHaveBeenCalledWith(1)

      process.listeners('SIGINT')
        .slice(before)
        .forEach(listener => process.removeListener('SIGINT', listener as () => void))
    })
  })

  // nodemon runs its target with node unless told otherwise, so the watcher needs the
  // runtime named explicitly or dev mode drifts from what production does.
  describe('dev watcher', () => {
    const spawnWatcher = () => {
      const cli = new MeoCordCLI() as unknown as { spawnWatcher: () => unknown }
      cli.spawnWatcher()
      return lastSpawn()
    }

    it('tells nodemon to exec the binary executing the CLI', () => {
      const { command, args } = spawnWatcher()

      expect(command).toBe('npx')
      expect(args[args.indexOf('--exec') + 1]).toBe(process.execPath)
    })

    it('honours the runtime override', () => {
      process.env[RUNTIME_OVERRIDE_ENV] = '/opt/custom/bun'

      const { args } = spawnWatcher()

      expect(args[args.indexOf('--exec') + 1]).toBe('/opt/custom/bun')
    })

    it('passes the entry file as an argument rather than a command string', () => {
      const { command, args } = spawnWatcher()

      expect(command).toBe('npx')
      expect(args.at(-1)).toContain('main.js')
    })

    it('does not run through a shell', () => {
      expect(spawnWatcher().options).not.toHaveProperty('shell', true)
    })
  })
})
