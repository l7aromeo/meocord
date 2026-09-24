export { Logger } from '@src/common/logger.js'
export { Theme } from '@src/common/theme.js'
export { applyDecorators, SetMetadata } from '@src/common/decorator.js'
export { createMetadata } from '@src/common/metadata.js'
export type { MetadataDecorator } from '@src/common/metadata.js'
export { ExecutionContext } from '@src/common/execution-context.js'
export type { ExecutionContextType } from '@src/common/execution-context.js'
export { CommandNotFoundError, GuardDeniedError, ValidationError } from '@src/common/errors.js'
export { createTranslator, defineCatalog, Translator } from '@src/common/translator.js'
export type {
  CatalogShape,
  LocaleCatalog,
  MessageKey,
  MessageParams,
  PluralCategory,
  PluralMessage,
  StringMessageKey,
  Translate,
} from '@src/common/translator.js'
export type { ValidationIssue } from '@src/common/errors.js'
