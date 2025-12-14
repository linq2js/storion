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
  StoreSpec,
  PropertyConfig,
  SetupContext,
  StoreOptions,
  StoreResolver,
  StoreContainer,
  ContainerOptions,
  StoreMiddleware,
  SelectorContext,
  Selector,
  StableResult,
} from "./types";

// Core functions
export { store } from "./core/store";
export { container } from "./core/container";
export { batch, untrack } from "./core/tracking";

export {
  effect,
  type EffectFn,
  type EffectOptions,
  type EffectErrorStrategy,
  type EffectErrorContext,
  type EffectRetryConfig,
} from "./core/effect";
