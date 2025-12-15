/**
 * Storion - Type-safe reactive state management
 *
 * @packageDocumentation
 */

// Core types
export type {
  StateBase,
  ActionsBase,
  Equality,
  EqualityMap,
  Lifetime,
  DispatchEvent,
  ActionDispatchEvent,
  ReactiveAction,
  ReactiveActions,
  StoreMeta,
  StoreSpec,
  StoreContext,
  StoreMixin,
  StoreOptions,
  StoreInstance,
  StoreResolver,
  StoreContainer,
  ContainerOptions,
  StoreMiddleware,
  SelectorContext,
  SelectorMixin,
  Selector,
  StableResult,
} from "./types";

// Core functions
export { store } from "./core/store";
export { container } from "./core/container";
export { batch, untrack } from "./core/tracking";
export { pick, type PickEquality } from "./core/pick";

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
  compose,
  type SpecPattern,
} from "./core/middleware";
