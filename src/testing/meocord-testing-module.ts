/**
 * MeoCord Framework
 * Copyright (c) 2025 Ukasyah Rahmatullah Zada
 * SPDX-License-Identifier: MIT
 */

import 'reflect-metadata'
import { Container, injectable, type ServiceIdentifier } from 'inversify'
import { MetadataKey } from '@src/enum/index.js'

export interface ValueProvider<T = any> {
  provide: ServiceIdentifier<T>
  useValue: T
}

export interface ClassProvider<T = any> {
  provide: ServiceIdentifier<T>
  useClass: new (...args: any[]) => T
}

export type Provider<T = any> = ValueProvider<T> | ClassProvider<T>

export interface TestingModuleOptions {
  controllers?: (new (...args: any[]) => any)[]
  providers?: Provider[]
}

function isValueProvider(p: Provider): p is ValueProvider {
  return 'useValue' in p
}

/**
 * Resolved test module. Retrieve instances via `.get()`.
 */
export class TestingModule {
  constructor(private readonly container: Container) {}

  get<T>(token: ServiceIdentifier<T>): T {
    return this.container.get<T>(token)
  }
}

/**
 * Builder returned by `MeoCordTestingModule.create()`.
 * Call `.compile()` to get the resolved `TestingModule`.
 */
export class TestingModuleBuilder {
  private readonly overrides = new Map<ServiceIdentifier, Provider>()

  constructor(private readonly options: TestingModuleOptions) {}

  overrideProvider<T>(token: ServiceIdentifier<T>): { useValue: (value: T) => TestingModuleBuilder } {
    return {
      useValue: (value: T) => {
        this.overrides.set(token, { provide: token, useValue: value })
        return this
      },
    }
  }

  compile(): TestingModule {
    const container = new Container()

    // Merge explicit providers with overrides (overrides win)
    const providers = new Map<ServiceIdentifier, Provider>()
    for (const p of this.options.providers ?? []) {
      providers.set(p.provide, p)
    }
    for (const [token, override] of this.overrides) {
      providers.set(token, override)
    }

    // Bind explicit providers
    for (const provider of providers.values()) {
      if (isValueProvider(provider)) {
        container.bind(provider.provide).toConstantValue(provider.useValue)
      } else {
        const cls = provider.useClass
        if (!Reflect.hasMetadata(MetadataKey.Injectable, cls)) {
          injectable()(cls)
        }
        container.bind(provider.provide).to(cls).inSingletonScope()
      }
    }

    // Recursively bind controllers and their dependencies, skipping already-bound tokens
    const bindClass = (cls: new (...args: any[]) => any) => {
      if (container.isBound(cls)) return

      if (!Reflect.hasMetadata(MetadataKey.Injectable, cls)) {
        injectable()(cls)
      }
      container.bind(cls).toSelf().inSingletonScope()

      const deps: any[] = Reflect.getMetadata(MetadataKey.ParamTypes, cls) || []
      for (const dep of deps) {
        bindClass(dep)
      }
    }

    for (const ctrl of this.options.controllers ?? []) {
      bindClass(ctrl)
      // Stamp container on controller class so @UseGuard works in tests too
      Reflect.defineMetadata(MetadataKey.Container, container, ctrl)
    }

    return new TestingModule(container)
  }
}

/**
 * Entry point for building isolated test modules.
 *
 * @example
 * ```typescript
 * const module = MeoCordTestingModule.create({
 *   controllers: [PingController],
 *   providers: [
 *     { provide: PingService, useValue: { handlePing: jest.fn().mockResolvedValue('pong') } },
 *   ],
 * }).compile()
 *
 * const controller = module.get(PingController)
 * ```
 */
export class MeoCordTestingModule {
  static create(options: TestingModuleOptions): TestingModuleBuilder {
    return new TestingModuleBuilder(options)
  }
}
