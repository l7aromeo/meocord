import { vi } from 'vitest'
import { ButtonInteraction, Client } from 'discord.js'
import { Command, Controller, MeoCord } from '@src/decorator/index.js'
import { useTheme } from '@src/common/index.js'
import { CommandType } from '@src/enum/index.js'
import { MeoCordFactory } from '@src/core/meocord-factory.js'
import { DEFAULT_THEME } from '@src/core/theme-defaults.js'
import { createMockInteraction, MeoCordTestingModule } from '@src/testing/index.js'

vi.mock('@src/util/meocord-config-loader.util.js', () => ({ loadMeoCordConfig: () => ({ discordToken: 'token' }) }))
vi.mock('@src/util/platform.util.js', () => ({ assertBuiltForThisPlatform: () => {} }))

const seen: string[] = []
let who = ''
const press = () => createMockInteraction(ButtonInteraction, { customId: 'plain' })

@Controller()
class Plain {
  @Command('plain', CommandType.BUTTON)
  plain() {
    seen.push(`${who} ${useTheme().colors.primary}`)
  }
}

/** Sends an interaction to a started client and waits for its handlers. */
const dispatch = (client: Client) =>
  Promise.all(client.rawListeners('interactionCreate').map(listener => (listener as (i: unknown) => unknown)(press())))

// A file of its own: the started bot keeps the theme read outside a call to the end of it
describe('an app on MeoCord\'s defaults, while another app\'s theme is read outside calls', () => {
  it('reads the defaults in its own calls, however it was set up', async () => {
    const early = MeoCordTestingModule.create({ controllers: [Plain] }).compile()
    who = 'module set up before the bot'
    await early.invoke(Plain, 'plain', press())

    const clients: Client[] = []
    vi.spyOn(Client.prototype, 'login').mockImplementation(function (this: Client) {
      clients.push(this)
      return Promise.resolve('token')
    })
    @MeoCord({ controllers: [Plain], clientOptions: { intents: [] }, theme: { colors: { primary: '#0F0F01' } } })
    class Bot {}
    await MeoCordFactory.create(Bot).start()

    await early.invoke(Plain, 'plain', press())
    who = 'module set up after the bot'
    await MeoCordTestingModule.create({ controllers: [Plain] }).compile().invoke(Plain, 'plain', press())
    @MeoCord({ controllers: [Plain], clientOptions: { intents: [] } })
    class SecondBot {}
    await MeoCordFactory.create(SecondBot).start()
    who = 'second bot'
    await dispatch(clients[1])
    who = 'bot'
    await dispatch(clients[0])

    const defaults = DEFAULT_THEME.colors.primary
    expect(seen).toEqual([
      `module set up before the bot ${defaults}`,
      `module set up before the bot ${defaults}`,
      `module set up after the bot ${defaults}`,
      `second bot ${defaults}`,
      'bot #0F0F01',
    ])
    expect(useTheme().colors.primary).toBe('#0F0F01')
  })
})
