import 'reflect-metadata'
import { type PipeInterface } from '@src/interface/index.js'
import { type InferSchemaOutput, type PIPED_BRAND, type StandardSchemaV1 } from '@src/interface/standard-schema.interface.js'
import { METHOD_PIPES, METHOD_VALIDATION, type PipeEntry, type ValidationMetadata } from '@src/core/input-runner.js'
import { makeInjectable } from '@src/util/injectable.util.js'

type Handler = (interaction: any, params: any, ...rest: any[]) => unknown

/** A handler's second parameter. */
type ParamsOf<M extends Handler> = Parameters<M>[1]

type PipeClassOf<E> = E extends { provide: infer C } ? C : E
type PipeOutput<E> = PipeClassOf<E> extends new (...args: any[]) => PipeInterface<any, infer O> ? Awaited<O> : never
type LastPipeOutput<E> = E extends readonly [...unknown[], infer Last] ? PipeOutput<Last> : PipeOutput<E>

type PipeEntryOf = (new (...args: any[]) => PipeInterface) | { provide: new (...args: any[]) => PipeInterface; params: Record<string, any> }

/** Pipes for some of a schema's output keys, each one pipe or several applied in order. */
type SchemaPipes<S extends StandardSchemaV1> = { [K in keyof InferSchemaOutput<S>]?: PipeEntryOf | readonly PipeEntryOf[] }

/** What the handler receives: the schema's output, with each piped key replaced by its last pipe's output. */
export type ValidatedInput<S extends StandardSchemaV1, Pipes = Record<never, never>> = Omit<InferSchemaOutput<S>, keyof Pipes> & {
  [K in keyof Pipes]: LastPipeOutput<Pipes[K]>
}

type IsPiped<T> = typeof PIPED_BRAND extends keyof T ? true : false

/** The handler's params, with the keys marked `Piped` left to their pipes. */
type Unpiped<P> = { [K in keyof P]: IsPiped<P[K]> extends true ? unknown : P[K] }

/** Allows the descriptor when the validated input fits the handler's params; otherwise names the problem. */
type AcceptsInput<P, Input> = [Input] extends [Unpiped<P>]
  ? unknown
  : { 'The handler params do not match the validated input; mark keys a separate @UsePipe produces Piped<T>': Input }

/**
 * Validates a handler's input with a Standard Schema before it runs, so it receives typed, valid
 * values or does not run at all. Any library implementing the Standard Schema interface works: zod,
 * valibot, arktype and others.
 *
 * The input is one object: a chat command's options, or a component's customId params and a modal's
 * fields. The handler receives the schema's output, so its defaults and coercions apply. Invalid input
 * throws a `ValidationError` listing each issue, which is answered privately.
 *
 * Validation runs after guards and inside interceptors, then pipes run on single values: those given
 * here first, then `@UsePipe`'s, in order. The handler's second parameter is checked against the
 * result.
 *
 * @param schema - A Standard Schema for the whole input object.
 * @param options - `pipes` maps an output key to a pipe, or to several applied in order.
 *
 * @example
 * ```ts
 * @Command('remind', CommandType.SLASH)
 * @Validate(z.object({ minutes: z.number().int().min(1).max(1440) }))
 * async remind(interaction: ChatInputCommandInteraction, { minutes }: { minutes: number }) {}
 *
 * @Command('profile/{uid}', CommandType.BUTTON)
 * @Validate(z.object({ uid: z.string().regex(/^\d{9,10}$/) }), { pipes: { uid: AccountPipe } })
 * async profile(interaction: ButtonInteraction, { uid }: { uid: Account }) {}
 * ```
 */
export function Validate<S extends StandardSchemaV1, const Pipes extends SchemaPipes<S> = Record<never, never>>(
  schema: S,
  options: { pipes?: Pipes } = {},
) {
  if (typeof schema?.['~standard']?.validate !== 'function') {
    throw new Error('@Validate takes a Standard Schema, such as a zod, valibot or arktype schema.')
  }

  return function <M extends Handler>(
    target: object,
    propertyKey: string,
    _descriptor: TypedPropertyDescriptor<M> & AcceptsInput<ParamsOf<M>, ValidatedInput<S, Pipes>>,
  ): void {
    const metadata: ValidationMetadata = { schema, pipes: (options.pipes ?? {}) as ValidationMetadata['pipes'] }
    Reflect.defineMetadata(METHOD_VALIDATION, metadata, target, propertyKey)
  }
}

/** Allows the descriptor when the handler's params take the pipe's output at `key`. */
type AcceptsPiped<P, K extends string, Out> = K extends keyof P
  ? [Out] extends [P[K]]
    ? unknown
    : Record<`The pipe's output does not fit the handler param "${K}"`, Out>
  : Record<`The handler params have no "${K}"`, P>

/**
 * Runs pipes on one value of a handler's input, after `@Validate` and its own pipes, to turn it into
 * what the handler works with. With several pipes, each receives the previous one's result. Works
 * without `@Validate` too.
 *
 * With `@Validate`, mark the handler param `Piped<T>`, or give the pipe to `@Validate` itself.
 *
 * @param key - The input key: a command option, customId param or modal field name.
 * @param pipes - Pipe classes, or `{ provide, params }` to hand `params` to the pipe through
 *   `context.getParams()`.
 *
 * @example
 * ```ts
 * @Command('profile/{uid}', CommandType.BUTTON)
 * @UsePipe('uid', AccountPipe)
 * async profile(interaction: ButtonInteraction, { uid }: { uid: Account }) {}
 * ```
 */
export function UsePipe<K extends string, const Pipes extends readonly [PipeEntryOf, ...PipeEntryOf[]]>(key: K, ...pipes: Pipes) {
  return function <M extends Handler>(
    target: object,
    propertyKey: string,
    _descriptor: TypedPropertyDescriptor<M> & AcceptsPiped<ParamsOf<M>, K, LastPipeOutput<Pipes>>,
  ): void {
    // Decorators apply bottom-up, so a higher @UsePipe's pipes go first, in the order they read.
    const existing = (Reflect.getOwnMetadata(METHOD_PIPES, target, propertyKey) as { key: string; entry: PipeEntry }[]) ?? []
    Reflect.defineMetadata(METHOD_PIPES, [...pipes.map(entry => ({ key, entry: entry as PipeEntry })), ...existing], target, propertyKey)
  }
}

/**
 * Marks a class as a pipe, for use with `@Validate(schema, { pipes })` or {@link UsePipe}. The class
 * implements `PipeInterface`. One instance is shared across calls.
 *
 * @example
 * ```ts
 * @Pipe()
 * export class TrimPipe implements PipeInterface<string, string> {
 *   transform(value: string): string {
 *     return value.trim()
 *   }
 * }
 * ```
 */
export function Pipe() {
  return function (target: new (...args: any[]) => PipeInterface) {
    makeInjectable(target)
  }
}
