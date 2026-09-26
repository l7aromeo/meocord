import { describe, expectTypeOf, it } from 'vitest'
import { type MeoCordConfig } from '@src/interface/index.js'

/** Runs under `vitest --typecheck`. */

describe('MeoCordConfig', () => {
  it('takes guild ids straight from the environment, where a variable may be unset', () => {
    const config = { discordToken: 'token', commands: { guilds: [process.env.GUILD_ID] } } satisfies MeoCordConfig

    expectTypeOf(config.commands.guilds).toEqualTypeOf<(string | undefined)[]>()
  })
})
