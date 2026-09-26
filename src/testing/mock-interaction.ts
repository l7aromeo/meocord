import 'reflect-metadata'
import { createMockFn, type MockedFunction, type Mock } from './mock-fn.js'
import {
  type APIAuthorizingIntegrationOwnersMap,
  type APIEmbed,
  type APIMessageTopLevelComponent,
  Component,
  Embed,
  type JSONEncodable,
  type MessageFlagsResolvable,
  type GuildBasedChannel,
  ApplicationCommandManager,
  ApplicationCommandOptionType,
  ApplicationCommandType,
  Attachment,
  ApplicationCommand,
  AuthorizingIntegrationOwners,
  Base,
  BaseChannel,
  BaseInteraction,
  BaseManager,
  ChannelManager,
  Client,
  ClientUser,
  Collection,
  CommandInteractionOptionResolver,
  ComponentType,
  DMMessageManager,
  Guild,
  GuildBan,
  GuildBanManager,
  GuildChannelManager,
  GuildMember,
  GuildMemberManager,
  GuildMessageManager,
  GuildManager,
  InteractionType,
  Locale,
  Message,
  MessageFlagsBitField,
  MessageMentions,
  Role,
  RoleManager,
  TextChannel,
  ThreadChannel,
  ThreadMember,
  ThreadMemberManager,
  User,
  UserManager,
  type CacheType,
  type CommandInteractionOption,
  DMChannel,
  ForumChannel,
  GuildForumThreadManager,
  GuildTextThreadManager,
  MediaChannel,
  NewsChannel,
} from 'discord.js'
import { createDiscordError } from './response.js'

// ---------------------------------------------------------------------------
// DeepMocked<T>
// ---------------------------------------------------------------------------

/**
 * A mock of `T`: every method a mock function, every nested object mocked in turn, five levels deep.
 *
 * Assignable wherever `T` is expected, since the mock is built on `T`'s real prototype. Properties
 * `T` declares `readonly` cannot be assigned afterwards; pass them to the factory as {@link MockProps}.
 */
export type DeepMocked<T, Depth extends number[] = []> = Depth['length'] extends 5
  ? T
  : {
      -readonly [K in keyof T]: T[K] extends (...args: infer A) => infer R
        ? MockedFunction<(...args: A) => R>
        : T[K] extends object
          ? DeepMocked<T[K], [...Depth, 0]>
          : T[K]
    } & T

/**
 * Property values a mock factory applies at construction.
 *
 * Use it for anything the discord.js class declares `readonly`, such as
 * `ModalSubmitInteraction#customId` or `MessageComponentInteraction#message`, which the returned
 * mock does not let you assign afterwards.
 *
 * `authorizingIntegrationOwners` also takes the plain map Discord sends, such as
 * `{ [ApplicationIntegrationType.UserInstall]: userId }`, and becomes the object discord.js builds
 * from it.
 *
 * @example
 * ```ts
 * const modal = createMockInteraction(ModalSubmitInteraction, { customId: 'feedback' })
 * ```
 */
export type MockProps<T> = {
  // Methods stay loosely typed: every literal carries `Object.prototype.valueOf`, which clashes with
  // discord.js `Base#valueOf(): string`. Objects take `T[K]` alone, since `DeepMocked<X> | X` is X.
  -readonly [K in keyof T]?: K extends 'authorizingIntegrationOwners'
    ? T[K] | APIAuthorizingIntegrationOwnersMap
    : T[K] extends (...args: any[]) => any
      ? (...args: any[]) => any
      : T[K]
}

// ---------------------------------------------------------------------------
// stubDeep — Proxy that auto-creates a mock fn on any property access
// ---------------------------------------------------------------------------

const SKIP = new Set(['constructor', 'toString', 'valueOf', 'toJSON', 'then'])

type StubValue = Mock | object

function stubDeep(instance: object, externalStubs?: Map<string, StubValue>): object {
  const stubs = externalStubs ?? new Map<string, StubValue>()

  const proxy: object = new Proxy(instance, {
    get(target, prop) {
      // Always pass through symbols
      if (typeof prop === 'symbol') {
        return Reflect.get(target, prop, target)
      }

      const key = prop as string

      // 'then' must be undefined — prevents frameworks treating the mock as a Promise
      if (key === 'then') return undefined

      // Own property writes take precedence (e.g. interaction.guildId = 'abc')
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        return Reflect.get(target, prop, target)
      }

      // Skip passthrough props — return prototype value as-is
      if (SKIP.has(key)) {
        return Reflect.get(target, prop, target)
      }

      // Return cached stub
      if (stubs.has(key)) return stubs.get(key)

      // Walk the prototype chain to check if it's a function
      let proto: object | null = Object.getPrototypeOf(target)
      let protoValue: unknown
      while (proto !== null) {
        const desc = Object.getOwnPropertyDescriptor(proto, key)
        if (desc !== undefined) {
          protoValue = desc.value
          break
        }
        proto = Object.getPrototypeOf(proto)
      }

      const stub: StubValue =
        typeof protoValue === 'function' ? methodStub(target, key, protoValue as (...args: unknown[]) => unknown, () => proxy) : stubDeep({})
      stubs.set(key, stub)
      return stub
    },

    // defineProperty rather than assignment: many discord.js properties are
    // prototype getters with no setter (targetUser, targetMessage, createdAt),
    // and a plain write against one of those is a silent no-op. Defining an own
    // data property shadows the accessor, which is what test setup means.
    set(target, prop, value) {
      Object.defineProperty(target, prop, { value, writable: true, enumerable: true, configurable: true })
      return true
    },
  })
  return proxy
}

// ---------------------------------------------------------------------------
// methodStub — what an auto-stubbed discord.js method returns
// ---------------------------------------------------------------------------

// discord.js methods not declared `async` that still return a promise; `set*` setters are matched by name
const PROMISE_METHODS = new Set([
  'ban',
  'clone',
  'createInvite',
  'disableCommunicationUntil',
  'edit',
  'fetch',
  'fetchFlags',
  'fetchInvites',
  'fetchMe',
  'fetchReply',
  'fetchWebhooks',
  'fetchWidget',
  'forward',
  'pin',
  'removeAttachments',
  'suppressEmbeds',
  'timeout',
  'unpin',
])

// The client user's presence setters, which apply at once and return the presence
const SYNC_SETTERS = new Set(['setActivity', 'setAFK', 'setPresence', 'setStatus'])

// Methods that resolve to a message, wherever they are declared
const MESSAGE_METHODS = new Set([
  'crosspost',
  'fetchReference',
  'fetchReply',
  'fetchStarterMessage',
  'forward',
  'reply',
  'send',
])

// Methods of a structure that resolve to the structure itself, as discord.js patches and returns it
const SELF_METHODS = new Set(['ban', 'delete', 'disableCommunicationUntil', 'edit', 'fetch', 'pin', 'timeout', 'unpin'])

// The item each manager fetches, creates and edits
const MANAGER_ITEMS: [{ prototype: object }, () => object][] = [
  [UserManager, () => createMockUser()],
  [GuildManager, () => createMockGuild()],
  [GuildMemberManager, () => createMockInteraction(GuildMember)],
  [RoleManager, () => createMockInteraction(Role)],
  [GuildBanManager, () => createMockInteraction(GuildBan)],
  [GuildMessageManager, () => createMockMessage()],
  [DMMessageManager, () => createMockMessage()],
  [GuildTextThreadManager, () => createMockChannel(ThreadChannel)],
  [GuildForumThreadManager, () => createMockChannel(ThreadChannel)],
  [ThreadMemberManager, () => createMockInteraction(ThreadMember)],
  [ApplicationCommandManager, () => createMockInteraction(ApplicationCommand)],
  [ChannelManager, () => createMockChannel(TextChannel)],
  [GuildChannelManager, () => createMockChannel(TextChannel)],
]

const returnsPromise = (key: string, method: (...args: unknown[]) => unknown) =>
  method.constructor.name === 'AsyncFunction' ||
  PROMISE_METHODS.has(key) ||
  (/^set[A-Z]/.test(key) && !SYNC_SETTERS.has(key))

// A fetch for one item: an id, a discord.js object, or options naming one, such as `{ user: id }`
function fetchesOne(args: unknown[]): boolean {
  const [first] = args
  if (typeof first === 'string' || first instanceof Base) return true
  if (typeof first !== 'object' || first === null) return false
  return ['user', 'member', 'message', 'guild', 'thread', 'id'].some(key => {
    const value = (first as Record<string, unknown>)[key]
    return typeof value === 'string' || value instanceof Base
  })
}

/**
 * The mock function for a method found on a discord.js prototype. A method that returns a promise in
 * discord.js resolves: to a message for `send` and its kin, to the item for a manager's `fetch`,
 * `create` and `edit` (an empty collection for a list fetch), to the structure itself for its own
 * `edit`, `fetch` and setters, and to `undefined` otherwise. Any other method returns `undefined`.
 */
function methodStub(target: object, key: string, method: (...args: unknown[]) => unknown, receiver: () => object): Mock {
  if (!returnsPromise(key, method)) return createMockFn()
  if (key === 'createDM') return createMockFn(async () => createMockChannel(DMChannel))
  if (MESSAGE_METHODS.has(key)) return createMockFn(async () => createMockMessage())
  if (target instanceof BaseManager) {
    const item = MANAGER_ITEMS.find(([Manager]) => Manager.prototype.isPrototypeOf(target))?.[1]
    if (item && key === 'fetch') return createMockFn(async (...args: unknown[]) => (fetchesOne(args) ? item() : new Collection()))
    if (item && (key === 'create' || key === 'edit')) return createMockFn(async () => item())
  } else if (target instanceof Base && (SELF_METHODS.has(key) || /^set[A-Z]/.test(key))) {
    return createMockFn(async () => receiver())
  }
  return createMockFn(async () => undefined)
}

// ---------------------------------------------------------------------------
// Class type fields — sets this.type / commandType / componentType on the
// instance so all prototype type-guard methods run with real logic
// ---------------------------------------------------------------------------

const CLASS_TYPE_FIELDS: Record<string, { type?: number; commandType?: number; componentType?: number }> = {
  ChatInputCommandInteraction: {
    type: InteractionType.ApplicationCommand,
    commandType: ApplicationCommandType.ChatInput,
  },
  ContextMenuCommandInteraction: { type: InteractionType.ApplicationCommand, commandType: ApplicationCommandType.User },
  UserContextMenuCommandInteraction: {
    type: InteractionType.ApplicationCommand,
    commandType: ApplicationCommandType.User,
  },
  MessageContextMenuCommandInteraction: {
    type: InteractionType.ApplicationCommand,
    commandType: ApplicationCommandType.Message,
  },
  PrimaryEntryPointCommandInteraction: {
    type: InteractionType.ApplicationCommand,
    commandType: ApplicationCommandType.PrimaryEntryPoint,
  },
  MessageComponentInteraction: { type: InteractionType.MessageComponent },
  ButtonInteraction: { type: InteractionType.MessageComponent, componentType: ComponentType.Button },
  StringSelectMenuInteraction: { type: InteractionType.MessageComponent, componentType: ComponentType.StringSelect },
  UserSelectMenuInteraction: { type: InteractionType.MessageComponent, componentType: ComponentType.UserSelect },
  RoleSelectMenuInteraction: { type: InteractionType.MessageComponent, componentType: ComponentType.RoleSelect },
  MentionableSelectMenuInteraction: {
    type: InteractionType.MessageComponent,
    componentType: ComponentType.MentionableSelect,
  },
  ChannelSelectMenuInteraction: { type: InteractionType.MessageComponent, componentType: ComponentType.ChannelSelect },
  ModalSubmitInteraction: { type: InteractionType.ModalSubmit },
  AutocompleteInteraction: { type: InteractionType.ApplicationCommandAutocomplete },
}

// All known pure type-guard methods on BaseInteraction and its subclasses.
// These are wired as a mock fn wrapping the real prototype logic so they return
// correct values by default and can still be overridden per test.
const TYPE_GUARD_METHODS = [
  'isCommand',
  'isChatInputCommand',
  'isContextMenuCommand',
  'isUserContextMenuCommand',
  'isMessageContextMenuCommand',
  'isPrimaryEntryPointCommand',
  'isMessageComponent',
  'isButton',
  'isStringSelectMenu',
  'isUserSelectMenu',
  'isRoleSelectMenu',
  'isMentionableSelectMenu',
  'isChannelSelectMenu',
  'isAnySelectMenu',
  // `isSelectMenu` is intentionally absent: discord.js deprecated it in favour of
  // `isStringSelectMenu`, and wiring it here would emit a deprecation warning on every
  // mock that has it on its prototype.
  'isModalSubmit',
  'isAutocomplete',
  'isRepliable',
  'isFromMessage',
] as const

interface InteractionClass<T> {
  prototype: T
  name: string
}

function findPrototypeMethod(instance: object, name: string): ((...args: unknown[]) => unknown) | null {
  let proto: object | null = Object.getPrototypeOf(instance)
  while (proto !== null) {
    const desc = Object.getOwnPropertyDescriptor(proto, name)
    if (desc?.value && typeof desc.value === 'function') return desc.value as (...args: unknown[]) => unknown
    proto = Object.getPrototypeOf(proto)
  }
  return null
}

// ---------------------------------------------------------------------------
// Snowflake ids
// ---------------------------------------------------------------------------

/** The most choices Discord accepts in one autocomplete response. */
const MAX_AUTOCOMPLETE_CHOICES = 25

/** The last id a mock was given; ids count up from a real snowflake, so each mock's is its own. */
let lastSnowflake = 1_400_000_000_000_000_000n

/** A snowflake-shaped id no other mock in this run has. */
const nextSnowflake = (): string => String(++lastSnowflake)

/** A mock user that is a person, with an id of its own. */
const mockUser = (): object => stubDeep(Object.assign(Object.create(User.prototype), { id: nextSnowflake(), bot: false }))

// ---------------------------------------------------------------------------
// createMockInteraction
// ---------------------------------------------------------------------------

/**
 * Creates a mock instance of a discord.js class, keeping its prototype so `instanceof` holds.
 *
 * Type guards such as `isButton()` run the real discord.js logic. An interaction gets an `id`, a
 * `channelId` and a `user` with an `id`, each a snowflake no other mock in the run has, unless given.
 * `inGuild()`, `inCachedGuild()` and `inRawGuild()` answer from the mock's own `guildId` and `guild`,
 * so a mock created without a `guildId` is a DM, with `guildId`, `guild` and `member` `null`. An interaction's `locale` is `'en-US'`, and its `guildLocale` is `'en-US'` with
 * a `guildId` and `null` without, unless given. Replies behave like a real
 * interaction: `reply()` or `deferReply()` twice throws, and `followUp()`, `editReply()` and
 * `deleteReply()` throw before a reply. Every method is a mock function you can override; one that
 * returns a promise in discord.js resolves, such as `send()` to a mock message.
 *
 * @param Class - The discord.js class to mock.
 * @param props - Values for properties the class declares `readonly`; see {@link MockProps}.
 *
 * @example
 * ```ts
 * const interaction = createMockInteraction(ButtonInteraction)
 * interaction.isButton()                       // true
 * await interaction.reply({ content: 'hi' })
 * interaction.replied                          // true
 * await interaction.reply({ content: 'again' }) // throws: already replied
 * ```
 */
export function createMockInteraction<T extends object>(
  Class: InteractionClass<T>,
  props?: MockProps<T>,
): DeepMocked<T> {
  const instance = Object.create(Class.prototype) as Record<string, unknown>
  const stubs = new Map<string, Mock>()

  // Set type fields so all prototype type-guard methods compute the right value
  const fields = CLASS_TYPE_FIELDS[Class.name]
  if (fields !== undefined) {
    for (const [key, value] of Object.entries(fields)) {
      instance[key] = value
    }
  }

  // Wire each type guard as a mock fn calling the real prototype implementation.
  // Correct by default; overridable per test via .mockReturnValue().
  for (const name of TYPE_GUARD_METHODS) {
    const method = findPrototypeMethod(instance, name)
    if (method !== null) {
      stubs.set(
        name,
        createMockFn().mockImplementation(() => method.call(instance)),
      )
    }
  }

  // Guild checks read the mock's own data, since discord.js resolves `guild` through a client the
  // mock lacks: a guildId is a guild, a guild object with it a cached one, neither a DM. A member
  // not given is the auto-stub, so only one set to null or undefined fails the check.
  const own = (key: string) => (Object.prototype.hasOwnProperty.call(instance, key) ? instance[key] : undefined)
  const hasMember = () => !Object.prototype.hasOwnProperty.call(instance, 'member') || Boolean(instance.member)
  const guildChecks = {
    inGuild: () => Boolean(own('guildId') && hasMember()),
    inCachedGuild: () => Boolean(own('guildId') && own('guild') && hasMember()),
    inRawGuild: () => Boolean(own('guildId') && !own('guild') && hasMember()),
  }
  for (const [name, check] of Object.entries(guildChecks)) {
    if (findPrototypeMethod(instance, name) !== null) stubs.set(name, createMockFn().mockImplementation(check))
  }

  // Set up reply state machine for repliable interactions
  const isRepliableMethod = findPrototypeMethod(instance, 'isRepliable')
  const repliable = isRepliableMethod !== null && (isRepliableMethod.call(instance) as boolean)
  if (repliable) {
    instance.replied = false
    instance.deferred = false
    instance.ephemeral = false

    const alreadyReplied = () => new Error('The reply to this interaction has already been sent or deferred.')
    const notYetReplied = (method: string) => new Error(`Cannot call ${method}() before replying or deferring.`)

    // Only `flags` is read: the `ephemeral: true` reply option is deprecated in
    // discord.js, and honouring it here would let a test pass against a call the
    // library has stopped supporting.
    const hasEphemeralFlag = (options?: Record<string, unknown>): boolean => {
      if (!options) return false
      const { flags } = options
      if (typeof flags === 'number') return (flags & 64) !== 0
      if (typeof flags === 'bigint') return (flags & 64n) !== 0n
      return false
    }

    stubs.set(
      'reply',
      createMockFn(async (...args: unknown[]) => {
        if (instance.deferred || instance.replied) throw alreadyReplied()
        instance.replied = true
        if (hasEphemeralFlag(args[0] as Record<string, unknown> | undefined)) instance.ephemeral = true
      }),
    )
    stubs.set(
      'deferReply',
      createMockFn(async (...args: unknown[]) => {
        if (instance.deferred || instance.replied) throw alreadyReplied()
        instance.deferred = true
        if (hasEphemeralFlag(args[0] as Record<string, unknown> | undefined)) instance.ephemeral = true
      }),
    )
    stubs.set(
      'followUp',
      createMockFn(async () => {
        if (!instance.deferred && !instance.replied) throw notYetReplied('followUp')
        instance.replied = true
        return createMockMessage()
      }),
    )
    stubs.set(
      'editReply',
      createMockFn(async () => {
        if (!instance.deferred && !instance.replied) throw notYetReplied('editReply')
        instance.replied = true
        return createMockMessage()
      }),
    )
    stubs.set(
      'deleteReply',
      createMockFn(async () => {
        if (!instance.deferred && !instance.replied) throw notYetReplied('deleteReply')
      }),
    )

    // showModal — the first response of a command or a component, like reply()
    if (instance.type === InteractionType.ApplicationCommand || instance.type === InteractionType.MessageComponent) {
      stubs.set(
        'showModal',
        createMockFn(async () => {
          if (instance.deferred || instance.replied) throw alreadyReplied()
          instance.replied = true
        }),
      )
    }

    // deferUpdate / update — components, and modals submitted from a message's component
    if (instance.type === InteractionType.MessageComponent || instance.type === InteractionType.ModalSubmit) {
      stubs.set(
        'update',
        createMockFn(async () => {
          if (instance.deferred || instance.replied) throw alreadyReplied()
          instance.replied = true
        }),
      )
      stubs.set(
        'deferUpdate',
        createMockFn(async () => {
          if (instance.deferred || instance.replied) throw alreadyReplied()
          instance.deferred = true
        }),
      )
    }
  }

  // Autocomplete is not repliable, but it has a response of its own: Discord accepts
  // one `respond()` per interaction and rejects the second. Without `responded` set
  // here it would read as an auto-stubbed object -- truthy -- and any code that checks
  // it before answering would decide the window was already closed.
  if (instance.type === InteractionType.ApplicationCommandAutocomplete) {
    instance.responded = false
    stubs.set(
      'respond',
      createMockFn(async (choices?: unknown) => {
        if (instance.responded) throw new Error('The reply to this interaction has already been sent or deferred.')
        // Discord refuses a list longer than its limit, and the menu shows nothing
        if (Array.isArray(choices) && choices.length > MAX_AUTOCOMPLETE_CHOICES) {
          throw createDiscordError(50035, `Invalid Form Body\ndata.choices[BASE_TYPE_MAX_LENGTH]: Must be ${MAX_AUTOCOMPLETE_CHOICES} or fewer in length.`)
        }
        instance.responded = true
      }),
    )
  }

  // Applied last so an explicit prop wins over the type fields and the reply
  // state machine. defineProperty rather than assignment for the same reason the
  // Proxy uses it: several of these shadow a getter-only prototype accessor.
  if (props !== undefined) {
    for (const [key, given] of Object.entries(props)) {
      // A plain `{ [ApplicationIntegrationType.UserInstall]: userId }` becomes the object discord.js builds from it
      const value =
        key === 'authorizingIntegrationOwners' && given && !(given instanceof AuthorizingIntegrationOwners)
          ? new (AuthorizingIntegrationOwners as unknown as new (client: unknown, data: unknown) => AuthorizingIntegrationOwners)(
              instance.client,
              given,
            )
          : given
      Object.defineProperty(instance, key, { value, writable: true, enumerable: true, configurable: true })
    }
  }

  // Ids and a user, as Discord always sends; no server unless the test names one, as in a direct message
  if (BaseInteraction.prototype.isPrototypeOf(instance)) {
    const unset = (key: string) => !Object.prototype.hasOwnProperty.call(instance, key)
    if (unset('id')) instance.id = nextSnowflake()
    if (unset('user')) instance.user = mockUser()
    if (unset('channelId')) instance.channelId = nextSnowflake()
    if (unset('guildId')) {
      instance.guildId = null
      if (unset('guild')) Object.defineProperty(instance, 'guild', { value: null, writable: true, configurable: true })
      // A member once a test gives the mock a guildId, as discord.js has one for an interaction in a server
      let member: unknown
      if (unset('member')) {
        Object.defineProperty(instance, 'member', {
          get: () => (own('guildId') ? (member ??= stubDeep({})) : null),
          enumerable: true,
          configurable: true,
        })
      }
    }
  }

  // Discord sends the user's locale with every interaction, and the server's with one made in a server
  if (BaseInteraction.prototype.isPrototypeOf(instance)) {
    if (own('locale') === undefined) instance.locale = Locale.EnglishUS
    if (!Object.prototype.hasOwnProperty.call(instance, 'guildLocale')) {
      instance.guildLocale = own('guildId') ? Locale.EnglishUS : null
    }
  }

  return stubDeep(instance, stubs) as DeepMocked<T>
}

// ---------------------------------------------------------------------------
// createMock — class-free mock for services and interfaces
// ---------------------------------------------------------------------------

/**
 * A mock function that answers property access with another one, so `cache.store.flush()` works
 * on a double whose shape is an interface with nothing at runtime to read it from.
 */
function stubCallable(): Mock {
  const fn = createMockFn()
  const nested = new Map<string, Mock>()

  return new Proxy(fn, {
    get(target, prop) {
      if (typeof prop === 'symbol') return Reflect.get(target, prop, target)

      const key = prop as string

      // Never thenable — otherwise awaiting a mock hangs on itself
      if (key === 'then') return undefined

      // The mock's own API (`mock`, `mockReturnValue`, `_isMockFunction`, …) and
      // the function intrinsics pass straight through.
      if (key in target) return Reflect.get(target, prop, target)

      if (!nested.has(key)) nested.set(key, stubCallable())
      return nested.get(key) as Mock
    },

    set(target, prop, value) {
      Object.defineProperty(target, prop, { value, writable: true, enumerable: true, configurable: true })
      return true
    },
  }) as Mock
}

/**
 * Creates a mock of any type, with no class needed, for service doubles and interfaces.
 *
 * Every property is a mock function created on first access, and the result is assignable to `T`.
 * Values passed as `props` are used as given rather than wrapped in mock functions.
 *
 * @example
 * ```ts
 * const notifications = createMock<NotificationService>()
 * notifications.notify.mockResolvedValue('sent')
 *
 * const module = MeoCordTestingModule.create({
 *   controllers: [AlertController],
 *   providers: [{ provide: NotificationService, useValue: notifications }],
 * }).compile()
 * ```
 */
export function createMock<T extends object>(props?: MockProps<T>): DeepMocked<T> {
  const target: Record<string, unknown> = {}

  if (props !== undefined) {
    for (const [key, value] of Object.entries(props)) {
      Object.defineProperty(target, key, { value, writable: true, enumerable: true, configurable: true })
    }
  }

  const stubs = new Map<string, Mock>()

  return new Proxy(target, {
    get(instance, prop) {
      if (typeof prop === 'symbol') return Reflect.get(instance, prop, instance)

      const key = prop as string

      if (key === 'then') return undefined

      // An explicitly supplied prop wins over the auto-stub.
      if (Object.prototype.hasOwnProperty.call(instance, key)) return Reflect.get(instance, prop, instance)

      if (!stubs.has(key)) stubs.set(key, stubCallable())
      return stubs.get(key) as Mock
    },

    set(instance, prop, value) {
      Object.defineProperty(instance, prop, { value, writable: true, enumerable: true, configurable: true })
      return true
    },
  }) as unknown as DeepMocked<T>
}

// ---------------------------------------------------------------------------
// Convenience wrappers for common discord.js classes
// ---------------------------------------------------------------------------

/** Creates a mock {@link User}: a person, not a bot, with an id of its own. All methods are auto-stubbed as a mock fn. */
export const createMockUser = (): DeepMocked<User> => createMockInteraction(User, { id: nextSnowflake(), bot: false })

/**
 * Creates a mock {@link Client}, with `users`, `channels`, `guilds` and `application.commands` ready to
 * stub. Their methods resolve as discord.js's do: `users.send()` to a mock message, `users.fetch(id)`
 * to a mock user, `channels.fetch(id)` to a mock text channel, and a list fetch to an empty collection.
 */
export function createMockClient(): DeepMocked<Client> {
  const instance = Object.create(Client.prototype) as Record<string, unknown>

  // Manager properties are constructor-assigned — pre-initialize as prototype-based
  // stubs so ALL manager methods (not just fetch) are auto-stubbed as a mock fn.
  const appInstance = Object.create(null) as Record<string, unknown>
  appInstance.commands = stubDeep(Object.create(ApplicationCommandManager.prototype))

  instance.users = stubDeep(Object.create(UserManager.prototype))
  instance.channels = stubDeep(Object.create(ChannelManager.prototype))
  instance.guilds = stubDeep(Object.create(GuildManager.prototype))
  instance.user = stubDeep(Object.create(ClientUser.prototype))
  instance.application = stubDeep(appInstance)

  return stubDeep(instance) as DeepMocked<Client>
}

/** What {@link createMockGuild} puts in the guild's caches, as the gateway would have filled them. */
export interface MockGuildOverrides {
  /** The guild's id. */
  id?: string
  /** Members in `members.cache`, by their id. */
  members?: readonly GuildMember[]
  /** Roles in `roles.cache`, by their id. */
  roles?: readonly Role[]
  /** Channels in `channels.cache`, by their id. */
  channels?: readonly GuildBasedChannel[]
}

/** A manager whose `cache` is a real collection of `items`, by id, empty without them, and whose methods are stubs. */
function managerWith(prototype: object, items: readonly { id: string; user?: { id: string } }[] | undefined): object {
  const manager = Object.create(prototype) as object
  const cache = new Collection((items ?? []).map(item => [String(item.id ?? item.user?.id), item]))
  Object.defineProperty(manager, 'cache', { value: cache, writable: true })
  return stubDeep(manager)
}

/**
 * Creates a mock {@link Guild}, with the `members`, `channels`, `roles` and `bans` managers ready
 * to stub. A manager's `fetch(id)`, `create()` and `edit()` resolve to a mock of its item, and a list
 * fetch to an empty collection. Members, roles and channels given are put in their managers' caches,
 * where dispatch looks first when resolving a message's typed params.
 *
 * @example
 * ```ts
 * const target = createMock<GuildMember>({ id: '111' })
 * const message = createMockMessage({ content: '!ban 111 spam', guild: createMockGuild({ members: [target] }) })
 * ```
 */
export function createMockGuild(overrides: MockGuildOverrides = {}): DeepMocked<Guild> {
  const instance = Object.create(Guild.prototype) as Record<string, unknown>
  instance.id = nextSnowflake()

  if (overrides.id !== undefined) instance.id = overrides.id
  instance.members = managerWith(GuildMemberManager.prototype, overrides.members as never)
  instance.channels = managerWith(GuildChannelManager.prototype, overrides.channels as never)
  instance.roles = managerWith(RoleManager.prototype, overrides.roles as never)
  instance.bans = stubDeep(Object.create(GuildBanManager.prototype))

  return stubDeep(instance) as DeepMocked<Guild>
}

/**
 * Creates a mock channel of the given class, such as `TextChannel`, `ThreadChannel` or `DMChannel`,
 * with the managers that class has ready to stub: `messages`, `threads` on text, announcement, forum
 * and media channels, and `members` on threads. A subclass gets the managers of the class it extends.
 * @param Class - The discord.js channel class to mock.
 */
export function createMockChannel<T extends BaseChannel>(Class: InteractionClass<T>): DeepMocked<T> {
  const instance = Object.create(Class.prototype) as Record<string, unknown>
  instance.id = nextSnowflake()
  const is = (Base: { prototype: object }) => Base.prototype.isPrototypeOf(Class.prototype) || Class === Base

  // Text and announcement channels: messages, and threads made in the channel
  if (is(TextChannel) || is(NewsChannel)) {
    instance.messages = stubDeep(Object.create(GuildMessageManager.prototype))
    instance.threads = stubDeep(Object.create(GuildTextThreadManager.prototype))
  }
  // Forum and media channels hold posts, each a thread started with its first message
  if (is(ForumChannel) || is(MediaChannel)) {
    instance.threads = stubDeep(Object.create(GuildForumThreadManager.prototype))
  }
  if (is(DMChannel)) {
    instance.messages = stubDeep(Object.create(DMMessageManager.prototype))
  }
  if (is(ThreadChannel)) {
    instance.messages = stubDeep(Object.create(GuildMessageManager.prototype))
    instance.members = stubDeep(Object.create(ThreadMemberManager.prototype))
  }

  return stubDeep(instance) as DeepMocked<T>
}

/** The guild a mock message carries: a guild with the same stubbed managers as createMockGuild. */
function createMockGuildForMessage(): object {
  const guild = Object.create(Guild.prototype) as Record<string, unknown>
  guild.id = nextSnowflake()
  guild.members = managerWith(GuildMemberManager.prototype, undefined)
  guild.channels = managerWith(GuildChannelManager.prototype, undefined)
  guild.roles = managerWith(RoleManager.prototype, undefined)
  guild.bans = stubDeep(Object.create(GuildBanManager.prototype))
  return stubDeep(guild)
}

/**
 * What {@link createMockMessage} builds a message with. Components and embeds may be API JSON,
 * builders or discord.js instances.
 */
export interface MockMessageOverrides {
  /** The message's id. */
  id?: string
  /** The message's text. */
  content?: string
  /** Its top-level components: action rows, or Components V2 such as a container. */
  components?: readonly (APIMessageTopLevelComponent | JSONEncodable<APIMessageTopLevelComponent>)[]
  /** Its embeds. */
  embeds?: readonly (APIEmbed | JSONEncodable<APIEmbed>)[]
  /** Its flags: a number, flag names or a `MessageFlagsBitField`. */
  flags?: MessageFlagsResolvable
  /** The guild it was sent in, such as one from `createMockGuild` with members in its cache; `null` for a DM. */
  guild?: Guild | null
}

/**
 * A component or embed as a message holds it: a discord.js instance as it is; anything else as
 * its API JSON at the time of the call, behind `toJSON()`.
 */
function asHeld<T>(value: T | JSONEncodable<T>): JSONEncodable<T> {
  if (value instanceof Component || value instanceof Embed) return value as JSONEncodable<T>
  const json = structuredClone(
    typeof (value as Partial<JSONEncodable<T>>).toJSON === 'function' ? (value as JSONEncodable<T>).toJSON() : (value as T),
  )
  return { toJSON: () => json }
}

/**
 * Creates a mock {@link Message} that tracks whether it has been deleted.
 *
 * `delete()`, `edit()`, `reply()`, `react()`, `pin()` and `unpin()` throw once the message is
 * deleted; `edit()` and `reply()` resolve to a new mock message. Nested members such as
 * `msg.author.send` and `msg.guild.members.fetch` are ready to use, and every method is a mock
 * function you can override per test.
 *
 * Without overrides the message is empty: no flags, components, embeds or attachments. Components
 * and embeds given as API JSON or builders keep that JSON behind `toJSON()`, which is what
 * `respond()` and `@Defer` read, such as when `@Defer` locks the controls of the message a button
 * sits on; discord.js instances are kept as they are.
 *
 * @param overrides - The message's id, content, components, embeds and flags.
 * @returns The mock message.
 *
 * @example
 * ```ts
 * const message = createMockMessage({
 *   components: [
 *     new ActionRowBuilder<ButtonBuilder>().addComponents(
 *       new ButtonBuilder().setCustomId('card/refresh').setLabel('Refresh').setStyle(ButtonStyle.Primary),
 *     ),
 *   ],
 *   embeds: [{ title: 'Card' }],
 * })
 * const interaction = createMockInteraction(ButtonInteraction, { customId: 'card/refresh', message })
 *
 * await message.delete()
 * message.deleted // true
 * ```
 */
export function createMockMessage(overrides: MockMessageOverrides = {}): DeepMocked<Message> & { deleted: boolean } {
  const instance = Object.create(Message.prototype) as Record<string, unknown>
  const stubs = new Map<string, Mock>()

  instance.deleted = false

  // Constructor-assigned — set as prototype-based stubs; a user rather than a bot, as dispatch handles only those
  instance.author = mockUser()

  // Getters on the prototype — the proxy sees them as functions and returns
  // a mock fn, which is wrong. Pre-initialize as own properties to shadow
  // the prototype getters.
  Object.defineProperty(instance, 'member', {
    value: stubDeep(Object.create(GuildMember.prototype)),
    writable: true,
  })
  const channel = stubDeep(Object.assign(Object.create(TextChannel.prototype), { id: nextSnowflake() })) as { id: string }
  const guild = (overrides.guild === undefined ? createMockGuildForMessage() : overrides.guild) as { id: string } | null
  Object.defineProperty(instance, 'channel', { value: channel, writable: true })
  Object.defineProperty(instance, 'guild', { value: guild, writable: true })
  // In a server's text channel, the ids matching the objects; with no guild, a DM
  instance.channelId = channel.id
  instance.guildId = guild?.id ?? null
  Object.defineProperty(instance, 'thread', {
    value: stubDeep(Object.create(ThreadChannel.prototype)),
    writable: true,
  })

  // MessageMentions — constructor-assigned, has methods like .has(), .members
  instance.mentions = stubDeep(Object.create(MessageMentions.prototype))

  // Data a message always has, real rather than stubbed, so code reading it sees an empty message
  instance.flags = new MessageFlagsBitField(overrides.flags)
  instance.components = (overrides.components ?? []).map(asHeld)
  instance.embeds = (overrides.embeds ?? []).map(asHeld)
  instance.attachments = new Collection()
  instance.id = overrides.id ?? nextSnowflake()
  if (overrides.content !== undefined) instance.content = overrides.content

  const alreadyDeleted = () => new Error('This message has already been deleted.')

  stubs.set(
    'delete',
    createMockFn(async () => {
      if (instance.deleted) throw alreadyDeleted()
      instance.deleted = true
    }),
  )
  stubs.set(
    'edit',
    createMockFn(async () => {
      if (instance.deleted) throw alreadyDeleted()
      return createMockMessage()
    }),
  )
  stubs.set(
    'reply',
    createMockFn(async () => {
      if (instance.deleted) throw alreadyDeleted()
      return createMockMessage()
    }),
  )
  stubs.set(
    'react',
    createMockFn(async () => {
      if (instance.deleted) throw alreadyDeleted()
    }),
  )
  stubs.set(
    'pin',
    createMockFn(async () => {
      if (instance.deleted) throw alreadyDeleted()
    }),
  )
  stubs.set(
    'unpin',
    createMockFn(async () => {
      if (instance.deleted) throw alreadyDeleted()
    }),
  )

  return stubDeep(instance, stubs) as DeepMocked<Message> & { deleted: boolean }
}

// ---------------------------------------------------------------------------
// createChatInputOptions — typed options resolver for ChatInputCommandInteraction
// ---------------------------------------------------------------------------

export interface ChatInputOptions {
  subcommandGroup?: string | null
  subcommand?: string | null
  /** The option the user is currently typing, for autocomplete interactions. */
  focused?: string | null
  [name: string]: string | number | boolean | { id: string } | null | undefined
}

/** The option type Discord would have sent for a given JavaScript value. */
function optionTypeOf(value: unknown): ApplicationCommandOptionType {
  if (typeof value === 'boolean') return ApplicationCommandOptionType.Boolean
  if (typeof value === 'number') return ApplicationCommandOptionType.Number
  if (value instanceof User) return ApplicationCommandOptionType.User
  if (value instanceof GuildMember) return ApplicationCommandOptionType.User
  if (value instanceof Role) return ApplicationCommandOptionType.Role
  if (value instanceof BaseChannel) return ApplicationCommandOptionType.Channel
  if (value instanceof Attachment) return ApplicationCommandOptionType.Attachment
  if (typeof value === 'object' && value !== null) return ApplicationCommandOptionType.Mentionable
  return ApplicationCommandOptionType.String
}

/**
 * Shapes one supplied option the way the gateway sends it.
 *
 * An entity option arrives as a snowflake in `value` *and* as the resolved object on
 * its own field, and code that reads only one of the two is exactly what this lets a
 * test catch — so both are set.
 */
function toOptionData(name: string, value: ChatInputOptions[string]): CommandInteractionOption {
  const type = optionTypeOf(value)
  const isEntity = typeof value === 'object' && value !== null

  const option: Record<string, unknown> = { name, type, value: isEntity ? value.id : value }

  if (value instanceof User) option.user = value
  else if (value instanceof GuildMember) option.member = value
  else if (value instanceof Role) option.role = value
  else if (value instanceof BaseChannel) option.channel = value
  else if (value instanceof Attachment) option.attachment = value
  else if (isEntity) option.user = value

  return option as unknown as CommandInteractionOption
}

/**
 * Nests the supplied options under the subcommand path they were invoked through,
 * matching the shape Discord sends rather than a flat list.
 */
function buildOptionData(
  subcommandGroup: string | null,
  subcommand: string | null,
  values: Record<string, ChatInputOptions[string]>,
): CommandInteractionOption[] {
  const leaves = Object.entries(values).map(([name, value]) => toOptionData(name, value))

  if (subcommand === null) return leaves

  const sub = { name: subcommand, type: ApplicationCommandOptionType.Subcommand, options: leaves }
  if (subcommandGroup === null) return [sub as unknown as CommandInteractionOption]

  return [
    {
      name: subcommandGroup,
      type: ApplicationCommandOptionType.SubcommandGroup,
      options: [sub],
    } as unknown as CommandInteractionOption,
  ]
}

/**
 * Builds a typed options resolver from a plain record, found by name like the real
 * `CommandInteractionOptionResolver`. Every method is a mock function, and methods not listed
 * (such as `getAttachment`) are stubbed automatically.
 *
 * @typeParam Cached - Defaults to `any` to match `createMockInteraction(ChatInputCommandInteraction)`;
 *   pass it explicitly when the interaction under test is cache-pinned.
 *
 * @example
 * ```ts
 * const interaction = createMockInteraction(ChatInputCommandInteraction)
 * interaction.options = createChatInputOptions({
 *   subcommandGroup: 'daily',
 *   subcommand: 'notes',
 *   uid: 12345678,
 * })
 * interaction.options.getSubcommand()  // 'notes'
 * interaction.options.getNumber('uid') // 12345678
 * ```
 */
export function createChatInputOptions<Cached extends CacheType = any>(
  opts: ChatInputOptions = {},
): DeepMocked<CommandInteractionOptionResolver<Cached>> {
  const { subcommandGroup = null, subcommand = null, focused = null, ...values } = opts

  function resolveOrThrow<U>(name: string, value: U | null, required?: boolean): U | null {
    if (value === null) {
      if (required === true) throw new Error(`Option "${name}" is required but was not provided.`)
      return null
    }
    return value
  }

  function resolveSubEntry(field: string | null, label: string, required?: boolean): string | null {
    if (field === null) {
      if (required === true) throw new Error(`No ${label} found.`)
      return null
    }
    return field
  }

  const isObjectOption = (v: unknown): v is { id: string } => typeof v === 'object' && v !== null && 'id' in v

  // Use a real prototype instance so unlisted methods (e.g. getAttachment)
  // are found on the prototype chain and auto-stubbed as a mock fn
  const base = Object.create(CommandInteractionOptionResolver.prototype)

  base.getSubcommandGroup = createMockFn((required?: boolean) =>
    resolveSubEntry(subcommandGroup, 'subcommand group', required),
  )
  base.getSubcommand = createMockFn<(required?: boolean) => string | null>((required?: boolean) =>
    resolveSubEntry(subcommand, 'subcommand', required),
  )
  base.getString = createMockFn<(name: string, required?: boolean) => string | null>(
    (name: string, required?: boolean) =>
      resolveOrThrow(name, typeof values[name] === 'string' ? (values[name] as string) : null, required),
  )
  base.getNumber = createMockFn<(name: string, required?: boolean) => number | null>(
    (name: string, required?: boolean) =>
      resolveOrThrow(name, typeof values[name] === 'number' ? (values[name] as number) : null, required),
  )
  base.getInteger = createMockFn<(name: string, required?: boolean) => number | null>(
    (name: string, required?: boolean) =>
      resolveOrThrow(name, typeof values[name] === 'number' ? (values[name] as number) : null, required),
  )
  base.getBoolean = createMockFn<(name: string, required?: boolean) => boolean | null>(
    (name: string, required?: boolean) =>
      resolveOrThrow(name, typeof values[name] === 'boolean' ? (values[name] as boolean) : null, required),
  )

  const getObjectOption = (name: string, required?: boolean) =>
    resolveOrThrow(name, isObjectOption(values[name]) ? (values[name] as { id: string }) : null, required)

  base.getUser = createMockFn<(name: string, required?: boolean) => { id: string } | null>(getObjectOption)
  base.getRole = createMockFn<(name: string, required?: boolean) => { id: string } | null>(getObjectOption)
  base.getChannel = createMockFn<(name: string, required?: boolean) => { id: string } | null>(getObjectOption)
  base.getMember = createMockFn<(name: string, required?: boolean) => { id: string } | null>(getObjectOption)
  base.getMentionable = createMockFn<(name: string, required?: boolean) => { id: string } | null>(getObjectOption)

  base.getFocused = createMockFn((getFull?: boolean) => {
    if (focused === null) throw new Error('No focused option found.')
    const option = toOptionData(focused, values[focused] ?? null)
    return getFull === true ? { ...option, focused: true } : option.value
  })

  // `data` is what the framework reads to build a handler's params, and it is the one
  // part of the resolver that is not a method — so it has to be materialised here
  // rather than auto-stubbed, or every params assertion would see an empty record.
  base.data = buildOptionData(subcommandGroup, subcommand, values)

  return stubDeep(base) as unknown as DeepMocked<CommandInteractionOptionResolver<Cached>>
}
