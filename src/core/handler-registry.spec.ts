import {
  type AutocompleteInteraction,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Message,
  type MessageReaction,
  type ModalSubmitInteraction,
  SlashCommandBuilder,
} from 'discord.js'
import { createMetadata } from '@src/common/index.js'
import {
  Autocomplete,
  Command,
  CommandBuilder,
  Controller,
  MessageHandler,
  On,
  Once,
  ReactionHandler,
  Service,
} from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { HandlerRegistry } from '@src/core/handler-registry.js'
import { MeoCordTestingModule } from '@src/testing/index.js'

const Category = createMetadata<string>('category')

@CommandBuilder(CommandType.SLASH)
class SettingsBuilder {
  build(name: string) {
    return new SlashCommandBuilder()
      .setName(name)
      .setDescription('Change your settings')
      .addSubcommand(sub => sub.setName('language').setDescription('Pick a language'))
  }
}

@Controller()
@Category('Account')
class SettingsController {
  @Command('settings', SettingsBuilder)
  settings(_interaction: ChatInputCommandInteraction) {}

  @Command('settings language', CommandType.SLASH)
  @Category('Preferences')
  language(_interaction: ChatInputCommandInteraction) {}

  @Autocomplete('settings language', 'code')
  completeLanguage(_interaction: AutocompleteInteraction) {}

  @Command('profile/{uid}', CommandType.BUTTON)
  profile(_interaction: ButtonInteraction) {}

  @Command('feedback', CommandType.MODAL_SUBMIT)
  feedback(_interaction: ModalSubmitInteraction) {}

  @MessageHandler('ping')
  ping(_message: Message) {}

  @ReactionHandler()
  react(_reaction: MessageReaction) {}
}

@Service()
class WelcomeService {
  @On('guildMemberAdd')
  greet(_member: GuildMember) {}

  @Once('clientReady')
  warm() {}
}

@Service()
class HelpService {
  constructor(readonly handlers: HandlerRegistry) {}
}

describe('HandlerRegistry', () => {
  const registry = () =>
    MeoCordTestingModule.create({
      controllers: [SettingsController],
      providers: [
        { provide: WelcomeService, useClass: WelcomeService },
        { provide: HelpService, useClass: HelpService },
      ],
    })
      .compile()
      .get(HelpService).handlers

  it('lists every kind of handler with its name', () => {
    const entries = registry()
      .list()
      .map(({ kind, controller, method, name }) => ({ kind, controller: controller.name, method, name }))

    expect(entries).toEqual(
      expect.arrayContaining([
        { kind: 'command', controller: 'SettingsController', method: 'settings', name: 'settings' },
        { kind: 'command', controller: 'SettingsController', method: 'language', name: 'settings language' },
        { kind: 'autocomplete', controller: 'SettingsController', method: 'completeLanguage', name: 'settings language code' },
        { kind: 'component', controller: 'SettingsController', method: 'profile', name: 'profile/{uid}' },
        { kind: 'modal', controller: 'SettingsController', method: 'feedback', name: 'feedback' },
        { kind: 'message', controller: 'SettingsController', method: 'ping', name: 'ping' },
        { kind: 'reaction', controller: 'SettingsController', method: 'react', name: undefined },
        { kind: 'event', controller: 'WelcomeService', method: 'greet', name: 'guildMemberAdd' },
        { kind: 'event', controller: 'WelcomeService', method: 'warm', name: 'clientReady' },
      ]),
    )
    expect(entries).toHaveLength(9)
  })

  it('gives a subcommand the top-level command JSON and its command type', () => {
    const language = registry()
      .list({ kind: 'command' })
      .find(entry => entry.name === 'settings language')

    expect(language?.commandType).toBe(CommandType.SLASH)
    expect(language?.command?.name).toBe('settings')
    expect(language?.command).toMatchObject({ description: 'Change your settings' })
    expect(language?.description).toBe('Pick a language')
    expect(registry().list({ kind: 'command' }).find(entry => entry.name === 'settings')?.description).toBe(
      'Change your settings',
    )
  })

  it('reads metadata as ExecutionContext does, the method before the controller', () => {
    const commands = registry().list({ kind: 'command' })

    expect(commands.find(entry => entry.method === 'language')?.get(Category)).toBe('Preferences')
    expect(commands.find(entry => entry.method === 'settings')?.get(Category)).toBe('Account')
    expect(commands.find(entry => entry.method === 'language')?.getAll(Category)).toEqual(['Preferences', 'Account'])
  })

  it('filters by kind and by controller, and narrows the entry type', () => {
    const events = registry().list({ kind: 'event' })
    expect(events.map(entry => [entry.name, entry.once])).toEqual([
      ['guildMemberAdd', false],
      ['clientReady', true],
    ])

    expect(registry().list({ controller: WelcomeService })).toHaveLength(2)
    expect(registry().list({ kind: 'modal', controller: WelcomeService })).toEqual([])
  })
})
