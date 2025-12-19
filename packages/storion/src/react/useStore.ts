/**
 * useStore React Hook
 *
 * Consumes stores with automatic optimization.
 */

import { useReducer, useEffect, useMemo, useState } from "react";

import {
  STORION_TYPE,
  type StateBase,
  type ActionsBase,
  type StoreSpec,
  type StoreContainer,
  type SelectorContext,
  type Selector,
  type StableResult,
} from "../types";
import { withHooks, type ReadEvent } from "../core/tracking";
import { useContainer } from "./context";
import { useLocalStore, type LocalStoreResult } from "./useLocalStore";
import { isSpec } from "../is";

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

      // Create a fresh instance from a parameterized factory (bypasses cache)
      create(factory: any, ...args: any[]): any {
        return (container.create as any)(factory, ...args);
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
    };
    return ctx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container, shouldRunOnce]);

  // Run selector with hooks to track dependencies
  const result = withHooks(
    {
      onRead: (event) => {
        refs.trackedDeps.set(event.key, event);
      },
    },
    () => selector(selectorContext)
  );

  // Mark once as ran after first selector execution
  if (shouldRunOnce) {
    refs.onceRan = true;
  }

  // Prevent async selectors - they cause tracking issues
  if (
    result &&
    typeof (result as unknown as PromiseLike<unknown>).then === "function"
  ) {
    throw new Error(
      "useStore selector must be synchronous. " +
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

  return output;
}

/**
 * React hook to consume stores with automatic optimization.
 *
 * @overload With selector - Uses the container from React context (StoreProvider).
 * Access multiple stores, compute derived values, with fine-grained re-renders.
 *
 * @overload With spec - Creates a component-local store instance (like useLocalStore).
 * The store is isolated, disposed on unmount, and cannot have dependencies.
 *
 * @example
 * ```tsx
 * // With selector - access global stores
 * const { count, increment } = useStore(({ get }) => {
 *   const [state, actions] = get(counterSpec);
 *   return { count: state.count, increment: actions.increment };
 * });
 *
 * // With spec - local store (shorthand for useLocalStore)
 * const [state, actions, { dirty, reset }] = useStore(formSpec);
 * ```
 */
export function useStore<T extends object>(
  selector: Selector<T>
): StableResult<T>;
export function useStore<
  TState extends StateBase,
  TActions extends ActionsBase
>(spec: StoreSpec<TState, TActions>): LocalStoreResult<TState, TActions>;
export function useStore<
  T extends object,
  TState extends StateBase = StateBase,
  TActions extends ActionsBase = ActionsBase
>(
  selectorOrSpec: Selector<T> | StoreSpec<TState, TActions>
): StableResult<T> | LocalStoreResult<TState, TActions> {
  // Detect if it's a spec (object with 'options' property) vs selector (function)
  const isSpec =
    typeof selectorOrSpec === "object" &&
    selectorOrSpec !== null &&
    "options" in selectorOrSpec;

  // For spec, use local store
  if (isSpec) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useLocalStore(selectorOrSpec as StoreSpec<TState, TActions>);
  }

  // For selector, use container-based store
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const container = useContainer();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStoreWithContainer(selectorOrSpec as Selector<T>, container);
}
