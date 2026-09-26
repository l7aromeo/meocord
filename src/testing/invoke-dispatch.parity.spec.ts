import { Controller, MessageHandler } from '@src/decorator/index.js'
import { type MessageCommandOptions } from '@src/interface/index.js'
import { buildMessageRoutes, matchMessageCommand, matchMessageRoute, messageParamsFor, messageStarts } from '@src/core/message-routes.js'
import { type ControllerClass } from '@src/core/component-routes.js'
import { createMockMessage } from '@src/testing/index.js'

/*
 * invoke must take a message for exactly the handler dispatch gives it to: the one it matches, or the one
 * whose usage it answers. Random handler sets across controllers and random messages check that, with
 * dispatch's own choice as the definition.
 */

/** A small seeded generator (mulberry32), so a failure reproduces from its seed. */
function random(seed: number) {
  let state = seed >>> 0
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return { next, pick: <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)] }
}

const WORDS = ['roll', 'ban', 'a', 'x']
const BOT = '1300000000000000000'

function controllersFor(r: ReturnType<typeof random>): ControllerClass[] {
  const controllers: ControllerClass[] = []
  for (let c = 0; c < 2; c++) {
    @Controller()
    class Generated {}
    Object.defineProperty(Generated, 'name', { value: `C${c}` })
    const count = 1 + Math.floor(r.next() * 4)
    for (let i = 0; i < count; i++) {
      const method = `h${i}`
      ;(Generated.prototype as Record<string, unknown>)[method] = () => undefined
      const words = [r.pick(WORDS)]
      for (let w = 1; w < 1 + Math.floor(r.next() * 3); w++) words.push(r.next() < 0.5 ? r.pick(WORDS) : r.next() < 0.8 ? `{p${w}}` : `{p${w}:int}`)
      if (r.next() < 0.3) words.push(r.pick(['{--f}', '{--n:int?}']))
      const prefix = r.pick([undefined, undefined, '?', false] as const)
      MessageHandler(words.join(' '), prefix === undefined ? {} : { prefix })(
        Generated.prototype,
        method,
        Object.getOwnPropertyDescriptor(Generated.prototype, method) as never,
      )
    }
    controllers.push(Generated as ControllerClass)
  }
  return controllers
}

describe("invoke's message check", () => {
  it('accepts a message for exactly the handler dispatch gives it to', async () => {
    const options: MessageCommandOptions = { prefix: '!', mention: true }
    let compared = 0
    for (let seed = 1; seed <= 150; seed++) {
      const r = random(seed)
      const controllers = controllersFor(r)
      let routes
      try {
        routes = buildMessageRoutes(controllers, options)
      } catch {
        // Two generated patterns that match the same messages: a set dispatch would refuse
        continue
      }
      for (let m = 0; m < 25; m++) {
        const words = Array.from({ length: 1 + Math.floor(r.next() * 4) }, () => r.pick([...WORDS, '5', '--f', '--n=3']))
        const message = createMockMessage({ content: r.pick(['!', '?', '', `<@${BOT}> `]) + words.join(' ') })
        Object.defineProperty(message.client, 'user', { value: { id: BOT }, configurable: true })
        const starts = await messageStarts(options, message, BOT)
        const chosen = matchMessageRoute(routes, message.content, starts) ?? matchMessageCommand(routes, message.content, starts)
        const dispatches = chosen && `${chosen.route.controllerClass.name}.${chosen.route.method}`
        for (const controller of controllers) {
          for (const method of Object.getOwnPropertyNames(controller.prototype).filter(name => name !== 'constructor')) {
            const input = await messageParamsFor(controller, method, message, options, controllers)
            const accepts = input !== undefined && !('mismatch' in input)
            expect([seed, message.content, `${controller.name}.${method}`, accepts]).toEqual([
              seed,
              message.content,
              `${controller.name}.${method}`,
              dispatches === `${controller.name}.${method}`,
            ])
            compared++
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(10_000)
  })
})
