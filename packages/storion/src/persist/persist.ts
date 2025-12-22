/**
 * Persist Middleware for Storion
 *
 * Provides automatic state persistence and hydration for stores.
 */

import type {
  StoreMiddleware,
  StoreMiddlewareContext,
  StoreInstance,
} from "../types";
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
 *     notPersisted.for('password'),
 *     notPersisted.for('token'),
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
 * Context passed to the handler function.
 * Extends StoreMiddlewareContext with the created store instance.
 */
export interface PersistContext extends StoreMiddlewareContext {
  /** The store instance being persisted */
  store: StoreInstance;
}

/**
 * Handler returned by the handler function.
 * Contains the load and save operations for a specific store.
 */
export interface PersistHandler {
  /**
   * Load persisted state for the store.
   * Can return sync or async result.
   *
   * @returns The persisted state, null/undefined if not found, or a Promise
   */
  load?: () => PersistLoadResult;

  /**
   * Save state to persistent storage.
   *
   * @param state - The dehydrated state to save
   */
  save?: (state: Record<string, unknown>) => void;
}

/**
 * Options for persist middleware
 */
export interface PersistOptions {
  /**
   * Filter which stores should be persisted.
   * If not provided, all stores are persisted.
   *
   * @param context - The persist context with store instance
   * @returns true to persist, false to skip
   */
  filter?: (context: PersistContext) => boolean;

  /**
   * Filter which fields should be persisted.
   * If not provided, all fields are persisted.
   *
   * @param context - The persist context with store instance
   * @returns the fields to persist
   */
  fields?: (context: PersistContext) => string[];

  /**
   * Handler factory that creates load/save operations for each store.
   * Receives context with store instance, returns handler with load/save.
   * Can be sync or async (e.g., for IndexedDB initialization).
   *
   * @param context - The persist context with store instance
   * @returns Handler with load/save operations, or Promise of handler
   *
   * @example Sync handler (localStorage)
   * ```ts
   * handler: (ctx) => {
   *   const key = `app:${ctx.displayName}`;
   *   return {
   *     load: () => JSON.parse(localStorage.getItem(key) || 'null'),
   *     save: (state) => localStorage.setItem(key, JSON.stringify(state)),
   *   };
   * }
   * ```
   *
   * @example Async handler (IndexedDB)
   * ```ts
   * handler: async (ctx) => {
   *   const db = await openDB('app-db');
   *   return {
   *     load: () => db.get('stores', ctx.displayName),
   *     save: (state) => db.put('stores', state, ctx.displayName),
   *   };
   * }
   * ```
   */
  handler: (
    context: PersistContext
  ) => PersistHandler | PromiseLike<PersistHandler>;

  /**
   * Called when an error occurs during init, load, or save.
   *
   * @param error - The error that occurred
   * @param operation - Whether the error occurred during 'init', 'load', or 'save'
   */
  onError?: (error: unknown, operation: "init" | "load" | "save") => void;

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
 * @example localStorage (sync handler)
 * ```ts
 * import { container, forStores } from "storion";
 * import { persist } from "storion/persist";
 *
 * const app = container({
 *   middleware: forStores([
 *     persist({
 *       handler: (ctx) => {
 *         const key = `app:${ctx.displayName}`;
 *         return {
 *           load: () => JSON.parse(localStorage.getItem(key) || 'null'),
 *           save: (state) => localStorage.setItem(key, JSON.stringify(state)),
 *         };
 *       },
 *       onError: (error, op) => console.error(`Persist ${op} failed:`, error),
 *     }),
 *   ]),
 * });
 * ```
 *
 * @example IndexedDB (async handler)
 * ```ts
 * persist({
 *   handler: async (ctx) => {
 *     const db = await openDB('app-db', 1, {
 *       upgrade(db) { db.createObjectStore('stores'); },
 *     });
 *     return {
 *       load: () => db.get('stores', ctx.displayName),
 *       save: (state) => db.put('stores', state, ctx.displayName),
 *     };
 *   },
 * });
 * ```
 *
 * @example With shared debounce
 * ```ts
 * persist({
 *   handler: (ctx) => {
 *     const key = `app:${ctx.displayName}`;
 *     const debouncedSave = debounce(
 *       (s) => localStorage.setItem(key, JSON.stringify(s)),
 *       300
 *     );
 *     return {
 *       load: () => JSON.parse(localStorage.getItem(key) || 'null'),
 *       save: debouncedSave,
 *     };
 *   },
 * });
 * ```
 *
 * @example Multi-storage with meta
 * ```ts
 * const inSession = meta();
 * const inLocal = meta();
 *
 * // Session storage middleware
 * persist({
 *   filter: ({ meta }) => meta.any(inSession),
 *   fields: ({ meta }) => meta.fields(inSession),
 *   handler: (ctx) => {
 *     const key = `session:${ctx.displayName}`;
 *     return {
 *       load: () => JSON.parse(sessionStorage.getItem(key) || 'null'),
 *       save: (state) => sessionStorage.setItem(key, JSON.stringify(state)),
 *     };
 *   },
 * });
 * ```
 */
export function persist(options: PersistOptions): StoreMiddleware {
  const { filter, fields, handler, onError, force = false } = options;

  return (context) => {
    const { next, meta } = context;
    // Call next() to create the instance
    const instance = next();

    // Create persist context with store instance
    const persistContext: PersistContext = {
      ...context,
      store: instance,
    };

    // Skip if filter returns false
    if (filter && !filter(persistContext)) {
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

    const stateFields =
      fields?.(persistContext) ?? (context.spec.fields as string[]);

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

    // Setup persistence with handler result
    const setupPersistence = (persistHandler: PersistHandler) => {
      const { load, save } = persistHandler;

      // Hydrate with loaded state
      const hydrateWithState = (
        state: Record<string, unknown> | null | undefined
      ) => {
        if (state != null) {
          try {
            // Filter out excluded fields before hydrating
            instance.hydrate(filterState(state), { force });
          } catch (error) {
            onError?.(error, "load");
          }
        }
      };

      // Load persisted state
      if (load) {
        try {
          const loadResult = load();

          if (loadResult) {
            if (isPromiseLike(loadResult)) {
              // Async: hydrate when promise resolves
              loadResult.then(
                (state) => hydrateWithState(state),
                (error) => onError?.(error, "load")
              );
            } else {
              // Sync: hydrate immediately
              hydrateWithState(loadResult);
            }
          }
        } catch (error) {
          onError?.(error, "load");
        }
      }

      // Setup save subscription
      if (save) {
        instance.subscribe(() => {
          try {
            const state = instance.dehydrate();
            save(filterState(state));
          } catch (error) {
            onError?.(error, "save");
          }
        });
      }
    };

    // Call handler and setup persistence
    try {
      const handlerResult = handler(persistContext);

      if (isPromiseLike(handlerResult)) {
        // Async handler: setup when promise resolves
        handlerResult.then(
          (persistHandler) => setupPersistence(persistHandler),
          (error) => onError?.(error, "init")
        );
      } else {
        // Sync handler: setup immediately
        setupPersistence(handlerResult);
      }
    } catch (error) {
      onError?.(error, "init");
    }

    return instance;
  };
}
