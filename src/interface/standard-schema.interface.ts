/**
 * The Standard Schema interface (https://standardschema.dev), version 1: what zod, valibot, arktype and
 * other validation libraries implement, so `@Validate` accepts a schema from any of them.
 *
 * Declared here rather than imported, as the specification intends, so MeoCord depends on no library.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  /** The properties every Standard Schema carries. */
  readonly '~standard': StandardSchemaV1Props<Input, Output>
}

/** What a Standard Schema exposes under `~standard`. */
export interface StandardSchemaV1Props<Input = unknown, Output = Input> {
  /** The version of the specification, which is `1`. */
  readonly version: 1
  /** The library the schema comes from. */
  readonly vendor: string
  /** Validates a value, synchronously or not. */
  readonly validate: (value: unknown) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>
  /** Type information only; never present at runtime. */
  readonly types?: { readonly input: Input; readonly output: Output } | undefined
}

/** The outcome of validation: the output value, or the issues found. */
export type StandardSchemaV1Result<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: readonly StandardSchemaV1Issue[] }

/** One problem a schema found. */
export interface StandardSchemaV1Issue {
  /** What is wrong, written by the schema library. */
  readonly message: string
  /** Where it is, from the root of the value. */
  readonly path?: readonly (PropertyKey | { readonly key: PropertyKey })[] | undefined
}

/** The value a schema produces when validation succeeds. */
export type InferSchemaOutput<S extends StandardSchemaV1> = NonNullable<S['~standard']['types']>['output']

/** Brands a {@link Piped} value's type; never present at runtime. */
export declare const PIPED_BRAND: unique symbol

/**
 * Marks a value of a handler's input that a separate `@UsePipe` produces, so `@Validate` leaves its
 * type to that pipe. Inside the handler it is exactly `T`. Pipes given to `@Validate` itself need no
 * marker.
 *
 * @example
 * ```ts
 * @Validate(schema)
 * @UsePipe('uid', AccountPipe)
 * async profile(interaction: ButtonInteraction, { uid }: { uid: Piped<Account> }) {}
 * ```
 */
export type Piped<T> = T & { readonly [PIPED_BRAND]?: true }
