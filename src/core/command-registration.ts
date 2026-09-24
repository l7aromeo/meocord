import { createHash } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import path from 'path'
import { ApplicationCommandType, Routes } from 'discord.js'
import Table from 'cli-table3'
import { getCommandMap } from '@src/decorator/controller.decorator.js'
import { localizationProblems } from '@src/core/command-localizations.js'
import { CommandType } from '@src/enum/index.js'
import { type CommandRegistrationConfig } from '@src/interface/index.js'
import { type CommandMetadata } from '@src/interface/command-decorator.interface.js'

/** The part of discord.js's `REST` registration uses, so a client's own and a standalone one both fit. */
export interface RegistrationRest {
  get(route: `/${string}`): Promise<unknown>
  put(route: `/${string}`, options: { body: unknown }): Promise<unknown>
}

/** What registration logs through. */
export interface RegistrationLogger {
  log(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  debug(...args: unknown[]): void
}

/** One command as it is sent, with the guilds its builder restricts it to. */
export interface CollectedCommand {
  name: string
  body: { name?: unknown; type?: unknown; options?: unknown }
  guilds?: (string | undefined)[]
}

/** `global`, or the id of a guild. */
export type RegistrationScope = 'global' | { guild: string }

export interface RegistrationTarget {
  scope: RegistrationScope
  commands: CollectedCommand[]
}

type Builder = NonNullable<CommandMetadata['builder']>

/** What Discord assumes a command body is when it carries no type of its own. */
const DEFAULT_APPLICATION_COMMAND_TYPE = ApplicationCommandType.ChatInput

/** The body a builder registers, which is what Discord sees; throws when the builder is incomplete. */
function serialise(builder: Builder): CollectedCommand['body'] {
  return typeof (builder as { toJSON?: () => unknown }).toJSON === 'function'
    ? ((builder as { toJSON: () => unknown }).toJSON() as CollectedCommand['body'])
    : (builder as CollectedCommand['body'])
}

/**
 * The identity Discord gives a command. The numeric type leads, so the halves never read apart
 * wrongly; an absent type is the chat input one Discord infers, so untyped slash builders collide.
 */
function registrationKey(body: CollectedCommand['body'], fallbackName: string): string {
  const type = typeof body.type === 'number' ? body.type : DEFAULT_APPLICATION_COMMAND_TYPE
  return `${type}:${typeof body.name === 'string' ? body.name : fallbackName}`
}

/**
 * Every command the controllers declare, read from their prototypes: nothing is constructed.
 *
 * @returns The commands, or `undefined` when a builder cannot be serialised. Registration then sends
 *   nothing, since a bulk update without that command would delete it from Discord.
 */
export function collectCommands(
  controllerClasses: (new (...args: any[]) => any)[],
  logger: RegistrationLogger,
): CollectedCommand[] | undefined {
  // Keyed by type and name: Discord treats that pair as one command, so a user and a message context
  // menu may share a name, and a command split across methods sends its builder once.
  const byKey = new Map<string, { builder: Builder; command: CollectedCommand }>()
  const broken: string[] = []
  const unlocalizable: string[] = []

  for (const controllerClass of controllerClasses) {
    const commandMap = getCommandMap(controllerClass.prototype) ?? {}

    for (const commandName in commandMap) {
      for (const { builder, type, guilds } of commandMap[commandName]) {
        if (!(type in CommandType) || !builder) continue

        let body: CollectedCommand['body']
        try {
          body = serialise(builder)
        } catch (error) {
          broken.push(`"${commandName}" (${error instanceof Error ? error.message : String(error)})`)
          continue
        }

        const key = registrationKey(body, commandName)
        const existing = byKey.get(key)

        if (existing === undefined) {
          const name = typeof body.name === 'string' ? body.name : commandName
          unlocalizable.push(...localizationProblems(name, body))
          byKey.set(key, { builder, command: { name, body, ...(guilds && { guilds }) } })
        } else if (existing.builder !== builder) {
          logger.warn(
            `Command "${existing.command.name}" is built more than once for the same application command type; ` +
              `only the first builder is registered. Two builders of one type cannot both own a name, so declare ` +
              `the builder on a single @Command and give the others the plain CommandType.`,
          )
        }
      }
    }
  }

  if (broken.length > 0) {
    logger.error(
      `No commands were registered: ${broken.length} builder(s) could not be serialised: ${broken.join(', ')}. ` +
        `Registering the rest would remove these from Discord.`,
    )
    return undefined
  }

  if (unlocalizable.length > 0) {
    logger.error(
      `No commands were registered: Discord would reject ${unlocalizable.length} localization(s):\n` +
        unlocalizable.map(problem => `  ${problem}`).join('\n'),
    )
    return undefined
  }

  return [...byKey.values()].map(({ command }) => command)
}

/** What decides where each command goes. */
export interface TargetOptions {
  config?: CommandRegistrationConfig
  /** Whether `NODE_ENV` is `development`, which is when `developmentGuild` applies. */
  development: boolean
  /** A guild every command goes to, as `meocord register --guild` asks. */
  onlyGuild?: string
}

const ids = (list: (string | undefined)[] | undefined): string[] => [
  ...new Set((list ?? []).map(id => id?.trim()).filter((id): id is string => !!id)),
]

const scopeKey = (scope: RegistrationScope): string => (scope === 'global' ? 'global' : `guild-${scope.guild}`)

/**
 * Where each command is sent: one bulk update per scope. A scope's update replaces everything the
 * application has there, so the default scope is always included, even when it ends up empty.
 */
export function planTargets(commands: CollectedCommand[], { config, development, onlyGuild }: TargetOptions, logger: RegistrationLogger): RegistrationTarget[] {
  const everythingTo = onlyGuild?.trim() || (development ? config?.developmentGuild?.trim() : undefined)
  if (everythingTo) return [{ scope: { guild: everythingTo }, commands }]

  const defaultGuilds = ids(config?.guilds)
  const targets = new Map<string, RegistrationTarget>()
  const add = (scope: RegistrationScope, command?: CollectedCommand) => {
    const key = scopeKey(scope)
    if (!targets.has(key)) targets.set(key, { scope, commands: [] })
    if (command) targets.get(key)!.commands.push(command)
  }

  if (defaultGuilds.length === 0) add('global')
  for (const guild of defaultGuilds) add({ guild })

  for (const command of commands) {
    if (command.guilds) {
      const own = ids(command.guilds)
      // Falling back to the default scope could publish a staff-only command everywhere.
      if (own.length === 0) logger.warn(`Command "${command.name}" lists no guild ids in its builder, so it is not registered.`)
      for (const guild of own) add({ guild }, command)
    } else if (defaultGuilds.length === 0) {
      add('global', command)
    } else {
      for (const guild of defaultGuilds) add({ guild }, command)
    }
  }

  return [...targets.values()]
}

/** The scopes this configuration names that registration is not sending to, where leftovers can sit. */
export function otherScopes(commands: CollectedCommand[], targets: RegistrationTarget[], config?: CommandRegistrationConfig): RegistrationScope[] {
  const sent = new Set(targets.map(({ scope }) => scopeKey(scope)))
  const named: RegistrationScope[] = [
    'global',
    ...ids([...(config?.guilds ?? []), config?.developmentGuild, ...commands.flatMap(command => command.guilds ?? [])]).map(guild => ({ guild })),
  ]
  return named.filter(scope => !sent.has(scopeKey(scope)))
}

const routeFor = (applicationId: string, scope: RegistrationScope) =>
  scope === 'global' ? Routes.applicationCommands(applicationId) : Routes.applicationGuildCommands(applicationId, scope.guild)

const describeScope = (scope: RegistrationScope) => (scope === 'global' ? 'globally' : `to guild ${scope.guild}`)

/** The development cache of what was last sent, per application and scope. Undefined without node_modules. */
function cacheFile(applicationId: string, scope: RegistrationScope): string | undefined {
  const nodeModules = path.resolve(process.cwd(), 'node_modules')
  if (!existsSync(nodeModules)) return undefined
  return path.join(nodeModules, '.cache', 'meocord', `commands-${applicationId}-${scopeKey(scope)}.json`)
}

const hashOf = (commands: CollectedCommand[]) =>
  createHash('sha256')
    .update(JSON.stringify(commands.map(({ body }) => body)))
    .digest('hex')

function readHash(file: string | undefined, logger: RegistrationLogger): string | undefined {
  if (!file || !existsSync(file)) return undefined
  try {
    return (JSON.parse(readFileSync(file, 'utf8')) as { hash?: string }).hash
  } catch (error) {
    logger.debug(`Could not read the registered commands, so they are sent again: ${String(error)}`)
    return undefined
  }
}

function writeHash(file: string | undefined, hash: string, logger: RegistrationLogger): void {
  if (!file) return
  try {
    mkdirSync(path.dirname(file), { recursive: true })
    writeFileSync(file, `${JSON.stringify({ hash })}\n`)
  } catch (error) {
    logger.debug(`Could not record the registered commands: ${String(error)}`)
  }
}

function logRegistered(target: RegistrationTarget, logger: RegistrationLogger): void {
  const table = new Table({ head: ['Name', 'Type', 'Sub-commands'], colWidths: [null, null, 30], wordWrap: true })
  const typeNames: Record<number, string> = { 1: 'SlashCommand', 2: 'UserContextMenu', 3: 'MessageContextMenu', 4: 'PrimaryEntryPoint' }

  for (const { name, body } of target.commands) {
    const options = Array.isArray(body.options) ? (body.options as { name?: string }[]) : []
    table.push([name, typeNames[typeof body.type === 'number' ? body.type : 1] ?? 'Command', options.map(option => option.name).join(', ')])
  }

  logger.log(`Registered ${target.commands.length} bot commands ${describeScope(target.scope)}:\n${table.toString()}`)
}

/** Everything one registration needs. */
export interface RegisterCommandsOptions extends TargetOptions {
  rest: RegistrationRest
  applicationId: string
  controllerClasses: (new (...args: any[]) => any)[]
  logger: RegistrationLogger
  /** Send every scope even when development's cache says it is unchanged. */
  force?: boolean
}

/**
 * Registers the application's commands with Discord: one bulk update per scope.
 *
 * Production always sends: a bulk update is idempotent, so comparing with what Discord holds first
 * would only add a request. In development (`development: true`) a scope whose payload matches the
 * last one sent from this project is skipped, unless `force` is set. Afterwards, the scopes the
 * configuration names but did not send to are checked for leftovers, which `clearOther` removes, except
 * in a development run sending to `developmentGuild`, which only warns.
 * Failures are logged, never thrown.
 *
 * @returns Whether every scope was registered or skipped as unchanged.
 */
export async function registerCommands(options: RegisterCommandsOptions): Promise<boolean> {
  const { rest, applicationId, controllerClasses, logger, config, development, onlyGuild, force = false } = options

  const commands = collectCommands(controllerClasses, logger)
  if (!commands) return false

  const targets = planTargets(commands, { config, development, onlyGuild }, logger)
  let succeeded = true
  let sent = false

  for (const target of targets) {
    const file = development ? cacheFile(applicationId, target.scope) : undefined
    const hash = hashOf(target.commands)

    if (development && !force && readHash(file, logger) === hash) {
      logger.log(`Commands ${describeScope(target.scope)} are unchanged; not registering them again.`)
      continue
    }

    try {
      await rest.put(routeFor(applicationId, target.scope), { body: target.commands.map(({ body }) => body) })
      sent = true
      if (development) writeHash(file, hash, logger)
      logRegistered(target, logger)
    } catch (error) {
      succeeded = false
      logger.error(`Error registering commands ${describeScope(target.scope)}:`, error)
    }
  }

  // Development and production often share one application, so a development guild run never clears.
  const toDevelopmentGuild = development && !!config?.developmentGuild?.trim()
  if (sent && !onlyGuild) await reportOtherScopes(options, commands, targets, !toDevelopmentGuild)

  return succeeded
}

/**
 * Warns about, or with `clearOther` removes, this application's commands left in scopes not sent to.
 * Without `mayClear`, as for a development guild run, it only warns.
 */
async function reportOtherScopes(
  { rest, applicationId, config, logger }: RegisterCommandsOptions,
  commands: CollectedCommand[],
  targets: RegistrationTarget[],
  mayClear: boolean,
): Promise<void> {
  for (const scope of otherScopes(commands, targets, config)) {
    let existing: { name?: string }[]
    try {
      existing = (await rest.get(routeFor(applicationId, scope))) as { name?: string }[]
    } catch (error) {
      // A guild the bot is not in answers 50001; there is nothing of ours to find there.
      logger.debug(`Could not list the commands registered ${describeScope(scope)}: ${String(error)}`)
      continue
    }
    if (!Array.isArray(existing) || existing.length === 0) continue

    const names = existing.map(({ name }) => name).join(', ')
    if (!config?.clearOther || !mayClear) {
      logger.warn(
        `${existing.length} command(s) are still registered ${describeScope(scope)} (${names}), which this ` +
          `configuration does not register to, so Discord keeps showing them there. ` +
          (config?.clearOther
            ? 'clearOther is on, but they are not removed while commands go to the development guild, since a production bot sharing this application may own them.'
            : 'Set commands.clearOther to remove them.'),
      )
      continue
    }

    try {
      await rest.put(routeFor(applicationId, scope), { body: [] })
      logger.log(`Removed ${existing.length} command(s) left registered ${describeScope(scope)}: ${names}`)
    } catch (error) {
      logger.error(`Error removing the commands left registered ${describeScope(scope)}:`, error)
    }
  }
}
