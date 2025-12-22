/**
 * Storion Persist Module
 *
 * Provides middleware for persisting store state to external storage.
 *
 * @packageDocumentation
 */

export {
  persist,
  /** @deprecated Use `persist` instead */
  persist as persistMiddleware,
  notPersisted,
  type PersistOptions,
  type PersistLoadResult,
} from "./persist";

