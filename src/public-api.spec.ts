import * as common from '@src/common/index.js'
import * as core from '@src/core/index.js'
import * as decorator from '@src/decorator/index.js'
import * as enums from '@src/enum/index.js'
import * as testing from '@src/testing/index.js'

// The runtime exports of each entry point. A new name here is a public API addition, and removing
// one breaks applications importing it, so either change is made here on purpose.
const PUBLIC_API: Record<string, string[]> = {
  'meocord/core': ['HandlerRegistry', 'MeoCordFactory'],
  'meocord/decorator': [
    'Autocomplete',
    'Catch',
    'Command',
    'CommandBuilder',
    'Controller',
    'Guard',
    'Interceptor',
    'MeoCord',
    'MessageHandler',
    'On',
    'Once',
    'Pipe',
    'ReactionHandler',
    'Service',
    'UseFilter',
    'UseGuard',
    'UseInterceptor',
    'UsePipe',
    'Validate',
  ],
  'meocord/common': [
    'CommandNotFoundError',
    'ExecutionContext',
    'GuardDeniedError',
    'Logger',
    'SetMetadata',
    'Theme',
    'ValidationError',
    'applyDecorators',
    'createMetadata',
  ],
  'meocord/enum': ['CommandType', 'MetadataKey', 'ReactionHandlerAction'],
  'meocord/testing': [
    'MeoCordTestingModule',
    'TestingModule',
    'TestingModuleBuilder',
    'createChatInputOptions',
    'createExecutionContext',
    'createMock',
    'createMockChannel',
    'createMockClient',
    'createMockFn',
    'createMockGuild',
    'createMockInteraction',
    'createMockMessage',
    'createMockUser',
    'createModalFields',
    'findRouteConflicts',
    'inspectHandler',
    'isMockFunction',
    'resolveRoute',
  ],
}

const modules: Record<string, object> = {
  'meocord/core': core,
  'meocord/decorator': decorator,
  'meocord/common': common,
  'meocord/enum': enums,
  'meocord/testing': testing,
}

describe('public API', () => {
  it.each(Object.keys(PUBLIC_API))('%s exports exactly its public names', entry => {
    expect(Object.keys(modules[entry]).sort()).toEqual([...PUBLIC_API[entry]].sort())
  })
})
