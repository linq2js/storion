/**
 * Storion - Type-safe reactive state management
 *
 * @packageDocumentation
 */

// Core types
export {
  STORION_TYPE,
  type StorionKind,
  type StorionObject,
  type StateBase,
  type ActionsBase,
  type Equality,
  type EqualityMap,
  type Lifetime,
  type DispatchEvent,
  type ActionDispatchEvent,
  type ReactiveAction,
  type ReactiveActions,
  type StoreSpec,
  type StoreContext,
  type StoreMixin,
  type StoreOptions,
  type StoreInstance,
  type StoreContainer,
  type ContainerOptions,
  type StoreMiddleware,
  type SelectorContext,
  type SelectorMixin,
  type Selector,
  type StoreTuple,
  type StableResult,
  type PickEquality,
  // Focus (lens-like accessors)
  type StatePath,
  type PathValue,
  type Focus,
  type FocusOptions,
  type FocusChangeEvent,
  type NonNullish,
  // Resolver types
  type Factory,
  type Middleware,
  type MiddlewareContext,
  type Resolver,
  type ResolverOptions,
  // Meta types
  type MetaType,
  type MetaInfo,
  type SingleMetaInfo,
  type MultipleMetaInfo,
} from "./types";

// Type guards
export {
  is,
  isStorion,
  getKind,
  isSpec,
  isContainer,
  isStore,
  isFocus,
  isAction,
  isStoreContext,
  isSelectorContext,
} from "./is";

// Core functions
export { store } from "./core/store";
export { container } from "./core/container";
export { batch, untrack } from "./core/tracking";

// Resolver (factory-based DI)
export {
  createResolver,
  when,
  createLoggingMiddleware,
  createValidationMiddleware,
} from "./core/createResolver";

// Fine-grained reactivity
export { pick } from "./core/pick";

export {
  effect,
  type EffectFn,
  type EffectContext,
  type EffectOptions,
  type EffectErrorStrategy,
  type EffectErrorContext,
  type EffectRetryConfig,
} from "./core/effect";

// Middleware utilities
export {
  applyFor,
  applyExcept,
  forStores,
  type SpecPattern,
} from "./core/middleware";

// Equality utilities
export {
  equality,
  shallowEqual,
  deepEqual,
  strictEqual,
} from "./core/equality";

// Trigger utility
export { trigger, type TriggerOptions } from "./trigger";

// Function wrapper utility
export { wrapFn as wrapFn, unwrapFn, isWrappedFn } from "./core/fnWrapper";

// Error classes
export {
  StorionError,
  SetupPhaseError,
  LifetimeMismatchError,
  AsyncFunctionError,
  StoreDisposedError,
  InvalidActionError,
  HooksContextError,
  ProviderMissingError,
  LocalStoreDependencyError,
  EffectRefreshError,
} from "./errors";

// Meta utilities
export { meta } from "./meta/meta";
export { withMeta } from "./meta/withMeta";
