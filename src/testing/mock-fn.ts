/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

// ---------------------------------------------------------------------------
// Framework-agnostic mock function
//
// A minimal mock-fn implementation used internally by the testing utilities so
// that `meocord/testing` does not depend on jest OR vitest. Both jest and
// vitest detect a mock via the `_isMockFunction` flag, and both
// `expect(fn).toHaveBeenCalledWith(...)` / `toHaveBeenCalledTimes(...)` read
// `fn.mock.calls` — so a mock produced here is recognized by assertions in
// either framework.
// ---------------------------------------------------------------------------

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

/**
 * Creates a framework-agnostic mock function. Callable; records calls on
 * `.mock.calls`; supports the mock-return/resolved/rejected/implementation
 * API used by the testing utilities and by user assertions.
 *
 * @example
 * const fn = createMockFn<(x: number) => number>((x) => x + 1)
 * fn(2)                    // → 3
 * fn.mockReturnValue(99)
 * fn(2)                    // → 99
 * fn.mock.calls             // → [[2], [2]]
 */
export function createMockFn<T extends (...args: any[]) => any = (...args: any[]) => any>(impl?: T): MockedFunction<T> {
  let currentImpl: ((...args: any[]) => any) | undefined = impl as ((...args: any[]) => any) | undefined
  let returnOnce: any[] = []
  let returnValue: { set: boolean; value: any } = { set: false, value: undefined }
  let resolvedOnce: any[] = []
  let resolvedValue: { set: boolean; value: any } = { set: false, value: undefined }
  let rejectedOnce: any[] = []
  let rejectedValue: { set: boolean; value: any } = { set: false, value: undefined }
  const implOnce: ((...args: any[]) => any)[] = []
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
      if (implOnce.length > 0) {
        value = implOnce.shift()!.apply(this, args)
      } else if (returnOnce.length > 0) {
        value = returnOnce.shift()
      } else if (returnValue.set) {
        value = returnValue.value
      } else if (resolvedOnce.length > 0) {
        value = Promise.resolve(resolvedOnce.shift())
      } else if (resolvedValue.set) {
        value = Promise.resolve(resolvedValue.value)
      } else if (rejectedOnce.length > 0) {
        value = Promise.reject(rejectedOnce.shift())
      } else if (rejectedValue.set) {
        value = Promise.reject(rejectedValue.value)
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
    returnValue = { set: true, value: v }
    return mockFn
  }) as MockInstance<T>['mockReturnValue']
  mockFn.mockReturnValueOnce = ((v: any) => {
    returnOnce.push(v)
    return mockFn
  }) as MockInstance<T>['mockReturnValueOnce']
  mockFn.mockResolvedValue = ((v: any) => {
    resolvedValue = { set: true, value: v }
    return mockFn
  }) as MockInstance<T>['mockResolvedValue']
  mockFn.mockResolvedValueOnce = ((v: any) => {
    resolvedOnce.push(v)
    return mockFn
  }) as MockInstance<T>['mockResolvedValueOnce']
  mockFn.mockRejectedValue = ((v: any) => {
    rejectedValue = { set: true, value: v }
    return mockFn
  }) as MockInstance<T>['mockRejectedValue']
  mockFn.mockRejectedValueOnce = ((v: any) => {
    rejectedOnce.push(v)
    return mockFn
  }) as MockInstance<T>['mockRejectedValueOnce']
  mockFn.mockImplementation = ((fn: any) => {
    currentImpl = fn
    return mockFn
  }) as MockInstance<T>['mockImplementation']
  mockFn.mockImplementationOnce = ((fn: any) => {
    implOnce.push(fn)
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
    returnOnce = []
    returnValue = { set: false, value: undefined }
    resolvedOnce = []
    resolvedValue = { set: false, value: undefined }
    rejectedOnce = []
    rejectedValue = { set: false, value: undefined }
    implOnce.length = 0
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

  return mockFn
}
