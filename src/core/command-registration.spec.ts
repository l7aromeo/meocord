import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { ApplicationCommandType, EntryPointCommandHandlerType, type PrimaryEntryPointCommandInteraction } from 'discord.js'
import { vi } from 'vitest'
import { Command, CommandBuilder, Controller } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { type CommandRegistrationConfig } from '@src/interface/index.js'
import { collectCommands, planTargets, registerCommands } from '@src/core/command-registration.js'

const createLogger = () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() })

/** A controller with one slash command per name; a builder's `guilds` restricts that command. */
function controllerWith(commands: { name: string; guilds?: (string | undefined)[] }[]) {
  @Controller()
  class GeneratedController {}

  for (const { name, guilds } of commands) {
    @CommandBuilder(CommandType.SLASH, guilds ? { guilds } : {})
    class Builder {
      build = () => ({ toJSON: () => ({ name, type: 1, description: name }) }) as any
    }
    const handler = async () => {}
    Object.defineProperty(GeneratedController.prototype, name, { value: handler, writable: true, configurable: true })
    const descriptor = Object.getOwnPropertyDescriptor(GeneratedController.prototype, name)!
    Command(name, Builder as any)(GeneratedController.prototype, name, descriptor as any)
  }

  return GeneratedController
}

const createRest = (existing: Record<string, { name: string }[]> = {}) => ({
  put: vi.fn().mockResolvedValue([]),
  get: vi.fn((route: string) => Promise.resolve(existing[route] ?? [])),
})

const sentTo = (rest: ReturnType<typeof createRest>) =>
  Object.fromEntries(rest.put.mock.calls.map(([route, { body }]) => [route, body.map((command: { name: string }) => command.name)]))

describe('collectCommands', () => {
  const builderFor = (name: string) => ({ toJSON: () => ({ name, type: 1, options: [] }) })

  it('collects one command when a builder is declared on two methods', () => {
    const builder = builderFor('settings')
    class SettingsBuilder {
      build = () => builder as any
    }
    Reflect.defineMetadata('commandType', CommandType.SLASH, SettingsBuilder)

    @Controller()
    class SettingsController {
      @Command('settings', SettingsBuilder as any)
      async one(..._args: any[]) {}

      @Command('settings', SettingsBuilder as any)
      async two(..._args: any[]) {}
    }

    const logger = createLogger()
    expect(collectCommands([SettingsController], logger)).toHaveLength(1)
    // The same builder twice is how subcommands split across methods are declared.
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('reads the prototypes, so no controller is constructed', () => {
    const constructed = vi.fn()
    class PingBuilder {
      build = () => builderFor('ping') as any
    }
    Reflect.defineMetadata('commandType', CommandType.SLASH, PingBuilder)

    @Controller()
    class PingController {
      constructor() {
        constructed()
        throw new Error('needs a database')
      }

      @Command('ping', PingBuilder as any)
      async ping(..._args: any[]) {}
    }

    expect(collectCommands([PingController], createLogger())).toHaveLength(1)
    expect(constructed).not.toHaveBeenCalled()
  })

  // A bulk update without that command would delete it from Discord, so nothing is sent at all.
  it('collects nothing, and says which, when a builder cannot be serialised', () => {
    class BrokenBuilder {
      build = () =>
        ({
          toJSON: () => {
            throw new Error('description is required')
          },
        }) as any
    }
    Reflect.defineMetadata('commandType', CommandType.SLASH, BrokenBuilder)

    @Controller()
    class BrokenController {
      @Command('broken', BrokenBuilder as any)
      async handle(..._args: any[]) {}
    }

    const logger = createLogger()
    expect(collectCommands([BrokenController], logger)).toBeUndefined()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('"broken" (description is required)'))
  })

  // Entry point commands have no builder class, so their builder returns the REST body itself.
  it('collects an entry point command from a raw REST body', () => {
    const body = {
      type: ApplicationCommandType.PrimaryEntryPoint as const,
      name: 'launch',
      description: 'Launch the activity',
      handler: EntryPointCommandHandlerType.AppHandler,
    }

    @CommandBuilder(CommandType.PRIMARY_ENTRY_POINT)
    class LaunchBuilder {
      build = () => body
    }

    @Controller()
    class LaunchController {
      @Command('launch', LaunchBuilder as any)
      async launch(_interaction: PrimaryEntryPointCommandInteraction) {}
    }

    expect(collectCommands([LaunchController], createLogger())?.map(command => command.body)).toEqual([body])
  })

  // Discord identifies a command by its type together with its name.
  describe('a name shared across application command types', () => {
    const collectPair = (first: ApplicationCommandType, second: ApplicationCommandType) => {
      const menu = (type: ApplicationCommandType) => ({ toJSON: () => ({ name: 'Genshin Profile', type }) })
      class FirstBuilder {
        build = () => menu(first) as any
      }
      class SecondBuilder {
        build = () => menu(second) as any
      }
      Reflect.defineMetadata('commandType', CommandType.CONTEXT_MENU, FirstBuilder)
      Reflect.defineMetadata('commandType', CommandType.CONTEXT_MENU, SecondBuilder)

      @Controller()
      class ProfileController {
        @Command('Genshin Profile', FirstBuilder as any)
        @Command('Genshin Profile', SecondBuilder as any)
        async profile(..._args: any[]) {}
      }

      const logger = createLogger()
      return { commands: collectCommands([ProfileController], logger)!, logger }
    }

    it('collects both, without a warning, when the types differ', () => {
      const { commands, logger } = collectPair(ApplicationCommandType.User, ApplicationCommandType.Message)

      expect(commands).toHaveLength(2)
      expect(logger.warn).not.toHaveBeenCalled()
    })

    it('collects one and warns when the types match', () => {
      const { commands, logger } = collectPair(ApplicationCommandType.User, ApplicationCommandType.User)

      expect(commands).toHaveLength(1)
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('built more than once'))
    })
  })

  // An untyped slash body is the chat input command Discord infers, so two of them are one command.
  it('treats slash builders with no declared type as one command, and warns', () => {
    class FirstBuilder {
      build = () => ({ toJSON: () => ({ name: 'settings', options: [] }) }) as any
    }
    class SecondBuilder {
      build = () => ({ toJSON: () => ({ name: 'settings', options: [] }) }) as any
    }
    Reflect.defineMetadata('commandType', CommandType.SLASH, FirstBuilder)
    Reflect.defineMetadata('commandType', CommandType.SLASH, SecondBuilder)

    @Controller()
    class SettingsController {
      @Command('settings', FirstBuilder as any)
      async one(..._args: any[]) {}

      @Command('settings', SecondBuilder as any)
      async two(..._args: any[]) {}
    }

    const logger = createLogger()
    expect(collectCommands([SettingsController], logger)).toHaveLength(1)
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('is built more than once'))
  })

  it("carries a builder's guilds", () => {
    const commands = collectCommands([controllerWith([{ name: 'ban', guilds: ['staff'] }])], createLogger())

    expect(commands?.[0].guilds).toEqual(['staff'])
  })
})

describe('planTargets', () => {
  const plan = (commands: { name: string; guilds?: (string | undefined)[] }[], config?: CommandRegistrationConfig, development = false, logger = createLogger()) =>
    planTargets(collectCommands([controllerWith(commands)], logger)!, { config, development }, logger).map(({ scope, commands }) => [
      scope === 'global' ? 'global' : scope.guild,
      commands.map(command => command.name),
    ])

  it('registers globally by default', () => {
    expect(plan([{ name: 'ping' }])).toEqual([['global', ['ping']]])
  })

  it('registers to each configured guild instead of globally', () => {
    expect(plan([{ name: 'ping' }], { guilds: ['one', 'two'] })).toEqual([
      ['one', ['ping']],
      ['two', ['ping']],
    ])
  })

  it("sends a builder's command to its own guilds, and the rest to the default scope", () => {
    expect(plan([{ name: 'ping' }, { name: 'ban', guilds: ['staff'] }])).toEqual([
      ['global', ['ping']],
      ['staff', ['ban']],
    ])
  })

  it("adds a builder's command to a configured guild it shares", () => {
    expect(plan([{ name: 'ping' }, { name: 'ban', guilds: ['one', 'staff'] }], { guilds: ['one'] })).toEqual([
      ['one', ['ping', 'ban']],
      ['staff', ['ban']],
    ])
  })

  // An unset variable must not quietly publish a staff-only command everywhere.
  it('registers a command whose builder lists no guild ids nowhere, and warns', () => {
    const logger = createLogger()

    expect(plan([{ name: 'ping' }, { name: 'ban', guilds: [undefined, ' '] }], undefined, false, logger)).toEqual([['global', ['ping']]])
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('"ban" lists no guild ids'))
  })

  it('sends everything to the development guild in development', () => {
    expect(plan([{ name: 'ping' }, { name: 'ban', guilds: ['staff'] }], { guilds: ['one'], developmentGuild: 'dev' }, true)).toEqual([
      ['dev', ['ping', 'ban']],
    ])
  })

  it('ignores the development guild in production', () => {
    expect(plan([{ name: 'ping' }], { developmentGuild: 'dev' }, false)).toEqual([['global', ['ping']]])
  })

  it('still sends the default scope when it has no commands, so removed ones are removed', () => {
    expect(plan([{ name: 'ban', guilds: ['staff'] }])).toEqual([
      ['global', []],
      ['staff', ['ban']],
    ])
  })
})

describe('registerCommands', () => {
  let cwd: string

  beforeEach(() => {
    cwd = mkdtempSync(path.join(tmpdir(), 'meocord-registration-'))
    mkdirSync(path.join(cwd, 'node_modules'))
    vi.spyOn(process, 'cwd').mockReturnValue(cwd)
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(cwd, { recursive: true, force: true })
  })

  const register = (overrides: Partial<Parameters<typeof registerCommands>[0]> = {}) => {
    const rest = (overrides.rest as ReturnType<typeof createRest>) ?? createRest()
    const logger = createLogger()
    const run = registerCommands({
      rest,
      applicationId: 'app',
      controllerClasses: [controllerWith([{ name: 'ping' }])],
      logger,
      development: false,
      ...overrides,
    })
    return { rest, logger, run }
  }

  it('sends one bulk update per scope, and reports success', async () => {
    const { rest, run } = register({ controllerClasses: [controllerWith([{ name: 'ping' }, { name: 'ban', guilds: ['staff'] }])] })

    await expect(run).resolves.toBe(true)
    expect(sentTo(rest)).toEqual({ '/applications/app/commands': ['ping'], '/applications/app/guilds/staff/commands': ['ban'] })
  })

  it('sends every command to one guild when asked, and checks no other scope', async () => {
    const { rest, run } = register({ onlyGuild: 'target', config: { guilds: ['one'] } })
    await run

    expect(sentTo(rest)).toEqual({ '/applications/app/guilds/target/commands': ['ping'] })
    expect(rest.get).not.toHaveBeenCalled()
  })

  it('sends nothing when a builder cannot be serialised', async () => {
    class BrokenBuilder {
      build = () => ({ toJSON: () => { throw new Error('bad') } }) as any
    }
    Reflect.defineMetadata('commandType', CommandType.SLASH, BrokenBuilder)
    @Controller()
    class BrokenController {
      @Command('broken', BrokenBuilder as any)
      async handle(..._args: any[]) {}
    }

    const { rest, run } = register({ controllerClasses: [BrokenController] })

    await expect(run).resolves.toBe(false)
    expect(rest.put).not.toHaveBeenCalled()
  })

  it('logs a rejected scope, keeps sending the others, and reports failure', async () => {
    const rest = createRest()
    rest.put.mockRejectedValueOnce(new Error('Invalid Form Body'))
    const { logger, run } = register({ rest, config: { guilds: ['one', 'two'] } })

    await expect(run).resolves.toBe(false)
    expect(rest.put).toHaveBeenCalledTimes(2)
    expect(logger.error).toHaveBeenCalledWith('Error registering commands to guild one:', expect.any(Error))
  })

  describe('in development', () => {
    it('skips a scope whose payload is unchanged since it was last sent', async () => {
      await register({ development: true }).run
      const { rest, logger, run } = register({ development: true })
      await run

      expect(rest.put).not.toHaveBeenCalled()
      expect(logger.log).toHaveBeenCalledWith(expect.stringContaining('unchanged'))
    })

    it('records the payload per application and scope', async () => {
      await register({ development: true }).run

      expect(readdirSync(path.join(cwd, 'node_modules', '.cache', 'meocord'))).toEqual(['commands-app-global.json'])
    })

    it.each([
      ['forced', { force: true }],
      ['for another application', { applicationId: 'other' }],
      ['for another scope', { config: { guilds: ['one'] } }],
      ['after the commands changed', { controllerClasses: [controllerWith([{ name: 'pong' }])] }],
    ])('sends again when %s', async (_label, overrides) => {
      await register({ development: true }).run
      const { rest, run } = register({ development: true, ...overrides })
      await run

      expect(rest.put).toHaveBeenCalled()
    })

    it('records nothing when the update is rejected, so the next start retries', async () => {
      const rest = createRest()
      rest.put.mockRejectedValue(new Error('down'))
      await register({ development: true, rest }).run

      expect(existsSync(path.join(cwd, 'node_modules', '.cache', 'meocord'))).toBe(false)
    })
  })

  it('never skips in production, and records nothing', async () => {
    await register().run
    const { rest, run } = register()
    await run

    expect(rest.put).toHaveBeenCalledTimes(1)
    expect(existsSync(path.join(cwd, 'node_modules', '.cache'))).toBe(false)
  })

  describe('leftovers in scopes the configuration names but does not send to', () => {
    it('warns about global commands left behind by a guild scope', async () => {
      const rest = createRest({ '/applications/app/commands': [{ name: 'ping' }] })
      const { logger, run } = register({ rest, config: { guilds: ['one'] } })
      await run

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('still registered globally (ping)'))
      expect(sentTo(rest)).toEqual({ '/applications/app/guilds/one/commands': ['ping'] })
    })

    it('removes them with clearOther', async () => {
      const rest = createRest({ '/applications/app/commands': [{ name: 'ping' }] })
      await register({ rest, config: { guilds: ['one'], clearOther: true } }).run

      expect(rest.put).toHaveBeenCalledWith('/applications/app/commands', { body: [] })
    })

    it('checks the development guild from a production start', async () => {
      const rest = createRest({ '/applications/app/guilds/dev/commands': [{ name: 'ping' }] })
      const { logger, run } = register({ rest, config: { developmentGuild: 'dev' } })
      await run

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('still registered to guild dev'))
    })

    it('says nothing when a scope cannot be listed, as for a guild the bot is not in', async () => {
      const rest = createRest()
      rest.get.mockRejectedValue(new Error('Missing Access'))
      const { logger, run } = register({ rest, config: { guilds: ['one'] } })

      await expect(run).resolves.toBe(true)
      expect(logger.warn).not.toHaveBeenCalled()
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Missing Access'))
    })

    it('checks nothing when every scope was unchanged', async () => {
      await register({ development: true, config: { guilds: ['one'] } }).run
      const { rest, run } = register({ development: true, config: { guilds: ['one'] } })
      await run

      expect(rest.get).not.toHaveBeenCalled()
    })
  })
})
