import { type Interaction, ModalSubmitInteraction } from 'discord.js'
import { getCommandMap } from '@src/decorator/controller.decorator.js'
import { decodeRouteParams } from '@src/common/route.js'
import {
  hasCustomId,
  isCustomIdRouted,
  matchesCommandType,
  resolveCommandPaths,
  resolveOptionParams,
} from '@src/util/interaction.util.js'

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
 * Builds a handler's input in one object: a chat command's or an autocomplete's options, or a
 * component's customId params and, for a modal, its fields. When a customId param and a field share
 * a name, the customId param wins, since the route was chosen by it.
 *
 * @param routeParams - The params the customId's pattern captured.
 */
export function handlerInput(interaction: Interaction, routeParams: Record<string, string> = {}): HandlerInput {
  if (interaction.isChatInputCommand() || interaction.isAutocomplete()) {
    return { params: resolveOptionParams(interaction), collisions: [] }
  }
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
      if (match) return decodeRouteParams(match.groups)
    }
  }
  return {}
}

/**
 * Why an interaction could not reach a handler through its routes, for a test calling the handler
 * directly: a customId its patterns do not match, or a command its name is not. `undefined` when it
 * could, when the handler has no route, or when the interaction carries no customId or command name.
 */
export function routeMismatch(controller: { name: string; prototype: object }, methodName: string, interaction: Interaction): string | undefined {
  const routes = Object.entries(getCommandMap(controller.prototype) ?? {}).flatMap(([route, metas]) =>
    metas.filter(meta => meta.methodName === methodName).map(meta => ({ route, meta })),
  )
  const handler = `${controller.name}.${methodName}`
  const describe = (kind: string, value: string, candidates: { route: string }[]) =>
    `${kind} '${value}' does not match ${handler}'s route ${candidates.map(({ route }) => `'${route}'`).join(' or ')}.`

  if (hasCustomId(interaction)) {
    const patterned = routes.filter(({ meta }) => isCustomIdRouted(meta.type) && meta.regex)
    if (typeof interaction.customId !== 'string' || patterned.length === 0) return undefined
    if (patterned.some(({ meta }) => meta.regex!.test(interaction.customId))) return undefined
    return describe('customId', interaction.customId, patterned)
  }

  if (!interaction.isCommand()) return undefined
  const named = routes.filter(({ meta }) => !isCustomIdRouted(meta.type))
  if (typeof interaction.commandName !== 'string' || named.length === 0) return undefined
  // A chat command reaches the handler of its full path, or of its bare name, as dispatch tries them
  const keys = interaction.isChatInputCommand() ? resolveCommandPaths(interaction) : [interaction.commandName]
  if (named.some(({ route }) => keys.includes(route))) return undefined
  return describe('command', keys[0], named)
}

