/**
 * Persist Middleware for Storion
 *
 * Provides automatic state persistence and hydration for stores.
 */

import { isStore } from "../is";
import type { StoreSpec, Middleware } from "../types";

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
}

/**
 * Check if a value is a Promise or PromiseLike
 */
function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return (
    value !== null &&
    typeof value === "object" &&
    "then" in value &&
    typeof (value as PromiseLike<T>).then === "function"
  );
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
export function persistMiddleware(options: PersistOptions): Middleware {
  const { filter, load, save, onError } = options;

  return (ctx) => {
    // Call next() to create the instance
    const instance = ctx.next();

    // Skip if not a store instance
    if (!isStore(instance)) {
      return instance;
    }

    const spec = instance.spec;

    // Skip if filter returns false
    if (filter && !filter(spec)) {
      return instance;
    }

    // Hydrate with loaded state
    const hydrateWithState = (
      state: Record<string, unknown> | null | undefined
    ) => {
      if (state != null) {
        try {
          instance.hydrate(state);
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
          save(spec, state);
        } catch (error) {
          onError?.(spec, error, "save");
        }
      });
    }

    return instance;
  };
}
