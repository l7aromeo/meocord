/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { buildAppCommand, resolveRuntime, RUNTIME_OVERRIDE_ENV } from '@src/util/runtime.util.js'

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

// `bun run` honours the bin's node shebang, so the CLI lands on node even though the
// user asked for bun. Pinning node there would make a bun-only image install a second
// runtime just to launch, or force `--bun` onto every command.
describe('resolveRuntime — following the launcher', () => {
  /** What bun exports when it runs a package script. */
  const bunLauncher = {
    npm_config_user_agent: 'bun/1.4.0 npm/? node/v26.3.0 darwin arm64',
    npm_execpath: '/Users/dev/.bun/bin/bun',
  }

  it('runs the application on bun when bun launched the CLI onto node', () => {
    expect(resolveRuntime(bunLauncher, '/usr/bin/node')).toBe('/Users/dev/.bun/bin/bun')
  })

  it('stays on bun when the CLI is already running on it', () => {
    expect(resolveRuntime(bunLauncher, '/Users/dev/.bun/bin/bun')).toBe('/Users/dev/.bun/bin/bun')
  })

  // npm, pnpm and yarn point npm_execpath at a .js file, which cannot run the bundle.
  it.each([
    ['npm', 'npm/11.17.0 node/v26.4.0 darwin arm64', '/usr/lib/node_modules/npm/bin/npm-cli.js'],
    ['pnpm', 'pnpm/9.1.0 npm/? node/v22.0.0 linux x64', '/usr/lib/pnpm/bin/pnpm.cjs'],
    ['yarn', 'yarn/1.22.22 npm/? node/v22.0.0 linux x64', '/usr/lib/yarn/bin/yarn.js'],
  ])('ignores %s, which is not a runtime', (_runner, agent, execpath) => {
    expect(
      resolveRuntime({ npm_config_user_agent: agent, npm_execpath: execpath }, '/usr/bin/node'),
    ).toBe('/usr/bin/node')
  })

  it('ignores a launcher it cannot locate', () => {
    expect(resolveRuntime({ npm_config_user_agent: bunLauncher.npm_config_user_agent }, '/usr/bin/node')).toBe(
      '/usr/bin/node',
    )
  })

  it.each(['', '   '])('ignores a launcher path of %j', launcher => {
    expect(
      resolveRuntime({ ...bunLauncher, npm_execpath: launcher }, '/usr/bin/node'),
    ).toBe('/usr/bin/node')
  })

  it('ignores a launcher with no user agent to identify it', () => {
    expect(resolveRuntime({ npm_execpath: bunLauncher.npm_execpath }, '/usr/bin/node')).toBe('/usr/bin/node')
  })

  it('lets an explicit override win over the launcher', () => {
    expect(resolveRuntime({ ...bunLauncher, [RUNTIME_OVERRIDE_ENV]: '/opt/node' }, '/usr/bin/node')).toBe('/opt/node')
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

