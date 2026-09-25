// Framework-agnostic mock function, so `meocord/testing` depends on neither jest nor vitest.
// Both detect it through `_isMockFunction` and read `fn.mock.calls` in their assertions.

export interface MockResult<T = unknown> {
  type: 'return' | 'throw'
  value: T
}

export interface MockState<T extends (...args: any[]) => any = (...args: any[]) => any> {
  /** Arguments from each call, in order. */
  readonly calls: Parameters<T>[]
  /** Return / throw result from each call, in order. */
  readonly results: MockResult<ReturnType<T>>[]
  /** The `this` value recorded for each call. */
  readonly instances: any[]
  /** Arguments from the most recent call, or undefined if never called. */
  readonly lastCall?: Parameters<T>
}

export interface MockInstance<T extends (...args: any[]) => any = (...args: any[]) => any> {
  /** Marker both jest and vitest check via `isMockFunction`. Do not remove. */
  readonly _isMockFunction: true
  readonly mock: MockState<T>
  mockReturnValue(value: ReturnType<T>): MockedFunction<T>
  mockReturnValueOnce(value: ReturnType<T>): MockedFunction<T>
  mockResolvedValue(value: Awaited<ReturnType<T>>): MockedFunction<T>
  mockResolvedValueOnce(value: Awaited<ReturnType<T>>): MockedFunction<T>
  mockRejectedValue(value: unknown): MockedFunction<T>
  mockRejectedValueOnce(value: unknown): MockedFunction<T>
  mockImplementation(fn: T): MockedFunction<T>
  mockImplementationOnce(fn: T): MockedFunction<T>
  mockClear(): MockedFunction<T>
  mockReset(): MockedFunction<T>
  mockRestore(): MockedFunction<T>
  getMockName(): string
  mockName(name: string): MockedFunction<T>
}

/**
 * A callable that mirrors the signature of `T` and exposes the mock API
 * (`mockReturnValue`, `mockResolvedValue`, `mockImplementation`, `.mock`, …).
 * Drop-in replacement for `jest.MockedFunction<T>` / vitest `MockedFunction<T>`.
 */
export type MockedFunction<T extends (...args: any[]) => any> = ((...args: Parameters<T>) => ReturnType<T>) &
  MockInstance<T>

/** Alias kept for parity with `jest.Mock` / vitest `Mock`. */
export type Mock<T extends (...args: any[]) => any = (...args: any[]) => any> = MockedFunction<T>

/**
 * Type guard that recognises mocks produced by `createMockFn` as well as
 * native `jest.fn()` / `vi.fn()` mocks — all stamp `_isMockFunction = true`.
 */
export function isMockFunction(fn: unknown): fn is MockInstance {
  return (
    typeof fn === 'function' &&
    '_isMockFunction' in fn &&
    (fn as { _isMockFunction?: unknown })._isMockFunction === true
  )
}

// Every mock createMockFn made, held weakly so the mocks of a finished test can still be collected
const created = new Set<WeakRef<MockInstance>>()
const collected = new FinalizationRegistry<WeakRef<MockInstance>>(ref => created.delete(ref))

/**
 * Clears the calls every mock from `meocord/testing` has recorded, keeping what each was told to
 * return. Vitest's `clearMocks` and jest's `clearAllMocks()` reach only their own `vi.fn()` and
 * `jest.fn()` mocks; this covers `createMockFn` and everything built on it, such as
 * `createMockInteraction` and `createMockClient`.
 *
 * @example
 * ```ts
 * import { clearAllMocks } from 'meocord/testing'
 *
 * afterEach(() => clearAllMocks())
 * ```
 */
export function clearAllMocks(): void {
  for (const ref of created) ref.deref()?.mockClear()
}

/**
 * Clears every mock from `meocord/testing`, as {@link clearAllMocks} does, and puts each back to the
 * implementation it was created with: `mockReturnValue`, `mockResolvedValue` and the rest a test set
 * are undone, and a mock interaction's methods reply, defer and refuse a second reply as before.
 * State a mock keeps outside its methods, such as whether an interaction was replied to, stays.
 *
 * @example
 * ```ts
 * import { resetAllMocks } from 'meocord/testing'
 *
 * // In a Vitest setup file: every test starts from mocks as they were created
 * afterEach(() => resetAllMocks())
 * ```
 */
export function resetAllMocks(): void {
  for (const ref of created) ref.deref()?.mockReset()
}

/**
 * Creates a mock function that works with both jest's and vitest's `expect`.
 *
 * @param impl - The implementation to run until another is set.
 *
 * @example
 * ```ts
 * const fn = createMockFn((x: number) => x + 1)
 * fn(2)                  // 3
 * fn.mockReturnValue(99)
 * fn(2)                  // 99
 * fn.mock.calls          // [[2], [2]]
 * ```
 */
export function createMockFn<T extends (...args: any[]) => any = (...args: any[]) => any>(impl?: T): MockedFunction<T> {
  // One persistent implementation and one queue of single-use ones, as in jest and vitest: the
  // four setters share the slot, so the last call wins, and the `*Once` variants share the queue,
  // so they run in declaration order.
  let currentImpl: ((...args: any[]) => any) | undefined = impl as ((...args: any[]) => any) | undefined
  let onceQueue: ((...args: any[]) => any)[] = []
  let name = 'vi.fn'

  const calls: any[][] = []
  const results: MockResult<any>[] = []
  const instances: any[] = []

  const mockFn = function (this: unknown, ...args: any[]): any {
    calls.push(args)
    instances.push(this)

    let type: 'return' | 'throw' = 'return'
    let value: any
    try {
      if (onceQueue.length > 0) {
        value = onceQueue.shift()!.apply(this, args)
      } else if (currentImpl !== undefined) {
        value = currentImpl.apply(this, args)
      } else {
        value = undefined
      }
      return value
    } catch (err) {
      type = 'throw'
      value = err
      throw err
    } finally {
      results.push({ type, value })
    }
  } as MockedFunction<T>

  // Stamp the marker both jest and vitest check via isMockFunction.
  Object.defineProperty(mockFn, '_isMockFunction', { value: true, enumerable: false })

  const mock = {
    get calls() {
      return calls
    },
    get results() {
      return results
    },
    get instances() {
      return instances
    },
    get lastCall() {
      return calls.length > 0 ? calls[calls.length - 1] : undefined
    },
  } as MockState<T>
  Object.defineProperty(mockFn, 'mock', { value: mock, enumerable: false })

  mockFn.mockReturnValue = ((v: any) => {
    currentImpl = () => v
    return mockFn
  }) as MockInstance<T>['mockReturnValue']
  mockFn.mockReturnValueOnce = ((v: any) => {
    onceQueue.push(() => v)
    return mockFn
  }) as MockInstance<T>['mockReturnValueOnce']
  mockFn.mockResolvedValue = ((v: any) => {
    currentImpl = () => Promise.resolve(v)
    return mockFn
  }) as MockInstance<T>['mockResolvedValue']
  mockFn.mockResolvedValueOnce = ((v: any) => {
    onceQueue.push(() => Promise.resolve(v))
    return mockFn
  }) as MockInstance<T>['mockResolvedValueOnce']
  mockFn.mockRejectedValue = ((v: any) => {
    currentImpl = () => Promise.reject(v)
    return mockFn
  }) as MockInstance<T>['mockRejectedValue']
  mockFn.mockRejectedValueOnce = ((v: any) => {
    onceQueue.push(() => Promise.reject(v))
    return mockFn
  }) as MockInstance<T>['mockRejectedValueOnce']
  mockFn.mockImplementation = ((fn: any) => {
    currentImpl = fn
    return mockFn
  }) as MockInstance<T>['mockImplementation']
  mockFn.mockImplementationOnce = ((fn: any) => {
    onceQueue.push(fn)
    return mockFn
  }) as MockInstance<T>['mockImplementationOnce']
  mockFn.mockClear = (() => {
    calls.length = 0
    results.length = 0
    instances.length = 0
    return mockFn
  }) as MockInstance<T>['mockClear']
  mockFn.mockReset = (() => {
    calls.length = 0
    results.length = 0
    instances.length = 0
    onceQueue = []
    currentImpl = impl as ((...args: any[]) => any) | undefined
    return mockFn
  }) as MockInstance<T>['mockReset']
  mockFn.mockRestore = (() => {
    mockFn.mockReset()
    return mockFn
  }) as MockInstance<T>['mockRestore']
  mockFn.getMockName = (() => name) as MockInstance<T>['getMockName']
  mockFn.mockName = ((n: string) => {
    name = n
    return mockFn
  }) as MockInstance<T>['mockName']

  const ref = new WeakRef<MockInstance>(mockFn as MockInstance)
  created.add(ref)
  collected.register(mockFn, ref)
  return mockFn
}
