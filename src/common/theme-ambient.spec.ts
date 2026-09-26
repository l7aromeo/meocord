import { vi } from 'vitest'
import { Client } from 'discord.js'
import { Theme } from '@src/common/index.js'
import { MeoCordFactory } from '@src/core/meocord-factory.js'
import { MeoCord } from '@src/decorator/index.js'

vi.mock('@src/util/meocord-config-loader.util.js', () => ({ loadMeoCordConfig: () => ({ discordToken: 'token' }) }))
vi.mock('@src/util/platform.util.js', () => ({ assertBuiltForThisPlatform: () => {} }))

// A file of its own: the started bot keeps the theme read outside a call to the end of it
describe('Theme, deprecated, outside a call', () => {
  it("reads the app's own theme once the app has started", async () => {
    vi.spyOn(Client.prototype, 'login').mockResolvedValue('token')
    @MeoCord({ controllers: [], clientOptions: { intents: [] }, theme: { colors: { primary: '#0F0F02', danger: '#0F0F03' } } })
    class Bot {}

    await MeoCordFactory.create(Bot).start()

    expect([Theme.primaryColor, Theme.errorColor]).toEqual(['#0F0F02', '#0F0F03'])
  })
})
