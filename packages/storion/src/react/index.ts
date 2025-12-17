/**
 * Storion React Integration
 *
 * Provides React hooks and components for using Storion stores.
 */

// Context and Provider
export { StoreProvider, useContainer } from "./context";

// Hooks
export { useStore } from "./useStore";
export { type LocalStoreResult } from "./useLocalStore";
export {
  withStore,
  type WithStoreHook,
  type WithStoreRender,
  type WithStoreRenderWithRef,
  type WithStoreOptions,
} from "./withStore";

// Shorthand
export {
  create,
  type CreateSelector,
  type UseCreatedStore,
  type CreateResult,
} from "./create";

// Re-export core functions for convenience
export * from "../index";
