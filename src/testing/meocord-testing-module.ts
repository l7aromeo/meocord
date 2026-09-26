import 'reflect-metadata'
import { Container, type ServiceIdentifier } from 'inversify'
import { COOLDOWN_POLICY, DEFAULT_COOLDOWN_STORE_TIMEOUT_MS } from '@src/core/cooldown-runner.js'
import {
  BaseInteraction,
  type Client,
  type ClientEvents,
  type Interaction,
  Message,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from 'discord.js'
import { MetadataKey, ReactionHandlerAction } from '@src/enum/index.js'
import { ExecutionContext } from '@src/common/execution-context.js'
import { missingTranslatorError, Translator } from '@src/common/translator.js'
import { injectedTokens, singletonContextError } from '@src/core/guard-runner.js'
import {
  appPresenterOf,
  appStages,
  bindAppPresenter,
  bindGlobalStages,
  prepareHandlerStages,
  type RunOptions,
  runHandler,
} from '@src/core/handler-pipeline.js'
import { setPresenter } from '@src/common/response/presenter.js'
import { handlerInput, routeMismatch, routeParamsFor } from '@src/core/handler-input.js'
import {
  type DispatchObserver,
  type ExceptionFilter,
  type GuardInterface,
  type InterceptorInterface,
  type MessageCommandOptions,
} from '@src/interface/index.js'
import { buildMessageRoutes, messageParamsFor } from '@src/core/message-routes.js'
import { messageCommandHooks } from '@src/core/message-params.js'
import { appObservers, assertObservers, bindObservers } from '@src/core/observer-runner.js'
import { makeInjectable } from '@src/util/injectable.util.js'
import { HandlerRegistry } from '@src/core/handler-registry.js'
import { ShardContext } from '@src/core/shard-context.js'
import { isAppClassToken, type LifecycleUnit } from '@src/core/lifecycle-order.js'
import { type LifecycleEntry, runReadyHooks, runShutdownHooks } from '@src/core/lifecycle-hooks.js'
import { createMockClient } from './mock-interaction.js'
import { Dispatcher, type DispatchRecorder } from '@src/core/dispatcher.js'
import { createFallback, isUserOutcome } from '@src/core/fallback.js'
import { Logger } from '@src/common/logger.js'
import {
  assertProvided,
  assertTypedParameters,
  reachableClasses,
  bindProvider,
  isClassProvider,
  providerMap,
  type ProviderMap,
  resolutionOrder,
  resolveProviders,
  tokenDependencies,
  tokenName,
} from '@src/core/providers.js'
import { type Provider, type ProviderToken } from '@src/interface/provider.interface.js'
import { getEventHandlers } from '@src/decorator/event.decorator.js'

export interface TestingModuleOptions {
  controllers?: (new (...args: any[]) => any)[]
  providers?: Provider[]

  /**
   * The `@MeoCord` application class, whose global `guards`, `interceptors` and `filters` `invoke`
   * applies with each handler's own, whose `i18n` translator is injected as `Translator`, and whose
   * `presenter` styles what `respond()` shows. Its controllers and services are not registered; list
   * them here. Its `observers` are told about each call.
   */
  app?: new (...args: any[]) => unknown

  /**
   * `@Observer` classes told about each call `invoke` and `emit` make, after the `app`'s own. The
   * module waits for them before a call resolves, so a test sees what they were told.
   */
  observers?: (new (...args: any[]) => DispatchObserver)[]
}

/** The names of a class's instance methods. */
export type HandlerName<C extends new (...args: any[]) => unknown> = {
  [K in keyof InstanceType<C>]: InstanceType<C>[K] extends (...args: any[]) => unknown ? K : never
}[keyof InstanceType<C>] &
  string

/**
 * The handler's arguments, or the interaction alone, whose params `invoke` then builds as dispatch does.
 * A handler that declares no parameters still takes what dispatch passes, such as the interaction.
 */
type HandlerArgs<C extends new (...args: any[]) => unknown, M extends HandlerName<C>> =
  InstanceType<C>[M] extends (...args: infer A) => unknown
    ? A extends []
      ? [] | [first: unknown, params?: unknown]
      : A extends [infer First, unknown, ...unknown[]]
        ? A | [First]
        : A
    : never

/** How a call made with `TestingModule.invoke` ended. */
export interface InvocationResult {
  /** Whether the handler ran; `false` when a guard denied the call or an interceptor skipped it. */
  ran: boolean

  /** The error a filter handled, when the call failed and a `@UseFilter` or global filter caught it. */
  error?: unknown
}

/** How `TestingModule.init` prepares the module. */
export interface TestingModuleInitOptions {
  /**
   * Also run every `onReady` hook, once, in dependency order, as the bot does once it is online.
   * `true` hands each hook a mock client from `createMockClient` and `{ primary: true }`; an object
   * sets either.
   */
  ready?: boolean | { client?: Client<true>; primary?: boolean }
}

/** One handler `TestingModule.dispatch` ran, and how its call ended. */
export interface DispatchedHandler {
  /** The handler's controller. */
  controller: new (...args: any[]) => unknown
  /** The handler method's name. */
  method: string
  /** Whether the handler itself ran; `false` when a guard denied it or its input was refused. */
  ran: boolean
  /** The error its call ended with, handled by a filter or answered by the fallback. */
  error?: unknown
}

/** What `TestingModule.dispatch` did with an interaction, a message or a reaction. */
export interface DispatchedCall extends InvocationResult {
  /** Whether any handler ran. */
  ran: boolean
  /**
   * The first error a handler's call ended with, or an error the built-in fallback answered as the
   * user's own outcome, such as a `CommandNotFoundError`.
   */
  error?: unknown
  /** Every handler dispatch reached, in the order it ran them; empty when none takes the input. */
  handlers: DispatchedHandler[]
}

/** How an event sent with `TestingModule.emit` was handled. */
export interface EmitResult {
  /** How many `@On` and `@Once` handlers ran; a handler a guard denied is not counted. */
  ran: number
}

/**
 * Resolved test module. Retrieve instances via `.get()`.
 */
export class TestingModule {
  constructor(
    private readonly container: Container,
    private readonly controllers: readonly (new (...args: any[]) => unknown)[] = [],
    private readonly eventClasses: readonly (new (...args: any[]) => unknown)[] = [],
    private readonly providers: ProviderMap = new Map(),
    private readonly order: readonly unknown[] = [],
    private readonly messageOptions: MessageCommandOptions = {},
    private readonly lifecycle: readonly LifecycleUnit[] = [],
    /** The lifecycle units the container has constructed, which `close()` shuts down. */
    private readonly constructed: ReadonlySet<unknown> = new Set(),
    /** The `app`'s `warnUnanswered`, which dispatch follows as the bot does. */
    private readonly appWarnUnanswered?: boolean,
  ) {}

  private resolving?: Promise<void>
  private readying?: Promise<void>
  private closing?: Promise<void>

  /**
   * Resolves the module's `useFactory` providers, awaiting those that return a promise, in dependency
   * order. `invoke` and `emit` call it first; call it yourself before `get` resolves anything that
   * depends on an asynchronous factory. Calling it again does nothing more.
   *
   * With `{ ready: true }`, it then runs every `onReady` hook once, as the bot does once it is online:
   * one at a time, each class after the classes and providers it injects, the observers' last. Every
   * hook runs even when one fails. Pair it with {@link close}, which runs the `onShutdown` hooks.
   *
   * @param options - `ready` to also run the `onReady` hooks, with the client and `primary` to pass them.
   * @returns The module, once every factory has made its value and every `onReady` hook asked for has
   *   run. Rejects with the error of a factory or a hook that failed, or an `AggregateError` of the
   *   hooks when several did.
   *
   * @example
   * ```ts
   * const module = await MeoCordTestingModule.create({
   *   controllers: [NotesController],
   *   providers: [{ provide: DATABASE, useFactory: async () => createTestDatabase() }],
   * })
   *   .compile()
   *   .init({ ready: true })
   *
   * expect(module.get(NotesStore).loaded).toBe(true)
   * await module.close()
   * ```
   */
  async init(options: TestingModuleInitOptions = {}): Promise<this> {
    this.resolving ??= resolveProviders(this.container, this.providers, this.order)
    await this.resolving
    if (options.ready) {
      const { client = createMockClient() as unknown as Client<true>, primary = true } = options.ready === true ? {} : options.ready
      this.readying ??= this.runReady(client, primary)
      await this.readying
    }
    return this
  }

  /**
   * Runs the `onShutdown` hooks of every class and provided value the module has constructed, once, as
   * the bot does when it stops: one at a time, in reverse, so a class stops before the classes and
   * providers it uses. A factory's value, such as a connection pool `init()` made, is closed after
   * everything that injects it, whether or not `init({ ready: true })` ran. Nothing is constructed
   * just to be shut down. Every hook runs even when one fails. Calling it again does nothing more.
   *
   * @returns Once every hook has run. Rejects with the error of a hook that failed, or an
   *   `AggregateError` naming each when several did.
   *
   * @example
   * ```ts
   * const module = await MeoCordTestingModule.create({ providers: [{ provide: POOL, useFactory: createPool }] })
   *   .compile()
   *   .init()
   *
   * await module.close()
   *
   * expect(module.get(POOL).ended).toBe(true)
   * ```
   */
  async close(): Promise<void> {
    this.closing ??= (async () => {
      // A close during init waits for the hooks it started, so it shuts down whatever they constructed
      await this.readying?.catch(() => undefined)
      const entries: LifecycleEntry[] = this.lifecycle
        .filter(unit => this.constructed.has(unit.token))
        // Already made, so this returns the instance; a provided value may be anything, null included
        .map(unit => ({ name: unit.name, instance: (this.container.get(unit.token as ServiceIdentifier) as LifecycleEntry['instance'] | null) ?? {} }))
      const failures: { name: string; error: unknown }[] = []
      await runShutdownHooks(entries, (name, error) => failures.push({ name, error }))
      throwFailures('onShutdown', failures)
    })()
    await this.closing
  }

  private async runReady(client: Client<true>, primary: boolean): Promise<void> {
    const failures: { name: string; error: unknown }[] = []
    const failed = (unit: LifecycleUnit, error: unknown) => failures.push({ name: unit.name, error })
    // No warning for a hook whose dependency failed: the test sees the dependency's own error
    // What close() shuts down is what was constructed, so the entries the runner records are not kept
    await runReadyHooks(this.container, this.lifecycle, client, { primary }, [], { resolveFailed: failed, hookFailed: failed })
    throwFailures('onReady', failures)
  }

  /** The `@Once` handlers that have already handled their event, as a client forgets its once listeners. */
  private readonly firedOnce = new Set<string>()

  /**
   * Resolves an instance from the module, as the bot would inject it.
   *
   * @param token - A controller, a provided token, or another bound class.
   * @returns The instance, with its dependencies and overrides applied.
   * @throws When the instance depends on a factory that returns a promise and `init()` has not run.
   */
  get<T>(token: ProviderToken<T> | ServiceIdentifier<T>): T {
    try {
      return this.container.get<T>(token as ServiceIdentifier<T>)
    } catch (error) {
      if (!/asynchronous/i.test(String((error as Error)?.message))) throw error
      throw new Error(
        `${tokenName(token)} depends on a factory that returns a promise: await module.init() before get().`,
        { cause: error },
      )
    }
  }

  /**
   * Runs a handler through the same pipeline dispatch runs: `@Defer`'s acknowledgement, the global
   * guards of the module's `app`, then the handler's own, in order and once each; then the
   * interceptors, the app's first, around validation, pipes, cooldowns and the handler; all inside the
   * handler's exception filters. Guards resolve
   * from this module, so `overrideGuard` stubs apply and guards that inject `ExecutionContext` receive
   * it. `overrideInterceptor` and `overrideFilter` stubs apply the same way.
   *
   * Calling the controller method directly runs its guards but no interceptors, validation or
   * filters; `invoke` is the way to test everything dispatch runs around a handler.
   *
   * `invoke` tests one handler you name, and an error no filter handles rejects the call. To test what
   * the bot does with an input, which handler it reaches and what the user is sent, use
   * {@link dispatch}.
   *
   * @param controller - A controller passed to `MeoCordTestingModule.create`.
   * @param methodName - The handler method's name.
   * @param args - The arguments dispatch would pass: the interaction, message or reaction, then the
   *   handler's params. With an interaction alone, the params are built as dispatch builds them: a
   *   command's or an autocomplete's options, or the handler's customId params with a modal's fields or
   *   a select menu's choices.
   *   An interaction's customId or command name must be one dispatch could route to the handler; a mock
   *   built without one is not checked. With a message alone, a patterned `@MessageHandler` gets the
   *   params its pattern captures from the content, after the prefix of the module's `app`, with typed
   *   params resolved as dispatch resolves them, from the message's guild caches first; a message
   *   without content gets `{}`. A word that is not a value of its type, and a prefixed message that names
   *   the command but leaves out a param, go through the handler's filters as a `MessageUsageError`, as
   *   dispatch answers them.
   * @returns Whether the handler ran, and the error a filter handled, if any. Rejects with an error no
   *   filter handles, or with the error a filter throws: the built-in fallback, which answers such
   *   errors in the bot, does not run here. Rejects before running anything with an interaction or a
   *   message the handler's route does not match, naming both.
   *
   * @example
   * ```ts
   * const module = MeoCordTestingModule.create({ controllers: [ModerationController] }).compile()
   * const interaction = createMockInteraction(ChatInputCommandInteraction)
   *
   * const { ran } = await module.invoke(ModerationController, 'ban', interaction)
   *
   * expect(ran).toBe(false)
   * expect(interaction.reply).not.toHaveBeenCalled()
   * ```
   */
  async invoke<C extends new (...args: any[]) => unknown, M extends HandlerName<C>>(
    controller: C,
    methodName: M,
    ...args: HandlerArgs<C, M>
  ): Promise<InvocationResult> {
    await this.init()
    if (!this.controllers.includes(controller)) {
      throw new Error(`${controller.name} is not a controller of this testing module. Add it to \`controllers\`.`)
    }

    const instance = this.container.get(controller) as Record<string, (...args: unknown[]) => unknown>
    if (typeof instance[methodName] !== 'function') throw new Error(`${controller.name}.${methodName} is not a method.`)
    const [first] = args as unknown[]
    const mismatch = first instanceof BaseInteraction ? routeMismatch(controller, methodName, first as Interaction) : undefined
    if (mismatch) throw new Error(mismatch)
    let hooks: Pick<RunOptions, 'parseArgs' | 'fetchArgs'> = {}
    let callArgs =
      args.length === 1 && first instanceof BaseInteraction
        ? [first, handlerInput(first as Interaction, routeParamsFor(controller.prototype as object, methodName, first as Interaction)).params]
        : (args as unknown[])
    if (args.length === 1 && first instanceof Message) {
      const input = await messageParamsFor(controller, methodName, first, this.messageOptions, this.controllers)
      if (input && 'mismatch' in input) throw new Error(input.mismatch)
      if (input) callArgs = [first, input.params]
      if (input && 'route' in input && input.route) {
        const { route, params, start = '', given } = input
        hooks = messageCommandHooks(route, params, first, start, given, this.messageOptions.types)
      }
    }
    const presenter = appPresenterOf(this.container)
    const client = first instanceof BaseInteraction ? first.client : undefined
    if (presenter && client) setPresenter(client, presenter)
    const { ran, error } = await runHandler(this.container, instance, methodName, callArgs, { awaitObservers: true, ...hooks })
    return error === undefined ? { ran } : { ran, error }
  }

  private dispatcher?: Dispatcher

  /** The dispatcher the bot would build from this module's controllers and `app`. */
  private dispatcherOf(): Dispatcher {
    if (this.dispatcher) return this.dispatcher
    const logger = new Logger('TestingModule')
    const warnUnanswered = this.appWarnUnanswered ?? process.env.NODE_ENV === 'development'
    this.dispatcher = new Dispatcher({
      container: this.container,
      controllerClasses: this.controllers,
      messageOptions: this.messageOptions,
      logger,
      fallback: createFallback(logger, () => this.messageOptions.deleteUsageRepliesAfter),
      // A mock's client is the one bot every mock client is, so a mention of it starts a command
      botUserId: event => {
        const id = event.client?.user?.id
        return typeof id === 'string' ? id : undefined
      },
      warnUnanswered,
      awaitObservers: true,
    })
    return this.dispatcher
  }

  /**
   * Sends an interaction, a message or a reaction through the bot's own dispatch: routed over the module's
   * controllers and its `app`'s message options exactly as the bot routes it, then run through the full
   * pipeline of each handler it reaches. What the user is sent is sent to the mock, as the bot sends it:
   * the handler's answer, a usage reply, or the built-in fallback's answer to an error no filter handles.
   * Inputs the bot skips, such as a message from a bot, reach nothing. The module waits for its observers.
   *
   * `dispatch` tests what the bot does with an input: which handler it reaches, with what params, and what
   * the user sees. To test one handler you name, whatever would route to it, use {@link invoke}.
   *
   * @param input - An interaction or a message; or a reaction, with the user who reacted and whether they
   *   added it, `ReactionHandlerAction.ADD` unless given.
   * @returns Every handler reached, in the order it ran, whether any ran, and the first error a call ended
   *   with. An error the fallback answers as the user's own outcome resolves: a usage reply, an unknown
   *   command, or a guard's, a cooldown's, a validation's or a `UserError`'s refusal, as the fallback
   *   answers each for an interaction or a message. Any other error no filter handles rejects the call once
   *   the fallback has answered and every handler has run: with that error, or an `AggregateError` when
   *   several were left unhandled.
   *
   * @example
   * ```ts
   * const module = MeoCordTestingModule.create({ app: App, controllers: [CardController] }).compile()
   * const interaction = createMockInteraction(ButtonInteraction, { customId: 'card/summary/7' })
   *
   * const { handlers } = await module.dispatch(interaction)
   *
   * expect(handlers).toEqual([{ controller: CardController, method: 'summary', ran: true }])
   * ```
   */
  dispatch(input: Interaction | Message): Promise<DispatchedCall>
  dispatch(
    reaction: MessageReaction | PartialMessageReaction,
    options: { user: User | PartialUser; action?: ReactionHandlerAction },
  ): Promise<DispatchedCall>
  async dispatch(
    input: Interaction | Message | MessageReaction | PartialMessageReaction,
    options?: { user: User | PartialUser; action?: ReactionHandlerAction },
  ): Promise<DispatchedCall> {
    await this.init()
    const dispatcher = this.dispatcherOf()
    const handlers: DispatchedHandler[] = []
    const unhandled: unknown[] = []
    const record: DispatchRecorder = {
      settled: (controller, method, { ran, error }) => handlers.push({ controller, method, ran, ...(error !== undefined && { error }) }),
      unhandled: error => unhandled.push(error),
    }

    if (options) {
      await dispatcher.reaction(input as MessageReaction, { user: options.user, action: options.action ?? ReactionHandlerAction.ADD }, record)
    } else if (input instanceof BaseInteraction) {
      const presenter = appPresenterOf(this.container)
      if (presenter) setPresenter(input.client, presenter)
      await dispatcher.interaction(input as Interaction, record)
    } else if (input instanceof Message) {
      await dispatcher.message(input, record)
    } else {
      throw new TypeError('dispatch takes an interaction, a message, or a reaction with { user }.')
    }

    // What the fallback answers as the user's own outcome, such as a usage reply or a refusal, is an outcome to assert on
    const failures = unhandled.filter(error => !isUserOutcome(error, options ? undefined : input))
    if (failures.length === 1) throw failures[0]
    if (failures.length > 1) throw new AggregateError(failures, `${failures.length} errors were left to the fallback.`)
    const error = handlers.find(handler => handler.error !== undefined)?.error ?? unhandled[0]
    return { ran: handlers.some(handler => handler.ran), handlers, ...(error !== undefined && { error }) }
  }

  /**
   * Emits a client event to the module's `@On` and `@Once` handlers, through the same pipeline the app
   * runs them in: the global guards of the module's `app`, then each handler's own. Handlers on the
   * module's controllers, class providers and their dependencies all receive it. A `@Once` handler
   * handles only the first event, as it would on a client.
   *
   * @param event - The client event, such as `'guildMemberAdd'`.
   * @param args - The event's arguments, typed from discord.js's `ClientEvents`.
   * @returns How many handlers ran. Rejects once every handler has settled if any threw: with that
   *   error when one handler failed, or an `AggregateError` of them when several did.
   *
   * @example
   * ```ts
   * const module = MeoCordTestingModule.create({ controllers: [WelcomeController] }).compile()
   * const member = createMock<GuildMember>()
   *
   * const { ran } = await module.emit('guildMemberAdd', member)
   *
   * expect(ran).toBe(1)
   * ```
   */
  async emit<E extends keyof ClientEvents>(event: E, ...args: ClientEvents[E]): Promise<EmitResult> {
    await this.init()
    const calls: Promise<boolean>[] = []
    for (const cls of this.eventClasses) {
      for (const handler of getEventHandlers(cls.prototype)) {
        if (handler.event !== event) continue
        if (handler.once) {
          const key = `${cls.name}.${handler.method}:${event}`
          if (this.firedOnce.has(key)) continue
          this.firedOnce.add(key)
        }
        // Resolved inside the call, so a class that cannot be resolved fails as its handler would
        const run = async () => {
          const instance = this.container.get(cls) as Record<string, (...args: unknown[]) => unknown>
          const { ran } = await runHandler(this.container, instance, handler.method, args, { type: 'event', awaitObservers: true })
          return ran
        }
        calls.push(run())
      }
    }

    const results = await Promise.allSettled(calls)
    const errors = results.flatMap(result => (result.status === 'rejected' ? [result.reason as unknown] : []))
    if (errors.length === 1) throw errors[0]
    if (errors.length > 1) throw new AggregateError(errors, `${errors.length} handlers of "${event}" threw.`)
    return { ran: results.filter(result => result.status === 'fulfilled' && result.value).length }
  }
}

/** Rejects with the one hook's error, or an `AggregateError` naming each when several failed. */
function throwFailures(hook: 'onReady' | 'onShutdown', failures: readonly { name: string; error: unknown }[]): void {
  if (failures.length === 1) throw failures[0].error
  if (failures.length > 1) {
    throw new AggregateError(
      failures.map(({ error }) => error),
      `${failures.length} ${hook} hooks threw: ${failures.map(({ name }) => name).join(', ')}.`,
    )
  }
}

/** The app's `messages` options, when the testing module is given an app. */
function messagesOf(app: object | undefined): MessageCommandOptions | undefined {
  return app && (Reflect.getMetadata(MetadataKey.AppOptions, app) as { messages?: MessageCommandOptions } | undefined)?.messages
}

/**
 * Builder returned by `MeoCordTestingModule.create()`.
 * Call `.compile()` to get the resolved `TestingModule`.
 */
export class TestingModuleBuilder {
  private readonly overrides = new Map<unknown, Provider>()
  private readonly guardOverrides = new Map<new (...args: any[]) => GuardInterface, Partial<GuardInterface>>()
  private readonly filterOverrides = new Map<new (...args: any[]) => ExceptionFilter<any>, Partial<ExceptionFilter<any>>>()
  private readonly interceptorOverrides = new Map<
    new (...args: any[]) => InterceptorInterface,
    Partial<InterceptorInterface>
  >()

  constructor(private readonly options: TestingModuleOptions) {}

  /**
   * Replaces a provider with a test double.
   *
   * The double needs only the members the test uses; misspelled member names are still rejected.
   *
   * @param token - The provider to replace.
   * @example
   * ```ts
   * builder.overrideProvider(UserService).useValue({ findUser: vi.fn() })
   * ```
   */
  overrideProvider<T>(token: ProviderToken<T> | ServiceIdentifier<T>): { useValue: (value: Partial<T>) => TestingModuleBuilder } {
    return {
      useValue: (value: Partial<T>) => {
        this.overrides.set(token, { provide: token, useValue: value })
        return this
      },
    }
  }

  /**
   * Replaces a guard with a stub wherever it applies, globally or on a controller or handler.
   *
   * @param guard - The guard class to replace.
   * @example
   * ```ts
   * builder.overrideGuard(RateLimitGuard).useValue({ canActivate: () => true })
   * ```
   */
  overrideGuard(guard: new (...args: any[]) => GuardInterface): {
    useValue: (stub: Partial<GuardInterface>) => TestingModuleBuilder
  } {
    return {
      useValue: (stub: Partial<GuardInterface>) => {
        this.guardOverrides.set(guard, stub)
        return this
      },
    }
  }

  /**
   * Replaces an interceptor with a stub wherever it applies, globally or on a controller or handler.
   * The stub's `intercept` receives the context and `next`; call `next.handle()` to run the handler.
   *
   * @param interceptor - The interceptor class to replace.
   * @example
   * ```ts
   * builder.overrideInterceptor(TimingInterceptor).useValue({ intercept: (_context, next) => next.handle() })
   * ```
   */
  overrideInterceptor(interceptor: new (...args: any[]) => InterceptorInterface): {
    useValue: (stub: Partial<InterceptorInterface>) => TestingModuleBuilder
  } {
    return {
      useValue: (stub: Partial<InterceptorInterface>) => {
        this.interceptorOverrides.set(interceptor, stub)
        return this
      },
    }
  }

  /**
   * Replaces an exception filter with a stub wherever it applies. The filter's `@Catch` still decides
   * which errors reach the stub.
   *
   * @param filter - The filter class to replace.
   * @example
   * ```ts
   * builder.overrideFilter(RateLimitedFilter).useValue({ catch: vi.fn() })
   * ```
   */
  overrideFilter(filter: new (...args: any[]) => ExceptionFilter<any>): {
    useValue: (stub: Partial<ExceptionFilter<any>>) => TestingModuleBuilder
  } {
    return {
      useValue: (stub: Partial<ExceptionFilter<any>>) => {
        this.filterOverrides.set(filter, stub)
        return this
      },
    }
  }

  /**
   * Binds the controllers, providers and overrides into a module ready to resolve and run handlers.
   *
   * @returns The compiled module.
   */
  compile(): TestingModule {
    const container = new Container()
    if (this.options.app) bindGlobalStages(container, appStages(this.options.app))

    // Bound first, as in the app, so a class that injects it gets this instance
    const appClasses: (new (...args: any[]) => unknown)[] = []
    container.bind(HandlerRegistry).toConstantValue(new HandlerRegistry(appClasses, messagesOf(this.options.app)))
    // A testing module runs as one process, so a cross-shard call runs once, here
    container.bind(ShardContext).toConstantValue(
      new ShardContext(undefined, async (service, method, args) => {
        const cls = appClasses.find(candidate => (typeof service === 'function' ? candidate === service : candidate.name === service))
        const name = typeof service === 'function' ? service.name : service
        if (!cls) throw new Error(`${name} is not a controller or class provider of this testing module.`)
        return (container.get(cls) as Record<string, (...args: unknown[]) => unknown>)[method](...args)
      }),
    )

    // Checked as the app checks its own, then merged with the overrides, which win
    const providers = providerMap(this.options.providers ?? [], "the testing module's providers")
    for (const [token, override] of this.overrides) providers.set(token, override)
    assertTypedParameters(
      reachableClasses(
        [...(this.options.controllers ?? []), ...(this.options.app ? appObservers(this.options.app) : []), ...(this.options.observers ?? [])],
        providers,
      ),
    )

    // Bind guard overrides — prevents inversify from auto-wiring guard dependencies
    for (const [guardClass, stub] of this.guardOverrides) {
      container.bind(guardClass).toConstantValue(stub as GuardInterface)
    }

    for (const [filterClass, stub] of this.filterOverrides) {
      container.bind(filterClass).toConstantValue(stub as ExceptionFilter)
    }

    for (const [interceptorClass, stub] of this.interceptorOverrides) {
      container.bind(interceptorClass).toConstantValue(stub as InterceptorInterface)
    }

    // The app's cooldown policy, so a test of a failing store sees what the bot would do
    const appOptions = this.options.app && (Reflect.getMetadata(MetadataKey.AppOptions, this.options.app) as { cooldownStoreFailure?: 'deny' | 'allow'; cooldownStoreTimeoutMs?: number })
    if (appOptions && !container.isBound(COOLDOWN_POLICY)) {
      container.bind(COOLDOWN_POLICY).toConstantValue({
        failure: appOptions.cooldownStoreFailure ?? 'deny',
        timeoutMs: appOptions.cooldownStoreTimeoutMs ?? DEFAULT_COOLDOWN_STORE_TIMEOUT_MS,
      })
    }

    // The app's translator, unless a provider stands in for it
    const i18n = this.options.app && (Reflect.getMetadata(MetadataKey.AppOptions, this.options.app) as { i18n?: Translator })?.i18n
    if (i18n && !providers.has(Translator)) container.bind(Translator).toConstantValue(i18n)

    // Recursively bind controllers and their dependencies, skipping already-bound tokens
    const bindClass = (cls: new (...args: any[]) => any) => {
      // A provided class is bound by its own provider, wherever in the list that provider comes
      if (container.isBound(cls) || providers.has(cls)) return
      if (injectedTokens(cls).includes(ExecutionContext)) throw singletonContextError(cls)

      makeInjectable(cls)
      container.bind(cls).toSelf().inSingletonScope()

      // By constructor type or @inject token, as the app binds them
      for (const dep of injectedTokens(cls)) {
        if (dep === Translator && !container.isBound(Translator)) throw missingTranslatorError(cls)
        if (isAppClassToken(dep)) bindClass(dep)
      }
    }

    // Before the controllers, so a class token that is provided is not also bound as itself
    for (const provider of providers.values()) bindProvider(container, provider, bindClass)

    for (const ctrl of this.options.controllers ?? []) {
      bindClass(ctrl)
      // Stamp container on controller class so @UseGuard works in tests too
      Reflect.defineMetadata(MetadataKey.Container, container, ctrl)
    }

    // The classes whose @On and @Once handlers emit reaches: class providers bound as themselves, the
    // controllers, and what they inject; factories resolve in the same order
    const order = resolutionOrder(container, providers, [...providers.keys(), ...(this.options.controllers ?? [])])
    appClasses.push(
      ...order.filter((token): token is new (...args: any[]) => unknown => {
        const provider = providers.get(token)
        return isAppClassToken(token) && (!provider || (isClassProvider(provider) && provider.useClass === token))
      }),
    )
    assertProvided(container, providers, appClasses, "the testing module's providers")
    for (const cls of appClasses) Reflect.defineMetadata(MetadataKey.Container, container, cls)
    prepareHandlerStages(container, appClasses)
    const messages = messagesOf(this.options.app)
    // As the app would at startup, refuses a message pattern that cannot be read or two that match the same messages
    buildMessageRoutes(this.options.controllers ?? [], messages)
    if (this.options.app) bindAppPresenter(container, this.options.app)
    const observers = [...(this.options.app ? appObservers(this.options.app) : []), ...(this.options.observers ?? [])]
    assertObservers("the testing module's observers", observers)
    bindObservers(container, observers)
    // The order the app runs lifecycle hooks in: providers, then controllers, then observers, each after what it injects
    const lifecycle: LifecycleUnit[] = resolutionOrder(container, providers, [
      ...providers.keys(),
      ...(this.options.controllers ?? []),
      ...observers,
    ]).map(token => ({ token, name: tokenName(token), dependencies: tokenDependencies(container, providers, token) }))
    // Recorded as the container makes each one, so close() shuts down exactly what exists
    const constructed = new Set<unknown>()
    for (const { token } of lifecycle) {
      container.onActivation(token as ServiceIdentifier, (_context, instance) => {
        constructed.add(token)
        return instance
      })
    }

    const warnUnanswered = this.options.app && (Reflect.getMetadata(MetadataKey.AppOptions, this.options.app) as { warnUnanswered?: boolean })?.warnUnanswered

    return new TestingModule(
      container,
      [...(this.options.controllers ?? [])],
      appClasses,
      providers,
      order,
      messages,
      lifecycle,
      constructed,
      warnUnanswered,
    )
  }
}

/**
 * Entry point for building isolated test modules.
 *
 * @example
 * ```typescript
 * import { MeoCordTestingModule, createMockFn } from 'meocord/testing'
 *
 * const module = MeoCordTestingModule.create({
 *   controllers: [PingController],
 *   providers: [
 *     { provide: PingService, useValue: { handlePing: createMockFn().mockResolvedValue('pong') } },
 *   ],
 * }).compile()
 *
 * const controller = module.get(PingController)
 * ```
 */
export class MeoCordTestingModule {
  static create(options: TestingModuleOptions): TestingModuleBuilder {
    return new TestingModuleBuilder(options)
  }
}
