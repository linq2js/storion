/**
 * useStore React Hook
 *
 * Consumes stores with automatic optimization.
 */

import { useReducer, useEffect, useMemo, useState } from "react";

import type {
  StateBase,
  ActionsBase,
  StoreSpec,
  StoreContainer,
  SelectorContext,
  Selector,
  StableResult,
  TrackedDependency,
} from "../types";
import { withHooks } from "../core/tracking";
import { useContainer } from "./context";

/**
 * React hook to consume stores with automatic optimization.
 *
 * Features:
 * - Multi-store access via resolve() in selector
 * - Conditional access (resolve() can be called conditionally)
 * - Auto-stable functions (never cause re-renders)
 * - Fine-grained updates (only re-renders when selected values change)
 * - Respects untrack() for skipping dependency tracking
 * - Works with pick() for value-level granularity
 */
interface UseStoreRefs<T> {
  selector: Selector<T>;
  stableFns: Map<string, Function>;
  trackedDeps: Map<string, TrackedDependency>;
  subscriptions: Map<string, VoidFunction>; // key -> unsubscribe
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
  const [refs] = useState<UseStoreRefs<T>>(() => ({
    selector,
    stableFns: new Map(),
    trackedDeps: new Map(),
    subscriptions: new Map(),
  }));

  // Update selector on every render
  refs.selector = selector;

  // Clear tracked deps for this render
  refs.trackedDeps.clear();

  // Create selector context (no tracking proxy needed - hooks handle it)
  const selectorContext: SelectorContext = useMemo(() => {
    const ctx: SelectorContext = {
      resolve<S extends StateBase, A extends ActionsBase>(
        spec: StoreSpec<S, A>
      ): readonly [Readonly<S>, A] {
        // Get full instance from container
        const instance = container.get(spec);
        // Return state directly - hooks will track reads
        return [instance.state, instance.actions] as const;
      },
      use<TResult, TArgs extends unknown[]>(
        mixin: (context: SelectorContext, ...args: TArgs) => TResult,
        ...args: TArgs
      ): TResult {
        return mixin(ctx, ...args);
      },
    };
    return ctx;
  }, [container]);

  // Run selector with hooks to track dependencies
  const result = withHooks(
    {
      onRead: (event) => {
        refs.trackedDeps.set(event.key, event);
      },
    },
    () => selector(selectorContext)
  );

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

  // Build output with stable functions (preserve array vs object)
  const output = (Array.isArray(result) ? [] : {}) as StableResult<T>;

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "function") {
      // Get or create stable function wrapper
      if (!refs.stableFns.has(key)) {
        refs.stableFns.set(key, (...args: unknown[]) => {
          // Run fresh selector and call the function
          const fresh = refs.selector(selectorContext);
          return (fresh as any)[key](...args);
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
 * Uses the container from React context (StoreProvider).
 */
export function useStore<T extends object>(
  selector: Selector<T>
): StableResult<T> {
  const container = useContainer();
  return useStoreWithContainer(selector, container);
}
