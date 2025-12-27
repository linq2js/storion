/**
 * Storion - Type-safe reactive state management
 *
 * @packageDocumentation
 */

// Core types
export * from "./types";

// Type guards
export { is } from "./is";

// Core functions
export { store } from "./core/store";
export { container } from "./core/container";
export { batch, untrack } from "./core/tracking";

// Resolver (factory-based DI)
export { createResolver as resolver } from "./core/createResolver";

// Fine-grained reactivity
export { pick } from "./core/pick";

// Focus helpers
export {
  list,
  map,
  disposalGroup,
  getNamedGroup,
  // Reducer helpers
  toggle,
  increment,
  decrement,
  multiply,
  divide,
  clamp,
  append,
  prepend,
  merge,
  reset,
  // Types
  type ListOptions,
  type MapOptions,
  type FocusList,
  type FocusMap,
  type DisposalGroup,
  type FocusAutoDispose,
  type FocusAutoDisposeOptions,
} from "./core/focusHelpers";

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
  type MiddlewareMap,
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
export { pool } from "./pool";

// Mixin composition
export { mixins } from "./core/mixins";
