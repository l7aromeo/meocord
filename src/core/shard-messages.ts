import type { CooldownLimit, CooldownVerdict } from '@src/common/cooldown-store.js'

/** A message between a shard manager and its shards; discord.js's own messages never carry `meocord`. */
export type ShardMessage =
  | { meocord: 'shutdown' }
  | { meocord: 'fatal'; code: string; message: string }
  /** A shard's call, for the manager to count against the limit. */
  | { meocord: 'cooldown'; id: string; key: string; limit: CooldownLimit }
  /** The manager's answer to the call with the same `id`. */
  | { meocord: 'cooldown-verdict'; id: string; verdict: CooldownVerdict }

/** Whether an IPC message is one of MeoCord's own, rather than one of discord.js's. */
export function isShardMessage(message: unknown): message is ShardMessage {
  return typeof message === 'object' && message !== null && 'meocord' in message
}
