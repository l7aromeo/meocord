import { type MeoCordConfig } from 'meocord/interface'

// scripts/e2e.ts passes every value here in the environment; the smoke app reads no .env file.
const manual = process.env.MEOCORD_E2E_MODE === 'manual'

export default {
  appName: 'MeoCord E2E',
  discordToken: process.env.MEOCORD_E2E_BOT_TOKEN!,
  shutdownTimeout: 5_000,
  sharding: process.env.MEOCORD_E2E_SHARDING === 'process' ? { mode: 'process', shards: 2 } : undefined,
  // The automated checks keep one stable command set in the test server and none globally. The manual
  // run registers globally, the only scope a user install reaches in DMs and servers without the bot.
  commands: manual ? {} : { guilds: [process.env.MEOCORD_E2E_GUILD_ID!], clearOther: true },
} satisfies MeoCordConfig
