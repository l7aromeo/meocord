import { ComponentType, ModalSubmitFields } from 'discord.js'

/**
 * Builds the `fields` of a submitted modal, as discord.js does when a user submits one, for a mock
 * `ModalSubmitInteraction`. A string is a text input's value; an array is a select's chosen values.
 *
 * discord.js keeps the `ModalSubmitFields` constructor private, so tests cannot build one directly.
 *
 * @param values - Each field's value, keyed by its customId.
 * @returns Fields that `getTextInputValue`, `getStringSelectValues` and a handler's input all read.
 *
 * @example
 * ```ts
 * const interaction = createMockInteraction(ModalSubmitInteraction, {
 *   customId: 'feedback/bugs',
 *   fields: createModalFields({ body: 'It crashed' }),
 * })
 *
 * await module.invoke(FeedbackController, 'feedback', interaction) // params: { topic: 'bugs', body: 'It crashed' }
 * ```
 */
export function createModalFields(values: Record<string, string | string[]>): ModalSubmitFields {
  const components = Object.entries(values).map(([customId, value]) => ({
    type: ComponentType.Label,
    component: Array.isArray(value)
      ? { type: ComponentType.StringSelect, customId, values: value }
      : { type: ComponentType.TextInput, customId, value },
  }))

  const Fields = ModalSubmitFields as unknown as new (components: unknown[]) => ModalSubmitFields
  return new Fields(components)
}
