/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import {
  buildAppCommand,
  buildWatchCommand,
  resolveRuntime,
  RUNTIME_OVERRIDE_ENV,
} from '@src/util/runtime.util.js'

describe('resolveRuntime', () => {
  // Spawning the binary already running the CLI is what keeps `bun --bun meocord start`
  // on bun end to end; naming a runtime in the source would drop the application onto
  // node whatever it was launched with.
  it('falls back to the binary executing the CLI', () => {
    expect(resolveRuntime({}, '/usr/local/bin/bun')).toBe('/usr/local/bin/bun')
  })

  it('prefers an explicit override', () => {
    expect(resolveRuntime({ [RUNTIME_OVERRIDE_ENV]: '/opt/node/bin/node' }, '/usr/local/bin/bun')).toBe(
      '/opt/node/bin/node',
    )
  })

  // An override of only whitespace would otherwise be spawned verbatim and fail with an
  // ENOENT that names nothing.
  it.each(['', '   ', '\t\n'])('ignores an override of %j', override => {
    expect(resolveRuntime({ [RUNTIME_OVERRIDE_ENV]: override }, '/usr/local/bin/bun')).toBe('/usr/local/bin/bun')
  })

  it('trims a padded override rather than spawning the padding', () => {
    expect(resolveRuntime({ [RUNTIME_OVERRIDE_ENV]: '  /opt/bun  ' }, '/bin/node')).toBe('/opt/bun')
  })
})

describe('buildAppCommand', () => {
  it('runs the entry file with the resolved runtime', () => {
    expect(buildAppCommand('/usr/local/bin/bun', '/app/dist/main.js')).toEqual({
      command: '/usr/local/bin/bun',
      args: ['/app/dist/main.js'],
    })
  })

  // Concatenating the two into one string is what a shell would then have to re-split,
  // and it splits on the space in a path like `/Users/a b/app`.
  it('keeps a path containing spaces in a single argument', () => {
    expect(buildAppCommand('/bin/node', '/Users/a b/dist/main.js').args).toEqual(['/Users/a b/dist/main.js'])
  })
})

describe('buildWatchCommand', () => {
  it('tells nodemon which runtime to exec', () => {
    const { command, args } = buildWatchCommand('/usr/local/bin/bun', '/app/dist/main.js')

    expect(command).toBe('npx')
    expect(args).toEqual(['-y', 'nodemon', '-q', '--exec', '/usr/local/bin/bun', '/app/dist/main.js'])
  })

  // Without --exec, nodemon runs its target with node regardless of what launched it.
  it('names the runtime immediately after --exec', () => {
    const { args } = buildWatchCommand('/opt/bun', '/app/dist/main.js')

    expect(args[args.indexOf('--exec') + 1]).toBe('/opt/bun')
  })

  it('keeps a path containing spaces in a single argument', () => {
    const { args } = buildWatchCommand('/bin/node', '/Users/a b/dist/main.js')

    expect(args.at(-1)).toBe('/Users/a b/dist/main.js')
  })
})
