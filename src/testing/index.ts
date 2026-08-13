/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

export { MeoCordTestingModule, TestingModule, TestingModuleBuilder } from './meocord-testing-module.js'
export type { Provider, ValueProvider, ClassProvider, TestingModuleOptions } from './meocord-testing-module.js'

export {
  createMockInteraction,
  createChatInputOptions,
  createMockUser,
  createMockClient,
  createMockGuild,
  createMockChannel,
  createMockMessage,
} from './mock-interaction.js'
export type { DeepMocked, ChatInputOptions, MockProps } from './mock-interaction.js'

export { createMockFn, isMockFunction } from './mock-fn.js'
export type { Mock, MockedFunction, MockInstance, MockResult, MockState } from './mock-fn.js'
