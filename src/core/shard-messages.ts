/** A message between a shard manager and its shards; discord.js's own messages never carry `meocord`. */
export type ShardMessage = { meocord: 'shutdown' } | { meocord: 'fatal'; code: string; message: string }

/** Whether an IPC message is one of MeoCord's own, rather than one of discord.js's. */
export function isShardMessage(message: unknown): message is ShardMessage {
  return typeof message === 'object' && message !== null && 'meocord' in message
}
