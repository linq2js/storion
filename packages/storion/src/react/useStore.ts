/**
 * useStore React Hook
 *
 * Consumes stores with automatic optimization.
 */

import {
  useReducer,
  useEffect,
  useMemo,
  useState,
  useLayoutEffect,
} from "react";

import {
  STORION_TYPE,
  type StateBase,
  type ActionsBase,
  type StoreSpec,
  type StoreContainer,
  type SelectorContext,
  type Selector,
  type StableResult,
  type StoreInstance,
} from "../types";
import { withHooks, type ReadEvent } from "../core/tracking";
import { useContainer } from "./context";
import { AsyncFunctionError, ScopedOutsideSelectorError } from "../errors";
import { isSpec } from "../is";
import { dev } from "../dev";
import { storeTuple } from "../utils/storeTuple";

/**
 * React hook to consume stores with automatic optimization.
 *
 * Features:
 * - Multi-store access via get() in selector
 * - Conditional access (get() can be called conditionally)
 * - Auto-stable functions (never cause re-renders)
 * - Fine-grained updates (only re-renders when selected values change)
 * - Respects untrack() for skipping dependency tracking
 * - Works with pick() for value-level granularity
 */
interface UseStoreRefs {
  fresh: any;
  stableFns: Map<string, Function>;
  trackedDeps: Map<string, ReadEvent>;
  subscriptions: Map<string, VoidFunction>; // key -> unsubscribe
  id: object; // unique id for this component instance
  onceRan: boolean; // whether once has been executed
}

/**
 * Core hook implementation that accepts container as parameter.
 * Use this when you have direct access to a container.
 */
export function useStoreWithContainer<T extends object>(
  selector: Selector<T>,
  container: StoreContainer
): StableResult<T> {
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Combined ref for all mutable values
  const [refs] = useState<UseStoreRefs>(() => ({
    fresh: undefined,
    stableFns: new Map(),
    trackedDeps: new Map(),
    subscriptions: new Map(),
    id: {},
    onceRan: false,
  }));

  // Scoped controller for component-local stores (lazy initialized)
  const [scopeController] = useState<ScopeController>(
    () => new ScopeController(container)
  );

  // Track whether we're inside selector execution (use object for stable reference)
  const [selectorExecution] = useState(() => ({ active: false }));

  // Clear tracked deps for this render
  refs.trackedDeps.clear();

  // Capture once flag before selector runs (so all once() calls see the same value)
  const shouldRunOnce = !refs.onceRan;

  // Create selector context (no tracking proxy needed - hooks handle it)
  const selectorContext: SelectorContext = useMemo(() => {
    const ctx: SelectorContext = {
      [STORION_TYPE]: "selector.context",

      id: refs.id,

      // Implementation handles both StoreSpec and Factory overloads
      get(specOrFactory: any): any {
        // Handle plain factory functions
        if (!isSpec(specOrFactory)) {
          return container.get(specOrFactory);
        }
        // Get full store instance from container
        const instance = container.get(specOrFactory);
        // Return tuple with named properties
        const tuple = [instance.state, instance.actions] as const;
        return Object.assign(tuple, {
          state: instance.state,
          actions: instance.actions,
        });
      },

      mixin<TResult, TArgs extends unknown[]>(
        mixin: (context: SelectorContext, ...args: TArgs) => TResult,
        ...args: TArgs
      ): TResult {
        return mixin(ctx, ...args);
      },

      once(callback: () => void): void {
        // Run immediately on first mount only
        if (shouldRunOnce) {
          callback();
        }
      },

      scoped(spec: any): any {
        // Verify we're inside selector execution
        if (!selectorExecution.active) {
          throw new ScopedOutsideSelectorError();
        }
        const instance = scopeController.get(spec);
        return storeTuple(instance);
      },
    };
    return ctx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, shouldRunOnce, scopeController]);

  // Run selector with hooks to track dependencies
  // Use try/finally to ensure selectorExecution.active is properly reset
  let result: T;
  selectorExecution.active = true;
  try {
    result = withHooks(
      {
        onRead: (event) => {
          refs.trackedDeps.set(event.key, event);
        },
      },
      () => selector(selectorContext)
    );
  } finally {
    selectorExecution.active = false;
  }

  // Mark once as ran after first selector execution
  if (shouldRunOnce) {
    refs.onceRan = true;
  }

  // Prevent async selectors - they cause tracking issues
  if (
    result &&
    typeof (result as unknown as PromiseLike<unknown>).then === "function"
  ) {
    throw new AsyncFunctionError(
      "useStore selector",
      "Do not return a Promise from the selector function."
    );
  }
  refs.fresh = result;
  // Build output with stable functions (preserve array vs object)
  const output = (Array.isArray(result) ? [] : {}) as StableResult<T>;

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "function") {
      // Get or create stable function wrapper
      if (!refs.stableFns.has(key)) {
        refs.stableFns.set(key, (...args: unknown[]) => {
          // Run fresh selector and call the function
          return (refs.fresh as any)?.[key]?.(...args);
        });
      }
      (output as any)[key] = refs.stableFns.get(key);
    } else {
      (output as any)[key] = value;
    }
  }

  // Compute subscription token based on tracked keys
  // Token changes only when the set of tracked keys changes
  const trackedKeysToken = [...refs.trackedDeps.keys()].sort().join("|");

  // Sync subscriptions incrementally
  useEffect(() => {
    const currentKeys = refs.trackedDeps;
    const prevSubscriptions = refs.subscriptions;

    // Unsubscribe from keys no longer tracked
    for (const key of prevSubscriptions.keys()) {
      if (!currentKeys.has(key)) {
        prevSubscriptions.get(key)?.();
        prevSubscriptions.delete(key);
      }
    }

    // Subscribe to new keys only
    // Note: subscription only fires when value actually changes (store handles equality)
    for (const [key, dep] of currentKeys) {
      if (!prevSubscriptions.has(key)) {
        const unsub = dep.subscribe(forceUpdate);
        prevSubscriptions.set(key, unsub);
      }
    }

    // Cleanup all on unmount
    return () => {
      for (const unsub of refs.subscriptions.values()) {
        unsub();
      }
      refs.subscriptions.clear();
    };
    // Re-run only when tracked keys change, not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedKeysToken]);

  // Scoped store lifecycle management
  // Use layout effect for synchronous commit before paint
  useIsomorphicLayoutEffect(() => {
    scopeController.commit();
    return () => {
      scopeController.uncommit();
    };
  }, [scopeController]);

  return output;
}

/**
 * React hook to consume stores with automatic optimization.
 *
 * Features:
 * - Multi-store access via `get()` for global stores
 * - Component-local stores via `scoped()` (auto-disposed on unmount)
 * - Auto-stable functions (never cause re-renders)
 * - Fine-grained updates (only re-renders when selected values change)
 *
 * @example
 * ```tsx
 * const { count, increment, form } = useStore(({ get, scoped }) => {
 *   // Global stores
 *   const [state, actions] = get(counterStore);
 *
 *   // Component-local stores (disposed on unmount)
 *   const [formState, formActions] = scoped(formStore);
 *
 *   return {
 *     count: state.count,
 *     increment: actions.increment,
 *     form: { ...formState, ...formActions },
 *   };
 * });
 * ```
 */
export function useStore<T extends object>(
  selector: Selector<T>
): StableResult<T> {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const container = useContainer();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStoreWithContainer(selector, container);
}

const isServer = typeof window === "undefined";
const useIsomorphicLayoutEffect = isServer ? useEffect : useLayoutEffect;
// only schedule dispose if in development mode and useLayoutEffect is available
const shouldScheduleDispose =
  !isServer && typeof useLayoutEffect === "function" && dev();

class ScopeController {
  /** Whether the effect has committed (is active) */
  private _committed = false;

  /** Whether this controller has been disposed */
  private _disposed = false;

  private _stores = new Map<StoreSpec<any, any>, StoreInstance<any, any>>();

  constructor(public readonly container: StoreContainer) {}

  /**
   * Dispose the controller and its store.
   * Safe to call multiple times.
   */
  dispose = () => {
    if (this._disposed) return;
    this._disposed = true;
    for (const store of this._stores.values()) {
      store.dispose();
    }
    this._stores.clear();
  };

  /**
   * Schedule disposal check via microtask.
   *
   * This deferred check is crucial for StrictMode:
   * - StrictMode runs cleanup then effect again synchronously
   * - The microtask runs AFTER the re-commit, so store survives
   * - On real unmount, no re-commit happens, so disposal proceeds
   */
  private _disposeIfUnused = () => {
    // Skip if already committed or disposed
    if (this._committed || this._disposed) return;

    if (shouldScheduleDispose) {
      // Defer check to next microtask
      // This allows StrictMode's effect re-run to commit before we check
      Promise.resolve().then(() => {
        // If still not committed after microtask, it's a real unmount
        if (!this._committed) {
          this.dispose();
        }
      });
    } else {
      this.dispose();
    }
  };

  /**
   * Get or create the store instance.
   */
  get = <TState extends StateBase, TActions extends ActionsBase>(
    spec: StoreSpec<TState, TActions>
  ): StoreInstance<TState, TActions> => {
    if (this._disposed) {
      throw new Error("ScopeController has been disposed");
    }
    let store = this._stores.get(spec);
    if (!store) {
      store = this.container.create(spec);
      this._stores.set(spec, store);
    }

    if (shouldScheduleDispose) {
      // Schedule cleanup if effect never commits (render-only)
      this._disposeIfUnused();
    }

    return store;
  };

  /**
   * Mark as committed (effect is active).
   * Called at the start of useLayoutEffect.
   */
  commit = () => {
    this._committed = true;
  };

  /**
   * Mark as uncommitted (effect cleaned up).
   * Schedules deferred disposal check.
   */
  uncommit = () => {
    this._committed = false;
    this._disposeIfUnused();
  };
}
