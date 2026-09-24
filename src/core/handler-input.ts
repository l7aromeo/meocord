import { type Interaction, ModalSubmitInteraction } from 'discord.js'
import { getCommandMap } from '@src/decorator/controller.decorator.js'
import { hasCustomId, matchesCommandType, resolveOptionParams } from '@src/util/interaction.util.js'

/** The second argument an interaction handler receives, and the names given twice while building it. */
export interface HandlerInput {
  params: Record<string, unknown>
  /** Names both a customId param and a modal field carry; the customId param is the one kept. */
  collisions: string[]
}

/**
 * What a modal field submits: a text input's text, a select's chosen ids, a file upload's attachments,
 * or a checkbox's state. Keyed by the field's customId.
 */
function modalFields(interaction: ModalSubmitInteraction): Record<string, unknown> {
  // A Collection when discord.js built it; anything else, such as a test double's stub, has no fields.
  const fields: unknown = interaction.fields?.fields
  if (!(fields instanceof Map)) return {}

  const values: Record<string, unknown> = {}
  for (const [customId, field] of fields as Map<string, unknown>) {
    const data = field as unknown as Record<string, unknown>
    values[customId] = 'value' in data ? data.value : 'values' in data ? data.values : data.attachments
  }
  return values
}

/**
 * Builds a handler's input in one object: a chat command's options, or a component's customId params
 * and, for a modal, its fields. When a customId param and a field share a name, the customId param
 * wins, since the route was chosen by it.
 *
 * @param routeParams - The params the customId's pattern captured.
 */
export function handlerInput(interaction: Interaction, routeParams: Record<string, string> = {}): HandlerInput {
  if (interaction.isChatInputCommand()) return { params: resolveOptionParams(interaction), collisions: [] }
  if (!hasCustomId(interaction)) return { params: {}, collisions: [] }

  const fields = interaction instanceof ModalSubmitInteraction ? modalFields(interaction) : {}
  const collisions = Object.keys(routeParams).filter(name => name in fields)
  return { params: { ...fields, ...routeParams }, collisions }
}

/**
 * The params a handler's own customId pattern captures from an interaction, as routing would: for a
 * test that calls the handler with no params of its own.
 */
export function routeParamsFor(prototype: object, methodName: string, interaction: Interaction): Record<string, string> {
  if (!hasCustomId(interaction)) return {}

  for (const metaList of Object.values(getCommandMap(prototype) ?? {})) {
    for (const meta of metaList) {
      if (meta.methodName !== methodName || !meta.regex || !matchesCommandType(meta.type, interaction)) continue
      const match = meta.regex.exec(interaction.customId)
      if (match) return { ...match.groups }
    }
  }
  return {}
}
