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
 *   meta: notPersisted(),  // entire store skipped
 * });
 * ```
 *
 * @example Field-level exclusion
 * ```ts
 * import { notPersisted } from 'storion/persist';
 * import { meta } from 'storion';
 *
 * const userStore = store({
 *   name: 'user',
 *   state: { name: '', password: '', token: '' },
 *   setup: () => ({}),
 *   meta: meta.of(
 *     notPersisted.for('password'),
 *     notPersisted.for('token'),
 *   ),
 * });
 * ```
 */
export const notPersisted = meta();

/**
 * Mark stores or fields as persisted.
 */
export const persisted = meta();

/**
 * Result from load function - can be sync or async
 */
export type PersistLoadResult =
  | Record<string, unknown>
  | null
  | undefined
  | PromiseLike<Record<string, unknown> | null | undefined>;

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
   * Only persist stores and fields explicitly marked with `persisted` meta.
   *
   * When `false` (default), all stores and fields are persisted unless marked with `notPersisted`.
   * When `true`, only stores/fields with `persisted()` or `persisted.for(field)` are persisted.
   *
   * Note: `notPersisted` always takes priority over `persisted`.
   *
   * @example
   * ```ts
   * // With persistedOnly: true, only explicitly marked stores/fields are persisted
   * const userStore = store({
   *   name: 'user',
   *   state: { name: '', email: '', temp: '' },
   *   meta: persisted(),  // marks entire store for persistence
   * });
   *
   * const settingsStore = store({
   *   name: 'settings',
   *   state: { theme: '', fontSize: 14, cache: {} },
   *   meta: persisted.for(['theme', 'fontSize']),  // only these fields persisted
   * });
   *
   * persist({
   *   persistedOnly: true,
   *   handler: (ctx) => ({ ... }),
   * });
   * ```
   *
   * @default false
   */
  persistedOnly?: boolean;

  /**
   * Filter which stores should be persisted.
   * Called after `persistedOnly` filtering.
   *
   * @param context - The persist context with store instance
   * @returns true to persist, false to skip
   */
  filter?: (context: PersistContext) => boolean;

  /**
   * Filter which fields should be persisted.
   * Called after `persistedOnly` and `notPersisted` filtering.
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
  const {
    persistedOnly = false,
    filter,
    fields,
    handler,
    onError,
    force = false,
  } = options;

  return (context) => {
    const { next, meta } = context;
    // Call next() to create the instance
    const instance = next();

    // Create persist context with store instance
    const persistContext: PersistContext = {
      ...context,
      store: instance,
    };

    // =============================================================================
    // FILTERING PRIORITY:
    // 1. applyXXX options (handled externally by forStores/forFields wrapper)
    // 2. notPersisted meta (top priority - always skip)
    // 3. persistedOnly option (opt-in mode)
    // 4. filter option (user-defined filter)
    // =============================================================================

    // Check meta for notPersisted and persisted
    const notPersistedInfo = meta(notPersisted);
    const persistedInfo = meta(persisted);

    // Priority 2: Skip entire store if marked as notPersisted at store level
    if (notPersistedInfo.store === true) {
      return instance;
    }

    // Priority 3: Check persistedOnly mode
    if (persistedOnly) {
      // In persistedOnly mode, store must have persisted meta (store-level or field-level)
      const hasStoreLevelPersisted = persistedInfo.store === true;
      const hasFieldLevelPersisted =
        Object.keys(persistedInfo.fields).length > 0;

      if (!hasStoreLevelPersisted && !hasFieldLevelPersisted) {
        // No persisted meta at all - skip entire store
        return instance;
      }
    }

    // Priority 4: Skip if filter returns false
    if (filter && !filter(persistContext)) {
      return instance;
    }

    // =============================================================================
    // FIELD FILTERING
    // =============================================================================

    // Get base fields from options or spec
    const baseFields =
      fields?.(persistContext) ?? (context.spec.fields as string[]);

    // Skip if no fields to persist
    if (baseFields.length === 0) {
      return instance;
    }

    // Get fields to exclude from persistence (notPersisted.for(field))
    const excludedFields = new Set(
      Object.keys(notPersistedInfo.fields).filter(
        (field) => notPersistedInfo.fields[field] === true
      )
    );

    // Determine included fields based on persistedOnly mode
    let stateFields: string[];

    if (persistedOnly) {
      const hasStoreLevelPersisted = persistedInfo.store === true;

      if (hasStoreLevelPersisted) {
        // Store-level persisted: include all base fields (minus excluded)
        stateFields = baseFields.filter((field) => !excludedFields.has(field));
      } else {
        // Field-level persisted only: include only persisted.for(field) fields (minus excluded)
        const persistedFields = new Set(Object.keys(persistedInfo.fields));
        stateFields = baseFields.filter(
          (field) => persistedFields.has(field) && !excludedFields.has(field)
        );
      }
    } else {
      // Default mode: include all base fields (minus excluded)
      stateFields = baseFields.filter((field) => !excludedFields.has(field));
    }

    // Skip if no fields to persist after filtering
    if (stateFields.length === 0) {
      return instance;
    }

    // Convert stateFields to a Set for efficient lookup
    const includedFields = new Set(stateFields);

    // Filter state to only include the computed includedFields
    const filterState = (
      state: Record<string, unknown>
    ): Record<string, unknown> => {
      const filtered: Record<string, unknown> = {};

      for (const key in state) {
        if (includedFields.has(key)) {
          filtered[key] = state[key];
        }
      }

      return filtered;
    };

    // Setup persistence with handler result
    const setupPersistence = (persistHandler: PersistHandler) => {
      const { load, save } = persistHandler;
      let isHydrating = false;

      // Hydrate with loaded state
      const hydrateWithState = (
        state: Record<string, unknown> | null | undefined
      ) => {
        if (state != null) {
          try {
            isHydrating = true;
            // Filter out excluded fields before hydrating
            instance.hydrate(filterState(state), { force });
          } catch (error) {
            onError?.(error, "load");
          } finally {
            isHydrating = false;
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
          // Skip saving during hydration - hydrated values come from storage
          // and don't need to be saved back
          if (isHydrating) return;

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
