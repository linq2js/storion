/**
 * Storion React Integration
 *
 * Provides React hooks and components for using Storion stores.
 */

// Context and Provider
export { StoreProvider, useContainer } from "./context";

// Hooks
export {
  useStore,
  type UseStoreFn,
  type FromSelector,
  type UseFromStore,
  type FromSelectorWithArgs,
  type UseFromSelectorHook,
} from "./useStore";
export {
  withStore,
  type WithStoreHook,
  type WithStoreRender,
  type WithStoreRenderWithRef,
  type WithStoreOptions,
  type BoundWithStore,
  type GenericWithStoreHook,
  type UseContextHook,
} from "./withStore";

// Shorthand
export {
  create,
  type CreateSelector,
  type UseCreatedStore,
  type CreateResult,
  type CreatedStoreContext,
  type WithCreatedStore,
} from "./create";

// Stabilization HOC
export { stable, type PropEqualityConfig } from "./stable";

// Strict Mode
export { StrictMode, useStrictMode } from "./strictMode";

// Re-export core functions for convenience
export * from "../index";
