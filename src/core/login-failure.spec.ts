import { GatewayIntentBits } from 'discord.js'
import { disallowedIntentsMessage, explainLoginFailure, fatalLoginCode } from '@src/core/login-failure.js'

describe('fatalLoginCode', () => {
  it("reads discord.js's codes, and the gateway's close messages that arrive without one", () => {
    expect(fatalLoginCode(Object.assign(new Error('x'), { code: 'TokenInvalid' }))).toBe('TokenInvalid')
    expect(fatalLoginCode(Object.assign(new Error('x'), { code: 'DisallowedIntents' }))).toBe('DisallowedIntents')
    expect(fatalLoginCode(new Error('Used disallowed intents'))).toBe('DisallowedIntents')
    expect(fatalLoginCode(new Error('Used invalid intents'))).toBe('InvalidIntents')
  })

  it('reads nothing fatal from an error a restart can fix, or from no error', () => {
    expect(fatalLoginCode(new Error('getaddrinfo ENOTFOUND discord.com'))).toBeUndefined()
    expect(fatalLoginCode(Object.assign(new Error('x'), { code: 'TokenMissing' }))).toBeUndefined()
    expect(fatalLoginCode(undefined)).toBeUndefined()
    expect(fatalLoginCode('Used disallowed intents')).toBeUndefined()
  })
})

describe('disallowedIntentsMessage', () => {
  it('names exactly the privileged intents requested, in a fixed order', () => {
    const message = disallowedIntentsMessage([GatewayIntentBits.MessageContent, GatewayIntentBits.Guilds, GatewayIntentBits.GuildPresences])

    expect(message).toContain('(GuildPresences, MessageContent)')
    expect(message).not.toContain('GuildMembers')
    expect(message).not.toContain('Guilds,')
  })

  it('still says where to enable them when no privileged intent can be named', () => {
    expect(disallowedIntentsMessage(undefined)).toMatch(/^Discord refused a privileged intent the bot requests\. Enable them in the Developer Portal/)
  })
})

describe('explainLoginFailure', () => {
  it('explains refused intents only', () => {
    expect(explainLoginFailure('DisallowedIntents', [GatewayIntentBits.GuildMembers])).toContain('(GuildMembers)')
    expect(explainLoginFailure('InvalidIntents', [])).toContain('as invalid')
    expect(explainLoginFailure('TokenInvalid', [])).toBeUndefined()
    expect(explainLoginFailure(undefined, [])).toBeUndefined()
  })
})
