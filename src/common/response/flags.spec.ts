import { MessageFlags } from 'discord.js'
import { hasComponentsV2, hasEphemeral, resolveFlags } from '@src/common/response/flags.js'

const { Ephemeral, IsComponentsV2, SuppressNotifications } = MessageFlags

describe('resolveFlags', () => {
  it('keeps IsComponentsV2 on an edit or an update of a Components V2 message, and only there', () => {
    expect(resolveFlags('edit', undefined, true).flags).toBe(IsComponentsV2)
    expect(resolveFlags('update', undefined, true).flags).toBe(IsComponentsV2)
    expect(resolveFlags('reply', undefined, true).flags).toBe(0)
    expect(resolveFlags('followUp', undefined, true).flags).toBe(0)
    expect(resolveFlags('deferReply', undefined, true).flags).toBe(0)
    expect(resolveFlags('edit', undefined, false).flags).toBe(0)
  })

  it('reports what a call cannot take as dropped', () => {
    expect(resolveFlags('edit', Ephemeral | SuppressNotifications, false)).toEqual({ flags: 0, dropped: Ephemeral | SuppressNotifications })
  })
})

describe('hasComponentsV2 and hasEphemeral', () => {
  it('read their flag, and nothing from no flags', () => {
    expect(hasComponentsV2(IsComponentsV2 | Ephemeral)).toBe(true)
    expect(hasComponentsV2(Ephemeral)).toBe(false)
    expect(hasComponentsV2(undefined)).toBe(false)
    expect(hasEphemeral(Ephemeral)).toBe(true)
    expect(hasEphemeral(undefined)).toBe(false)
  })
})
