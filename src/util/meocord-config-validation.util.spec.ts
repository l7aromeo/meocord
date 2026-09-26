import {
  CHECKED_COMMANDS_KEYS,
  CHECKED_CONFIG_KEYS,
  CHECKED_SHARDING_KEYS,
  configProblems,
} from '@src/util/meocord-config-validation.util.js'

describe('configProblems', () => {
  it('finds nothing wrong with a valid configuration', () => {
    expect(
      configProblems({
        appName: 'Bot',
        discordToken: 'token',
        bundleDependencies: true,
        externals: ['sharp', /^@img\//],
        optionalExternals: ['zlib-sync'],
        rsbuild: (config: unknown) => config,
        shutdownTimeout: 5_000,
        commands: { guilds: ['1'], developmentGuild: '2', register: false, clearOther: true },
        sharding: { mode: 'process', shards: 'auto', development: false },
      }),
    ).toEqual({ errors: [], warnings: [] })
  })

  it('lists every option of the wrong type', () => {
    const { errors } = configProblems({
      discordToken: 42,
      sharding: { mode: 'bogus', shards: 0 },
      commands: { guilds: 'one', register: 'yes' },
      optionalExternals: 'sharp',
      shutdownTimeout: -1,
      rsbuild: {},
    })

    expect(errors).toEqual([
      'discordToken must be a string (got number)',
      "sharding.mode must be 'internal' or 'process' (got 'bogus')",
      "sharding.shards must be 'auto' or a whole number of shards (got number)",
      "commands.guilds must be an array of guild ids (got 'one')",
      "commands.register must be true or false (got 'yes')",
      "optionalExternals must be an array of package names (got 'sharp')",
      'shutdownTimeout must be a number of milliseconds (got number)',
      'rsbuild must be a function (got object)',
    ])
  })

  // `[process.env.GUILD_ID]` with the variable unset; registration drops the blank ids and warns
  it('accepts guild ids an unset environment variable leaves undefined', () => {
    expect(configProblems({ discordToken: 't', commands: { guilds: [undefined, '1'] } }).errors).toEqual([])
  })

  it('warns about options it does not know, at the top and nested, without failing', () => {
    expect(configProblems({ discordToken: 't', bundleDependancies: true, sharding: { shard: 2 } })).toEqual({
      errors: [],
      warnings: ['bundleDependancies is not a MeoCord option, so it has no effect.', 'sharding.shard is not a MeoCord option, so it has no effect.'],
    })
  })

  // jiti hands the CLI an interop proxy whose own keys are only `default`.
  it('reads through a module namespace with a default export', () => {
    expect(configProblems({ default: { discordToken: 7 } }).errors).toEqual(['discordToken must be a string (got number)'])
  })

  it('refuses a default export that is not an object', () => {
    expect(configProblems('token').errors).toEqual(["it must export an object as its default export (got 'token')"])
  })

  // The shape is typed against MeoCordConfig, so an option added there without a check fails to compile; this
  // names what is checked, so a change to either shows up in review.
  it('checks every option MeoCordConfig declares', () => {
    expect([...CHECKED_CONFIG_KEYS].sort()).toEqual(
      ['appName', 'bundleDependencies', 'commands', 'discordToken', 'externals', 'optionalExternals', 'rsbuild', 'sharding', 'shutdownTimeout', 'sourceMappedStacks'].sort(),
    )
  })

  // Typed against CommandRegistrationConfig and ShardingConfig, as the top level is against MeoCordConfig
  it('checks every option of commands and sharding', () => {
    expect([...CHECKED_COMMANDS_KEYS].sort()).toEqual(['clearOther', 'developmentGuild', 'guilds', 'register'])
    expect([...CHECKED_SHARDING_KEYS].sort()).toEqual(['development', 'mode', 'shards'])
  })
})
