import { ChatInputCommandInteraction } from 'discord.js'
import { Command, Controller, Guard, MessageHandler, UseGuard } from '@src/decorator/index.js'
import { CommandType, MetadataKey } from '@src/enum/index.js'
import { type GuardInterface } from '@src/interface/index.js'
import { createMetadata, SetMetadata } from '@src/common/index.js'
import { inspectHandler } from '@src/testing/index.js'

const Roles = createMetadata<string[]>('roles')

@Guard()
class RolesGuard implements GuardInterface {
  canActivate() {
    return true
  }
}

@Guard()
class RateLimitGuard implements GuardInterface {
  canActivate() {
    return true
  }
}

@Controller()
@Roles(['moderator'])
@UseGuard(RolesGuard)
class ModerationController {
  @Command('ban', CommandType.SLASH)
  @Roles(['admin'])
  @SetMetadata('audit', true)
  @UseGuard({ provide: RateLimitGuard, params: { limit: 2 } })
  async ban(_interaction: ChatInputCommandInteraction) {}

  @Command('warn', CommandType.SLASH)
  async warn(_interaction: ChatInputCommandInteraction) {}

  @MessageHandler('warn {user} {reason...?}')
  async warnByMessage() {}

  @MessageHandler()
  async everything() {}

  helper() {}
}

describe('inspectHandler', () => {
  it('reports the guards dispatch runs, class guards first', () => {
    expect(inspectHandler(ModerationController, 'ban').guards).toEqual([
      RolesGuard,
      { provide: RateLimitGuard, params: { limit: 2 } },
    ])
    expect(inspectHandler(ModerationController, 'warn').guards).toEqual([RolesGuard])
    expect(inspectHandler(ModerationController, 'helper').guards).toEqual([])
  })

  it('reads metadata as ExecutionContext does, the method value first', () => {
    const ban = inspectHandler(ModerationController, 'ban')

    expect(ban.get(Roles)).toEqual(['admin'])
    expect(ban.getAll(Roles)).toEqual([['admin'], ['moderator']])
    expect(ban.get<boolean>('audit')).toBe(true)
    expect(inspectHandler(ModerationController, 'warn').get(Roles)).toEqual(['moderator'])
  })

  it('names the handler it describes', () => {
    const { controller, methodName } = inspectHandler(ModerationController, 'ban')
    expect([controller, methodName]).toEqual([ModerationController, 'ban'])
  })

  it('reports the pattern of a message handler, and none for other handlers or a listener', () => {
    expect(inspectHandler(ModerationController, 'warnByMessage').pattern).toBe('warn {user} {reason...?}')
    expect(inspectHandler(ModerationController, 'everything').pattern).toBeUndefined()
    expect(inspectHandler(ModerationController, 'ban').pattern).toBeUndefined()
  })

  it('returns a copy, so a test cannot change the guards dispatch runs', () => {
    const { guards } = inspectHandler(ModerationController, 'warn')

    expect(() => (guards as unknown[]).push(RateLimitGuard)).toThrow()
    expect(Reflect.getMetadata(MetadataKey.Guards, ModerationController.prototype, 'warn')).toEqual([RolesGuard])
  })
})
