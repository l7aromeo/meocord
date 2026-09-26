import {
  ChannelSelectMenuInteraction,
  Collection,
  type GuildMember,
  MentionableSelectMenuInteraction,
  Role,
  RoleSelectMenuInteraction,
  StringSelectMenuInteraction,
  TextChannel,
  User,
  UserSelectMenuInteraction,
} from 'discord.js'
import { CooldownError } from '@src/common/index.js'
import { Command, Controller, Cooldown, Pipe, Validate } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { type PipeInterface, type StandardSchemaV1 } from '@src/interface/index.js'
import { createMockInteraction, MeoCordTestingModule } from '@src/testing/index.js'

const received: unknown[] = []

/** Keeps the first choice only, so a test can tell the validated params from the raw ones. */
const firstChoice: StandardSchemaV1<unknown, { values: string[]; ownerId: string }> = {
  '~standard': {
    version: 1,
    vendor: 'test',
    validate: value => {
      const { values, ownerId } = value as { values: string[]; ownerId: string }
      return values.length > 0 ? { value: { values: values.slice(0, 1), ownerId } } : { issues: [{ message: 'Pick one' }] }
    },
  },
}

@Pipe()
class UpperPipe implements PipeInterface<string[], string[]> {
  transform(values: string[]) {
    return values.map(value => value.toUpperCase())
  }
}

@Controller()
class PickController {
  @Command('flavour/{ownerId}', CommandType.SELECT_MENU)
  flavour(_interaction: StringSelectMenuInteraction, params: Record<string, unknown>) {
    received.push(params)
  }

  @Command('only-one/{ownerId}', CommandType.SELECT_MENU)
  @Validate(firstChoice, { pipes: { values: UpperPipe } })
  onlyOne(_interaction: StringSelectMenuInteraction, params: { values: string[]; ownerId: string }) {
    received.push(params)
  }

  // One vote an hour for each option, whoever casts it
  @Command('vote', CommandType.SELECT_MENU)
  @Cooldown({ seconds: 3_600, per: 'global', by: (_context, { values }: { values: string[] }) => values[0] })
  vote(_interaction: StringSelectMenuInteraction, params: { values: string[] }) {
    received.push(params)
  }

  @Command('members', CommandType.USER_SELECT_MENU)
  members(_interaction: UserSelectMenuInteraction, params: Record<string, unknown>) {
    received.push(params)
  }

  @Command('roles', CommandType.ROLE_SELECT_MENU)
  roles(_interaction: RoleSelectMenuInteraction, params: Record<string, unknown>) {
    received.push(params)
  }

  @Command('channels', CommandType.CHANNEL_SELECT_MENU)
  channels(_interaction: ChannelSelectMenuInteraction, params: Record<string, unknown>) {
    received.push(params)
  }

  @Command('mentions', CommandType.MENTIONABLE_SELECT_MENU)
  mentions(_interaction: MentionableSelectMenuInteraction, params: Record<string, unknown>) {
    received.push(params)
  }

  // A customId param named like a choice: the route chose the handler by it, so it is the one kept
  @Command('clash/{values}', CommandType.SELECT_MENU)
  clash(_interaction: StringSelectMenuInteraction, params: Record<string, unknown>) {
    received.push(params)
  }
}

const module = MeoCordTestingModule.create({ controllers: [PickController] }).compile()

const pick = (customId: string, values: string[]) => createMockInteraction(StringSelectMenuInteraction, { customId, values })
const collection = <T>(entries: [string, T][]) => new Collection<string, T>(entries)

const ada = createMockInteraction(User, { id: '1', username: 'ada' })
const bo = createMockInteraction(User, { id: '2', username: 'bo' })
const adaMember = { id: '1', user: ada } as unknown as GuildMember
const mods = Object.assign(Object.create(Role.prototype), { id: '10', name: 'Mods' }) as Role
const general = Object.assign(Object.create(TextChannel.prototype), { id: '20', name: 'general' }) as TextChannel

beforeEach(() => {
  received.length = 0
})

describe("a select menu's chosen values, in the handler's params", () => {
  it('reach a string select with its customId params', async () => {
    await module.invoke(PickController, 'flavour', pick('flavour/42', ['vanilla', 'mint']))

    expect(received).toEqual([{ ownerId: '42', values: ['vanilla', 'mint'] }])
  })

  it('are validated and piped as a modal field is', async () => {
    await module.invoke(PickController, 'onlyOne', pick('only-one/42', ['vanilla', 'mint']))

    expect(received).toEqual([{ ownerId: '42', values: ['VANILLA'] }])
    await expect(module.invoke(PickController, 'onlyOne', pick('only-one/42', []))).rejects.toThrow('Pick one')
  })

  it("count a cooldown's `by`, so each option is limited on its own", async () => {
    await module.invoke(PickController, 'vote', pick('vote', ['red']))
    await module.invoke(PickController, 'vote', pick('vote', ['blue']))

    await expect(module.invoke(PickController, 'vote', pick('vote', ['red']))).rejects.toBeInstanceOf(CooldownError)
    expect(received).toEqual([{ values: ['red'] }, { values: ['blue'] }])
  })

  it('come with the chosen users and their members from a user select', async () => {
    const interaction = createMockInteraction(UserSelectMenuInteraction, {
      customId: 'members',
      values: ['1', '2'],
      users: collection([
        ['1', ada],
        ['2', bo],
      ]),
      members: collection([['1', adaMember]]),
    })

    await module.invoke(PickController, 'members', interaction)

    expect(received).toEqual([{ values: ['1', '2'], users: [ada, bo], members: [adaMember] }])
  })

  it('come with the chosen roles from a role select', async () => {
    const interaction = createMockInteraction(RoleSelectMenuInteraction, {
      customId: 'roles',
      values: ['10'],
      roles: collection([['10', mods]]),
    })

    await module.invoke(PickController, 'roles', interaction)

    expect(received).toEqual([{ values: ['10'], roles: [mods] }])
  })

  it('come with the chosen channels from a channel select', async () => {
    const interaction = createMockInteraction(ChannelSelectMenuInteraction, {
      customId: 'channels',
      values: ['20'],
      channels: collection([['20', general]]),
    })

    await module.invoke(PickController, 'channels', interaction)

    expect(received).toEqual([{ values: ['20'], channels: [general] }])
  })

  it('come with the users, members and roles chosen in a mentionable select', async () => {
    const interaction = createMockInteraction(MentionableSelectMenuInteraction, {
      customId: 'mentions',
      values: ['1', '10'],
      users: collection([['1', ada]]),
      members: collection([['1', adaMember]]),
      roles: collection([['10', mods]]),
    })

    await module.invoke(PickController, 'mentions', interaction)

    expect(received).toEqual([{ values: ['1', '10'], users: [ada], members: [adaMember], roles: [mods] }])
  })

  it('give way to a customId param of the same name', async () => {
    await module.invoke(PickController, 'clash', pick('clash/from-route', ['chosen']))

    expect(received).toEqual([{ values: 'from-route' }])
  })
})
