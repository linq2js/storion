/**
 * Persist Middleware for Storion
 *
 * Provides automatic state persistence and hydration for stores.
 */

import type { StoreMiddleware, StoreMiddlewareContext } from "../types";
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
   * @param context - The middleware context
   * @returns true to persist, false to skip
   */
  filter?: (context: StoreMiddlewareContext) => boolean;

  /**
   * Filter which fields should be persisted.
   * If not provided, all fields are persisted.
   *
   * @param context - The middleware context
   * @returns the fields to persist
   */
  fields?: (context: StoreMiddlewareContext) => string[];

  /**
   * Load persisted state for a store.
   * Can return sync or async result.
   *
   * @param context - The middleware context
   * @returns The persisted state, null/undefined if not found, or a Promise
   */
  load?: (context: StoreMiddlewareContext) => PersistLoadResult;

  /**
   * Save state to persistent storage.
   *
   * @param context - The middleware context
   * @param state - The dehydrated state to save
   */
  save?: (
    context: StoreMiddlewareContext,
    state: Record<string, unknown>
  ) => void;

  /**
   * Called when an error occurs during load or save.
   *
   * @param context - The middleware context
   * @param error - The error that occurred
   * @param operation - Whether the error occurred during 'load' or 'save'
   */
  onError?: (
    context: StoreMiddlewareContext,
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
 *   middleware: [persistMiddleware({
 *     load: (ctx) => {
 *       const key = `storion:${ctx.spec.displayName}`;
 *       const data = localStorage.getItem(key);
 *       return data ? JSON.parse(data) : null;
 *     },
 *     save: (ctx, state) => {
 *       const key = `storion:${ctx.spec.displayName}`;
 *       localStorage.setItem(key, JSON.stringify(state));
 *     },
 *     onError: (ctx, error, op) => {
 *       console.error(`Persist ${op} error for ${ctx.spec.displayName}:`, error);
 *     },
 *   })],
 * });
 * ```
 *
 * @example Async load (e.g., IndexedDB)
 * ```ts
 * persistMiddleware({
 *   load: async (ctx) => {
 *     const db = await openDB();
 *     return db.get('stores', ctx.spec.displayName);
 *   },
 *   save: (ctx, state) => {
 *     openDB().then(db => db.put('stores', state, ctx.spec.displayName));
 *   },
 * });
 * ```
 *
 * @example Using meta in callbacks
 * ```ts
 * import { meta } from "storion";
 *
 * const persistKey = meta<string>();
 *
 * persistMiddleware({
 *   load: (ctx) => {
 *     // Use custom key from meta, fallback to displayName
 *     const customKey = ctx.meta(persistKey).store;
 *     const key = customKey ?? ctx.spec.displayName;
 *     return JSON.parse(localStorage.getItem(key) || 'null');
 *   },
 *   save: (ctx, state) => {
 *     const customKey = ctx.meta(persistKey).store;
 *     const key = customKey ?? ctx.spec.displayName;
 *     localStorage.setItem(key, JSON.stringify(state));
 *   },
 * });
 * ```
 */
export function persistMiddleware(options: PersistOptions): StoreMiddleware {
  const { filter, fields, load, save, onError, force = false } = options;

  return (context) => {
    const { next, meta } = context;
    // Call next() to create the instance
    const instance = next();

    // Skip if filter returns false
    if (filter && !filter(context)) {
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

    const stateFields = fields?.(context) ?? (context.spec.fields as string[]);

    // Skip if no fields to persist
    if (stateFields.length === 0) {
      return instance;
    }

    // Check if all state fields are excluded - if so, skip persistence entirely
    // This is effectively the same as store-level notPersisted()
    if (excludedFields.size > 0) {
      const allExcluded =
        stateFields.length > 0 &&
        stateFields.every((field) => excludedFields.has(field));
      if (allExcluded) {
        // All fields are excluded, nothing to persist
        return instance;
      }
    }

    // Convert stateFields to a Set for efficient lookup
    const includedFields = new Set(stateFields);

    // Filter state to only include specified fields, excluding notPersisted fields
    const filterState = (
      state: Record<string, unknown>
    ): Record<string, unknown> => {
      const filtered: Record<string, unknown> = {};

      for (const key in state) {
        // Only include if field is in includedFields AND not in excludedFields
        if (includedFields.has(key) && !excludedFields.has(key)) {
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
          onError?.(context, error, "load");
        }
      }
    };

    // Load persisted state
    try {
      const loadResult = load?.(context);

      if (loadResult) {
        if (isPromiseLike(loadResult)) {
          // Async: hydrate when promise resolves
          loadResult.then(
            (state) => hydrateWithState(state),
            (error) => onError?.(context, error, "load")
          );
        } else {
          // Sync: hydrate immediately
          hydrateWithState(loadResult);
        }
      }
    } catch (error) {
      onError?.(context, error, "load");
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
          save(context, filterState(state));
        } catch (error) {
          onError?.(context, error, "save");
        }
      });
    }

    return instance;
  };
}
