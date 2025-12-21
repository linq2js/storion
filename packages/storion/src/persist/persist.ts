/**
 * Persist Middleware for Storion
 *
 * Provides automatic state persistence and hydration for stores.
 */

import type { StoreSpec, StoreMiddleware } from "../types";
import { meta } from "../meta/meta";
import { isPromiseLike } from "../utils/isPromiseLike";

/**
 * Mark stores or fields as not persisted.
 *
 * When called without arguments, marks the entire store as not persisted.
 * When called with a field name, marks that specific field as not persisted.
 *
 * @example Store-level exclusion
 * ```ts
 * import { notPersisted } from 'storion/persist';
 *
 * const tempStore = store({
 *   name: 'temp',
 *   state: { sessionData: {} },
 *   setup: () => ({}),
 *   meta: [notPersisted()],  // entire store skipped
 * });
 * ```
 *
 * @example Field-level exclusion
 * ```ts
 * import { notPersisted } from 'storion/persist';
 *
 * const userStore = store({
 *   name: 'user',
 *   state: { name: '', password: '', token: '' },
 *   setup: () => ({}),
 *   meta: [
 *     notPersisted('password'),
 *     notPersisted('token'),
 *   ],
 * });
 * ```
 */
export const notPersisted = meta();

/**
 * Result from load function - can be sync or async
 */
export type PersistLoadResult =
  | Record<string, unknown>
  | null
  | undefined
  | Promise<Record<string, unknown> | null | undefined>;

/**
 * Options for persist middleware
 */
export interface PersistOptions {
  /**
   * Filter which stores should be persisted.
   * If not provided, all stores are persisted.
   *
   * @param spec - The store specification
   * @returns true to persist, false to skip
   */
  filter?: (spec: StoreSpec) => boolean;

  /**
   * Load persisted state for a store.
   * Can return sync or async result.
   *
   * @param spec - The store specification
   * @returns The persisted state, null/undefined if not found, or a Promise
   */
  load?: (spec: StoreSpec) => PersistLoadResult;

  /**
   * Save state to persistent storage.
   *
   * @param spec - The store specification
   * @param state - The dehydrated state to save
   */
  save?: (spec: StoreSpec, state: Record<string, unknown>) => void;

  /**
   * Called when an error occurs during load or save.
   *
   * @param spec - The store specification
   * @param error - The error that occurred
   * @param operation - Whether the error occurred during 'load' or 'save'
   */
  onError?: (
    spec: StoreSpec,
    error: unknown,
    operation: "load" | "save"
  ) => void;

  /**
   * Force hydration to overwrite dirty (modified) state properties.
   *
   * By default (false), hydrate() skips properties that have been modified
   * since initialization to avoid overwriting fresh data with stale persisted data.
   *
   * Set to true to always apply persisted data regardless of dirty state.
   *
   * @default false
   */
  force?: boolean;
}

/**
 * Creates a persist middleware that automatically saves and restores store state.
 *
 * @example
 * ```ts
 * import { container } from "storion";
 * import { persistMiddleware } from "storion/persist";
 *
 * const app = container({
 *   middleware: persistMiddleware({
 *     load: (spec) => {
 *       const key = `storion:${spec.displayName}`;
 *       const data = localStorage.getItem(key);
 *       return data ? JSON.parse(data) : null;
 *     },
 *     save: (spec, state) => {
 *       const key = `storion:${spec.displayName}`;
 *       localStorage.setItem(key, JSON.stringify(state));
 *     },
 *     onError: (spec, error, op) => {
 *       console.error(`Persist ${op} error for ${spec.displayName}:`, error);
 *     },
 *   }),
 * });
 * ```
 *
 * @example Async load (e.g., IndexedDB)
 * ```ts
 * persistMiddleware({
 *   load: async (spec) => {
 *     const db = await openDB();
 *     return db.get('stores', spec.displayName);
 *   },
 *   save: (spec, state) => {
 *     openDB().then(db => db.put('stores', state, spec.displayName));
 *   },
 * });
 * ```
 */
export function persistMiddleware(options: PersistOptions): StoreMiddleware {
  const { filter, load, save, onError, force = false } = options;

  return ({ spec, next, meta }) => {
    // Call next() to create the instance
    const instance = next();

    // Skip if filter returns false
    if (filter && !filter(spec)) {
      return instance;
    }

    // Check meta for notPersisted
    // Note: spec.meta is raw MetaEntry[] from store options
    const notPersistedInfo = meta(notPersisted);

    // Skip entire store if marked as notPersisted at store level
    if (notPersistedInfo.store === true) {
      return instance;
    }

    // Get fields to exclude from persistence
    const excludedFields = new Set(
      Object.keys(notPersistedInfo.fields).filter(
        (field) => notPersistedInfo.fields[field] === true
      )
    );

    // Filter out excluded fields from state
    const filterState = (
      state: Record<string, unknown>
    ): Record<string, unknown> => {
      if (excludedFields.size === 0) return state;

      const filtered: Record<string, unknown> = {};

      for (const key in state) {
        if (!excludedFields.has(key)) {
          filtered[key] = state[key];
        }
      }

      return filtered;
    };

    // Hydrate with loaded state
    const hydrateWithState = (
      state: Record<string, unknown> | null | undefined
    ) => {
      if (state != null) {
        try {
          // Filter out excluded fields before hydrating
          instance.hydrate(filterState(state), { force });
        } catch (error) {
          onError?.(spec, error, "load");
        }
      }
    };

    // Load persisted state
    try {
      const loadResult = load?.(spec);

      if (loadResult) {
        if (isPromiseLike(loadResult)) {
          // Async: hydrate when promise resolves
          loadResult.then(
            (state) => hydrateWithState(state),
            (error) => onError?.(spec, error, "load")
          );
        } else {
          // Sync: hydrate immediately
          hydrateWithState(loadResult);
        }
      }
    } catch (error) {
      onError?.(spec, error, "load");
    }

    // Setup save subscription immediately so state changes during loading are saved
    if (save) {
      instance.subscribe(() => {
        try {
          const state = instance.dehydrate();
          // Filter out excluded fields before saving.
          // Note: If all fields are excluded, filterState returns {}.
          // We still call save({}) to let consumers decide how to handle:
          // - Save empty object to storage
          // - Skip saving entirely (just return)
          // - Delete from storage (e.g., localStorage.removeItem)
          save(spec, filterState(state));
        } catch (error) {
          onError?.(spec, error, "save");
        }
      });
    }

    return instance;
  };
}
