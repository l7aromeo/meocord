import * as common from '@src/common/index.js'
import * as core from '@src/core/index.js'
import * as decorator from '@src/decorator/index.js'
import * as enums from '@src/enum/index.js'
import * as testing from '@src/testing/index.js'

// The runtime exports of each entry point. A new name here is a public API addition, and removing
// one breaks applications importing it, so either change is made here on purpose.
const PUBLIC_API: Record<string, string[]> = {
  'meocord/core': ['MeoCordFactory'],
  'meocord/decorator': [
    'Autocomplete',
    'Command',
    'CommandBuilder',
    'Controller',
    'Guard',
    'MeoCord',
    'MessageHandler',
    'ReactionHandler',
    'Service',
    'UseGuard',
  ],
  'meocord/common': ['Logger', 'SetMetadata', 'Theme', 'applyDecorators'],
  'meocord/enum': ['CommandType', 'MetadataKey', 'ReactionHandlerAction'],
  'meocord/testing': [
    'MeoCordTestingModule',
    'TestingModule',
    'TestingModuleBuilder',
    'createChatInputOptions',
    'createMock',
    'createMockChannel',
    'createMockClient',
    'createMockFn',
    'createMockGuild',
    'createMockInteraction',
    'createMockMessage',
    'createMockUser',
    'isMockFunction',
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
