/**
 * Store - Re-exports store spec and instance creation.
 *
 * This module provides the main entry point for creating stores:
 * - `store()` - Creates store specifications
 * - `createStoreInstance()` - Creates store instances (internal)
 */

// Re-export store spec factory
export { store } from "./storeSpec";

// Re-export store instance factory and types
export {
  createStoreInstance,
  type CreateStoreInstanceOptions,
} from "./storeInstance";
