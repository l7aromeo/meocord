import { ButtonInteraction } from 'discord.js'
import { createMetadata } from '@src/common/metadata.js'
import { createExecutionContext, createMockInteraction, createMockMessage } from '@src/testing/index.js'

const Owner = createMetadata<string>('owner')

@Owner('controller')
class ProfileController {
  @Owner('method')
  show() {}
}

describe('createExecutionContext', () => {
  it('builds the context a guard receives for the handler', () => {
    const interaction = createMockInteraction(ButtonInteraction)
    const context = createExecutionContext(ProfileController, 'show', { args: [interaction], params: { limit: 2 } })

    expect(context.get(Owner)).toBe('method')
    expect(context.getAll(Owner)).toEqual(['method', 'controller'])
    expect(context.getInteraction()).toBe(interaction)
    expect(context.getType()).toBe('interaction')
    expect(context.getParams()).toEqual({ limit: 2 })
    expect(context.getHandler()).toBe(ProfileController.prototype.show)
  })

  it('takes the type when the arguments do not show it', () => {
    expect(createExecutionContext(ProfileController, 'show', { type: 'event' }).getType()).toBe('event')
    expect(createExecutionContext(ProfileController, 'show').getArgs()).toEqual([])
  })

  it('reads a message as the call it describes, and reports no params when none were given', () => {
    const message = createMockMessage()
    const context = createExecutionContext(ProfileController, 'show', { args: [message] })

    expect(context.getType()).toBe('message')
    expect(context.getMessage()).toBe(message)
    expect(context.getInteraction()).toBeUndefined()
    expect(context.getParams()).toBeUndefined()
  })
})

