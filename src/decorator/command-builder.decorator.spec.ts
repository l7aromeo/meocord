/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import { CommandBuilder } from '@src/decorator/command-builder.decorator.js'
import { MetadataKey } from '@src/enum/index.js'
import { CommandType } from '@src/enum/index.js'
describe('@CommandBuilder', () => {
  it('sets commandType metadata on the class', () => {
    @CommandBuilder(CommandType.SLASH)
    class SlashCmd {
      build() {
        return {} as any
      }
    }

    expect(Reflect.getMetadata(MetadataKey.CommandType, SlashCmd)).toBe(CommandType.SLASH)
  })

  it('sets CONTEXT_MENU commandType', () => {
    @CommandBuilder(CommandType.CONTEXT_MENU)
    class ContextCmd {
      build() {
        return {} as any
      }
    }

    expect(Reflect.getMetadata(MetadataKey.CommandType, ContextCmd)).toBe(CommandType.CONTEXT_MENU)
  })

  it('makes the class inversify-injectable', () => {
    @CommandBuilder(CommandType.SLASH)
    class TestCmd {
      build() {
        return {} as any
      }
    }

    expect(Reflect.getMetadata(MetadataKey.Injectable, TestCmd)).toBe(true)
  })

  it('does not throw when applied to an already-injectable class', () => {
    expect(() => {
      @CommandBuilder(CommandType.SLASH)
      @CommandBuilder(CommandType.SLASH)

      //@ts-ignore
      class _TestCmd {
        build() {
          return {} as any
        }
      }
    }).not.toThrow()
  })
})
