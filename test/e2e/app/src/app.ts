import { GatewayIntentBits, Partials } from 'discord.js'
import { MeoCord } from 'meocord/decorator'
import { SmokeController } from '@src/controllers/smoke.controller'
import { ResponderController } from '@src/controllers/responder.controller'
import { ProbeService } from '@src/services/probe.service'

const manual = process.env.MEOCORD_E2E_MODE === 'manual'

@MeoCord({
  // The responders serve the manual checklist; the automated checks register only the smoke command
  controllers: manual ? [SmokeController, ResponderController] : [SmokeController],
  services: [ProbeService],
  clientOptions: {
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.MessageContent,
    ],
    partials: [Partials.Message, Partials.Reaction],
  },
})
export default class App {}
