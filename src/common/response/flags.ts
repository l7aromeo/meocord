import { MessageFlags, MessageFlagsBitField, type MessageFlagsResolvable } from 'discord.js'

/** The Discord call a payload is sent with. */
export type ResponseStep = 'deferReply' | 'reply' | 'update' | 'edit' | 'followUp'

const { Ephemeral, SuppressEmbeds, SuppressNotifications, IsComponentsV2 } = MessageFlags

/** The flags each call accepts; Discord rejects or ignores the rest. */
const ALLOWED: Record<ResponseStep, number> = {
  deferReply: Ephemeral,
  reply: Ephemeral | SuppressEmbeds | SuppressNotifications | IsComponentsV2,
  update: SuppressEmbeds | IsComponentsV2,
  edit: SuppressEmbeds | IsComponentsV2,
  followUp: Ephemeral | SuppressEmbeds | SuppressNotifications | IsComponentsV2,
}

/** The flags a call is sent with, and the requested ones it cannot take. */
export interface ResolvedFlags {
  flags: number
  dropped: number
}

/**
 * The flags for one call, computed afresh from what the payload asks for: nothing carries over from
 * an earlier call. An edit of a Components V2 message keeps `IsComponentsV2`, which Discord cannot
 * clear.
 */
export function resolveFlags(step: ResponseStep, requested: MessageFlagsResolvable | undefined, v2: boolean): ResolvedFlags {
  const asked = requested === undefined ? 0 : Number(MessageFlagsBitField.resolve(requested))
  const allowed = ALLOWED[step]
  let flags = asked & allowed
  if (v2 && (step === 'edit' || step === 'update')) flags |= IsComponentsV2
  return { flags, dropped: asked & ~allowed }
}

/** Whether a flags value has `IsComponentsV2` set. */
export function hasComponentsV2(flags: number | undefined): boolean {
  return ((flags ?? 0) & IsComponentsV2) !== 0
}

/** Whether a flags value has `Ephemeral` set. */
export function hasEphemeral(flags: number | undefined): boolean {
  return ((flags ?? 0) & Ephemeral) !== 0
}

/** The names of the flags set in a value, for warnings. */
export function flagNames(flags: number): string[] {
  return new MessageFlagsBitField(flags).toArray()
}
