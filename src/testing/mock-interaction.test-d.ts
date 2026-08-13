/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { describe, it, expectTypeOf } from 'vitest'
import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  User,
  UserContextMenuCommandInteraction,
} from 'discord.js'
import {
  createChatInputOptions,
  createMockInteraction,
  createMockUser,
  type DeepMocked,
  type MockProps,
} from './mock-interaction.js'
import type { MockedFunction } from './mock-fn.js'

/**
 * The runtime spec cannot cover any of this: types are erased before a test
 * runs. These assertions execute under `vitest --typecheck`, and the negative
 * cases are real assertions — an unfulfilled `@ts-expect-error` is an error in
 * its own right, so a regression that makes a rejected form compile fails here
 * rather than passing silently.
 */

describe('DeepMocked', () => {
  it('is assignable to the class it mocks', () => {
    const interaction = createMockInteraction(ButtonInteraction)
    expectTypeOf(interaction).toExtend<ButtonInteraction>()
  })

  it('is assignable for every interaction class the factories cover', () => {
    expectTypeOf(createMockInteraction(ChatInputCommandInteraction)).toExtend<ChatInputCommandInteraction>()
    expectTypeOf(createMockInteraction(StringSelectMenuInteraction)).toExtend<StringSelectMenuInteraction>()
    expectTypeOf(createMockInteraction(ModalSubmitInteraction)).toExtend<ModalSubmitInteraction>()
    expectTypeOf(createMockUser()).toExtend<User>()
  })

  it('keeps the mock API on methods', () => {
    const interaction = createMockInteraction(ButtonInteraction)
    expectTypeOf(interaction.reply).toExtend<MockedFunction<(...args: never[]) => unknown>>()
    expectTypeOf(interaction.reply.mockResolvedValue).toBeFunction()
  })

  it('keeps the real call signature on methods', () => {
    const interaction = createMockInteraction(ButtonInteraction)
    expectTypeOf(interaction.isButton()).toEqualTypeOf<boolean>()
    expectTypeOf(interaction.customId).toEqualTypeOf<string>()
  })

  it('leaves a writable property writable', () => {
    const interaction = createMockInteraction(ButtonInteraction)
    interaction.customId = 'gi-profile-1-2'
    expectTypeOf(interaction.customId).toEqualTypeOf<string>()
  })

  it('rejects a write to a property the class declares readonly', () => {
    const interaction = createMockInteraction(ModalSubmitInteraction)
    // @ts-expect-error customId is `readonly` on ModalSubmitInteraction — pass it
    // to the factory as MockProps rather than assigning after construction.
    interaction.customId = 'gi-wish-import-1'
  })

  it('does not collapse a nested object to a bare mock', () => {
    const interaction = createMockInteraction(ButtonInteraction)
    expectTypeOf(interaction.user).toExtend<User>()
  })
})

describe('MockProps', () => {
  it('accepts a plain property', () => {
    expectTypeOf(createMockInteraction(ButtonInteraction, { customId: 'x' })).toExtend<ButtonInteraction>()
  })

  it('accepts a property the class declares readonly', () => {
    expectTypeOf(createMockInteraction(ModalSubmitInteraction, { customId: 'x' })).toExtend<ModalSubmitInteraction>()
  })

  it('accepts a property backed by a prototype getter', () => {
    expectTypeOf(
      createMockInteraction(UserContextMenuCommandInteraction, { targetUser: createMockUser() }),
    ).toExtend<UserContextMenuCommandInteraction>()
  })

  it('rejects a value of the wrong type', () => {
    // @ts-expect-error customId is a string, not a number.
    createMockInteraction(ButtonInteraction, { customId: 123 })
  })

  it('rejects a property the class does not declare', () => {
    // @ts-expect-error typo in the property name — excess property checking is
    // the whole reason MockProps is typed rather than Record<string, unknown>.
    createMockInteraction(ButtonInteraction, { customID: 'x' })
  })

  it('leaves every property optional', () => {
    expectTypeOf<MockProps<ButtonInteraction>>().toExtend<Record<string, never> | object>()
    expectTypeOf(createMockInteraction(ButtonInteraction, {})).toExtend<ButtonInteraction>()
  })
})

// The single most common line of setup in a slash-command test. It has to work
// without a cast, or the cast spreads to every chat-input spec in every project.
describe('createChatInputOptions', () => {
  it('assigns to interaction.options without a cast', () => {
    const interaction = createMockInteraction(ChatInputCommandInteraction)
    interaction.options = createChatInputOptions({ name: 'Alice' })
    expectTypeOf(interaction.options.getString('name')).toEqualTypeOf<string | null>()
  })

  it('is accepted as a construction-time prop', () => {
    expectTypeOf(
      createMockInteraction(ChatInputCommandInteraction, { options: createChatInputOptions({ name: 'Alice' }) }),
    ).toExtend<ChatInputCommandInteraction>()
  })
})

describe('DeepMocked depth cap', () => {
  it('stops recursing at the cap and hands back the source type', () => {
    expectTypeOf<DeepMocked<{ a: 1 }, [0, 0, 0, 0, 0]>>().toEqualTypeOf<{ a: 1 }>()
  })
})
