# Testing: Mock Interactions & `overrideGuard` Design

**Date:** 2026-04-12
**Scope:** `src/testing/`

## Problem

MeoCord's `@UseGuard` wraps methods directly at decoration time and validates the first argument with `instanceof BaseInteraction`. This means:

1. Tests that call guarded controller methods must pass a real discord.js interaction instance — plain objects throw.
2. Guards have DI dependencies (`PrometheusService`, `RedisService`, etc.) that testers must wire up even when they don't care about guard logic.
3. There are no public utilities to create mock interactions, leaving users to discover `Object.create(BaseInteraction.prototype)` themselves or hit confusing errors.

## Non-Goals

- Per-type factories for every discord.js interaction class (maintenance trap — discord.js doesn't provide testing utilities for this reason).
- Replicating the full discord.js API surface.
- Changes outside `src/testing/`.

## Solution Overview

Two additions to `src/testing/`:

| Addition | File | Purpose |
|---|---|---|
| `DeepMocked<T>` + `createMockInteraction` | `mock-interaction.ts` | Generic Proxy-based factory for any discord.js class |
| `createChatInputOptions` | `mock-interaction.ts` | Typed options resolver for ChatInput — the one complex case worth a convenience helper |
| `overrideGuard()` | `meocord-testing-module.ts` | Stub guards in the DI container without providing their dependencies |

---

## Section 1: `DeepMocked<T>`

Recursive type transform that maps all methods to `jest.MockedFunction` and all nested objects to `DeepMocked`. Depth cap at 5 prevents infinite recursion on circular discord.js types (e.g. `Guild ↔ GuildMember`).

```ts
type DeepMocked<T, Depth extends number[] = []> = Depth['length'] extends 5
  ? T
  : {
      [K in keyof T]: T[K] extends (...args: infer A) => infer R
        ? jest.MockedFunction<(...args: A) => R>
        : T[K] extends object
          ? DeepMocked<T[K], [...Depth, 0]>
          : T[K]
    }
```

Result: every method carries its real discord.js signature AND the jest mock API (`.mockReturnValue`, `.mockResolvedValue`, etc.). TypeScript autocomplete works for both.

---

## Section 2: `createMockInteraction`

```ts
function createMockInteraction<T extends object>(
  Class: new (...args: any[]) => T,
): DeepMocked<T>
```

**Runtime:** `Object.create(Class.prototype)` preserves the full prototype chain so `instanceof` checks at every level pass. A `Proxy` wraps the instance and intercepts property access:

- **Function on prototype** → cached `jest.fn()` on the instance (same reference on repeated access).
- **Nested object / undefined** → nested `Proxy` (enables `interaction.options.getNumber.mockReturnValue(...)`).
- **Primitive** → pass through.
- **Symbol / `constructor` / `toString` / `valueOf`** → pass through to prototype (no stubbing — avoids breaking jest internals).

Direct writes (`interaction.guildId = 'abc'`) create own properties that shadow prototype getters, matching real discord.js usage.

**No per-type maintenance.** Works for any current or future discord.js class:

```ts
createMockInteraction(ButtonInteraction)
createMockInteraction(ModalSubmitInteraction)
createMockInteraction(UserSelectMenuInteraction)   // not in CommandInteractionType — still works
createMockInteraction(SomeNewFutureInteraction)    // discord.js adds it tomorrow — still works
```

---

## Section 3: `createChatInputOptions`

```ts
function createChatInputOptions(opts: ChatInputOptions): DeepMocked<CommandInteractionOptionResolver>
```

```ts
interface ChatInputOptions {
  subcommandGroup?: string | null
  subcommand?: string | null
  [name: string]: string | number | boolean | { id: string } | null | undefined
}
```

Builds a resolver-like object from a plain record. Type routing:

| Value JS type | Getters that return it |
|---|---|
| `number` | `getNumber(name)` AND `getInteger(name)` |
| `string` | `getString(name)` |
| `boolean` | `getBoolean(name)` |
| `{ id: string }` | `getUser`, `getRole`, `getChannel`, `getMember`, `getMentionable` |
| `null` / absent | all getters return `null` |

**`required` parameter is honoured:** `getter(name, true)` throws if the option is absent, matching real discord.js behaviour. This prevents false-positive tests.

**`getSubcommand` / `getSubcommandGroup`:** come from the dedicated fields, not the record. `getter(true)` throws if field is not set; `getter(false)` or `getter()` returns `null`.

Anything not covered (e.g. `getAttachment`, `getMentionable` with non-object) falls through to the Proxy's auto-stub and is configurable with standard jest API.

Usage:
```ts
const interaction = createMockInteraction(ChatInputCommandInteraction)
interaction.options = createChatInputOptions({
  subcommandGroup: 'daily',
  subcommand: 'notes',
  uid: 12345678,
  enabled: true,
})

interaction.options.getSubcommandGroup() // → 'daily'
interaction.options.getNumber('uid')     // → 12345678
interaction.options.getInteger('uid')    // → 12345678
interaction.options.getBoolean('enabled') // → true
interaction.options.getString('uid')     // → null (wrong type)
interaction.options.getNumber('x', true) // → throws (absent + required)
```

---

## Section 4: `overrideGuard()`

Added to `TestingModuleBuilder`, mirrors the existing `overrideProvider` API:

```ts
overrideGuard(
  guard: new (...args: any[]) => GuardInterface,
): { useValue: (stub: Partial<GuardInterface>) => TestingModuleBuilder }
```

**Implementation:** stores overrides in a `Map<GuardClass, stub>`. During `compile()`, binds each override as a constant value in the container before any guard auto-binding occurs. Since `applyGuards` calls `container.get(guard, { autobind: true })`, an already-bound guard returns the stub directly — inversify never attempts to resolve its dependencies.

**Effect:** no need to provide `PrometheusService`, `RedisService`, or any other guard dependency when overriding. Chains fluently with `overrideProvider`.

```ts
MeoCordTestingModule.create({
  controllers: [GenshinSlashController],
  providers: [{ provide: GenshinService, useValue: mockService }],
})
.overrideGuard(MetricsGuard).useValue({ canActivate: () => true })
.overrideGuard(RateLimiterGuard).useValue({ canActivate: () => true })
.compile()
```

---

## Section 5: Testing (`mock-interaction.spec.ts`)

Three test groups:

**`createMockInteraction`**
- `instanceof` passes at every level of the prototype chain (specific class, intermediate, BaseInteraction)
- Methods are `jest.fn()` and configurable with `.mockReturnValue` / `.mockResolvedValue`
- Nested method access auto-stubs (e.g. `interaction.reply`)
- Direct property writes work and take precedence
- Symbols and internal methods pass through without stubbing
- Works for multiple classes: `ButtonInteraction`, `ModalSubmitInteraction`, `StringSelectMenuInteraction`, `MessageReaction`, `Message`

**`createChatInputOptions`**
- Each value type routes to the correct getter
- Wrong-type access returns `null`
- `getNumber` and `getInteger` both return numeric values
- All object getters return `{ id }` values
- `required=true` throws for absent options; `required=false` returns `null`
- `getSubcommand` / `getSubcommandGroup` honour the `required` parameter

**`overrideGuard()`**
- Stub with `canActivate: () => false` prevents method execution
- Stub with `canActivate: () => true` allows method execution
- No DI dependencies needed when guard is overridden
- Multiple guards can be overridden and chain fluently

---

## Public API (`src/testing/index.ts`)

New exports:
```ts
export { createMockInteraction, createChatInputOptions } from './mock-interaction.js'
export type { DeepMocked, ChatInputOptions } from './mock-interaction.js'
```

`TestingModuleBuilder` already exported — `overrideGuard` is additive, no new exports needed.
