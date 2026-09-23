import 'reflect-metadata'
import { Command, Controller, Guard, MeoCord, UseGuard } from '@src/decorator/index.js'
import { CommandType } from '@src/enum/index.js'
import { findRouteConflicts, resolveRoute } from '@src/testing/index.js'

@Controller()
class BroadController {
  @Command('gi-profile/{uuid}/{uid}', CommandType.BUTTON)
  async broad(_i: unknown, _params: Record<string, string>) {}
}

@Controller()
class SpecificController {
  @Command('gi-profile/summary/{ownerId}/{uid}', CommandType.BUTTON)
  async specific(_i: unknown, _params: Record<string, string>) {}

  @Command('gi-profile/summary/{ownerId}/{uid}', CommandType.SELECT_MENU)
  async specificMenu(_i: unknown, _params: Record<string, string>) {}

  @Command('ping', CommandType.SLASH)
  async ping(_i: unknown, _params: Record<string, string>) {}
}

// Registered broad first: the more specific pattern has to win across controllers anyway.
@MeoCord({ controllers: [BroadController, SpecificController], clientOptions: { intents: [] } })
class App {}

describe('resolveRoute', () => {
  it('resolves to the most specific pattern across every registered controller', () => {
    expect(resolveRoute(App, { type: CommandType.BUTTON, customId: 'gi-profile/summary/111/800000001' })).toEqual({
      controller: SpecificController,
      method: 'specific',
      handler: SpecificController.prototype.specific,
      params: { ownerId: '111', uid: '800000001' },
    })
  })

  it('falls back to a broader pattern for an id only it can take', () => {
    expect(resolveRoute(App, { type: CommandType.BUTTON, customId: 'gi-profile/abc-def/800000001' })).toEqual({
      controller: BroadController,
      method: 'broad',
      handler: BroadController.prototype.broad,
      params: { uuid: 'abc-def', uid: '800000001' },
    })
  })

  // A button and a select menu may share a pattern; the component type picks the handler.
  it('resolves by component type as well as by pattern', () => {
    const route = resolveRoute(App, { type: CommandType.SELECT_MENU, customId: 'gi-profile/summary/111/8' })

    expect(route?.method).toBe('specificMenu')
  })

  // @UseGuard replaces the method on the prototype; `handler` is that same function.
  it('returns the handler as it sits on the prototype, guards included', () => {
    @Guard()
    class AllowGuard {
      canActivate() {
        return true
      }
    }

    @Controller()
    class GuardedController {
      @Command('guarded/{id}', CommandType.BUTTON)
      @UseGuard(AllowGuard)
      async guarded(_i: unknown, _params: Record<string, string>) {}
    }

    @MeoCord({ controllers: [GuardedController], clientOptions: { intents: [] } })
    class GuardedApp {}

    const route = resolveRoute(GuardedApp, { type: CommandType.BUTTON, customId: 'guarded/1' })

    expect(route?.handler).toBe(GuardedController.prototype.guarded)
  })

  it('returns undefined when no route handles the id', () => {
    expect(resolveRoute(App, { type: CommandType.BUTTON, customId: 'hsr-characters-element/111/8' })).toBeUndefined()
    expect(resolveRoute(App, { type: CommandType.MODAL_SUBMIT, customId: 'gi-profile/summary/111/8' })).toBeUndefined()
  })

  it('rejects command types routed by name', () => {
    expect(() => resolveRoute(App, { type: CommandType.SLASH as never, customId: 'ping' })).toThrow('routed by name')
  })

  it('rejects a class not decorated with @MeoCord', () => {
    expect(() => resolveRoute(BroadController, { type: CommandType.BUTTON, customId: 'x' })).toThrow('@MeoCord()')
  })
})

describe('findRouteConflicts', () => {
  it('returns nothing when every id reaches one pattern', () => {
    expect(findRouteConflicts(App)).toEqual([])
  })

  it('reports patterns of one component type that can match the same id', () => {
    @Controller()
    class Overlapping {
      @Command('a/{x}/c', CommandType.BUTTON)
      async left(_i: unknown, _params: Record<string, string>) {}

      @Command('a/b/{y}', CommandType.BUTTON)
      async right(_i: unknown, _params: Record<string, string>) {}

      // Same shape, another type: never in competition with the buttons.
      @Command('a/b/{z}', CommandType.MODAL_SUBMIT)
      async modal(_i: unknown, _params: Record<string, string>) {}
    }

    @MeoCord({ controllers: [Overlapping], clientOptions: { intents: [] } })
    class OverlappingApp {}

    expect(findRouteConflicts(OverlappingApp)).toEqual([{ type: CommandType.BUTTON, patterns: ['a/{x}/c', 'a/b/{y}'] }])
  })
})
