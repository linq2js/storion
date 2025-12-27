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
  useId,
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
  type MixinMap,
  type MergeMixin,
  type MergeMixinResult,
  type MixinMapResult,
} from "../types";

import { withHooks, type ReadEvent } from "../core/tracking";
import { useContainer } from "./context";
import { AsyncFunctionError, ScopedOutsideSelectorError } from "../errors";
import { tryStabilize, strictEqual } from "../core/equality";
import { isSpec } from "../is";
import { storeTuple } from "../utils/storeTuple";
import { emitter } from "../emitter";
import { dev } from "../dev";

// Re-export types from types.ts for convenience
export type { MixinMap, MergeMixin, MergeMixinResult, MixinMapResult };

/**
 * Selector for useStore.from(spec) hook.
 * Receives state and actions directly (no get needed), plus SelectorContext for advanced features.
 */
export type FromSelector<
  TState extends StateBase,
  TActions extends ActionsBase,
  T
> = (state: Readonly<TState>, actions: TActions, ctx: SelectorContext) => T;

/**
 * Custom hook returned by useStore.from(spec).
 */
export type UseFromStore<
  TState extends StateBase,
  TActions extends ActionsBase
> = <T extends object>(
  selector: FromSelector<TState, TActions, T>
) => StableResult<T>;

/**
 * Selector with arguments for useStore.from(selector) overload.
 * Receives SelectorContext and additional arguments.
 */
export type FromSelectorWithArgs<
  TResult extends object,
  TArgs extends unknown[]
> = (ctx: SelectorContext, ...args: TArgs) => TResult;

/**
 * Custom hook returned by useStore.from(selector).
 * Accepts the same arguments as the original selector (minus ctx).
 */
export type UseFromSelectorHook<
  TResult extends object,
  TArgs extends unknown[]
> = (...args: TArgs) => StableResult<TResult>;

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
  /** Previous values (containers for tryStabilize) */
  prevValues: Map<string, { value: unknown }>;
  trackedDeps: Map<string, ReadEvent>;
  subscriptions: Map<string, VoidFunction>; // key -> unsubscribe
  id: string; // unique id for this component instance
  onceRan: boolean; // whether once has been executed
  /** Whether effect has committed */
  committed: boolean;
  /** Whether store changed since render (for stale detection) */
  isStale: boolean;
}

/**
 * Core hook implementation that accepts container as parameter.
 * Use this when you have direct access to a container.
 */
export function useStoreWithContainer<T extends object>(
  selector: Selector<T>,
  container: StoreContainer
): StableResult<T> {
  const id = useId();
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Combined ref for all mutable values
  const [refs] = useState<UseStoreRefs>(() => ({
    prevValues: new Map(),
    trackedDeps: new Map(),
    subscriptions: new Map(),
    id,
    onceRan: false,
    subscribed: false,
    committed: false,
    isStale: false,
  }));

  // Scoped controller for component-local stores (lazy initialized)
  const [scopeController] = useState<ScopeController>(
    () => new ScopeController(container)
  );

  // Track whether we're inside selector execution (use object for stable reference)
  const [selectorExecution] = useState(() => ({ active: false }));
  const [scheduledEffects] = useState<(() => VoidFunction)[]>(() => []);

  // Helper: cleanup all subscriptions
  const cleanupSubscriptions = () => {
    for (const unsub of refs.subscriptions.values()) {
      unsub();
    }
    refs.subscriptions.clear();
  };

  // Helper: subscribe to all tracked deps
  const subscribe = () => {
    for (const [key, dep] of refs.trackedDeps) {
      const unsub = dep.subscribe(() => {
        // If not committed yet (between render and effect), mark stale
        // Effect will handle the re-render
        if (!refs.committed) {
          refs.isStale = true;
        } else {
          // Normal change after commit - trigger re-render directly
          forceUpdate();
        }
      });
      refs.subscriptions.set(key, unsub);
    }
  };

  // === RENDER PHASE START ===
  // 1. Reset flags and cleanup for this render cycle
  refs.isStale = false;
  refs.committed = false;
  cleanupSubscriptions();

  // 2. Clear tracked deps for fresh collection
  refs.trackedDeps.clear();

  // Capture once flag before selector runs (so all once() calls see the same value)
  const shouldRunOnce = !refs.onceRan;

  // Create selector context (no tracking proxy needed - hooks handle it)
  const selectorContext: SelectorContext = useMemo(() => {
    const ctx: SelectorContext = {
      [STORION_TYPE]: "selector.context",

      id: refs.id,

      container,

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

      mixin(mixinOrMixins: any, ...args: any[]): any {
        // Overload 1: MergeMixin (array of mixins)
        if (Array.isArray(mixinOrMixins)) {
          const mixins = mixinOrMixins as MergeMixin;
          const result: Record<string, unknown> = {};
          for (const item of mixins) {
            if (typeof item === "function") {
              // Direct mixin - spread its result
              Object.assign(result, item(ctx));
            } else {
              // Named mixin map - map keys to results
              for (const key in item) {
                result[key] = item[key](ctx);
              }
            }
          }
          return result;
        }

        // Overload 2: MixinMap (object of mixins)
        if (
          typeof mixinOrMixins === "object" &&
          mixinOrMixins !== null &&
          !Array.isArray(mixinOrMixins)
        ) {
          // Check if it looks like a MixinMap (has function values)
          const keys = Object.keys(mixinOrMixins);
          if (
            keys.length > 0 &&
            keys.every((k) => typeof mixinOrMixins[k] === "function")
          ) {
            const mixinMap = mixinOrMixins as MixinMap;
            const result: Record<string, unknown> = {};
            for (const key in mixinMap) {
              result[key] = mixinMap[key](ctx);
            }
            return result;
          }
        }

        // Overload 3: Single mixin function with args
        return mixinOrMixins(ctx, ...args);
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
  // Output wrapping is inside withHooks so property reads are tracked
  // (e.g., when user returns state proxy directly: `return state`)
  let output: StableResult<T>;
  selectorExecution.active = true;
  try {
    output = withHooks(
      {
        onRead: (event) => {
          refs.trackedDeps.set(event.key, event);
        },
        // Collect effects to run in useEffect (not immediately)
        // This enables effect() calls in selector to access component scope
        scheduleEffect: (runEffect) => {
          scheduledEffects.push(runEffect);
        },
      },
      () => {
        const result = selector(selectorContext);

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

        // Handle void/undefined selectors - used for side effects only (trigger, effects)
        if (result === undefined || result === null) {
          return undefined as any;
        }

        // Build output with stable values (preserve array vs object)
        // This is inside withHooks so Object.entries reads are tracked
        const out = (Array.isArray(result) ? [] : {}) as StableResult<T>;

        for (const [key, value] of Object.entries(result)) {
          // Get previous value container (undefined if first time)
          const prev = refs.prevValues.get(key);

          // Stabilize: handles both functions (stable wrapper) and values (equality)
          const [stableValue] = tryStabilize(prev, value, strictEqual);
          (out as any)[key] = stableValue;

          // Store for next render
          if (prev) {
            prev.value = stableValue;
          } else {
            refs.prevValues.set(key, { value: stableValue });
          }
        }

        return out;
      }
    );
  } finally {
    selectorExecution.active = false;
  }

  // Mark once as ran after first selector execution
  if (shouldRunOnce) {
    refs.onceRan = true;
  }

  // === RENDER PHASE: Subscribe and schedule microtask cleanup ===
  // Subscribe during render to catch changes immediately (e.g., hydration)
  subscribe();

  if (shouldScheduleDispose) {
    // Schedule microtask cleanup in case effect never runs (component suspended/unmounted)
    // Note: Layout effect runs BEFORE microtasks, so if committed, microtask is no-op
    queueMicrotask(() => {
      if (!refs.committed) {
        cleanupSubscriptions();
      }
    });
  }

  // Scoped store lifecycle management
  // Use layout effect for synchronous commit before paint
  useIsomorphicLayoutEffect(() => {
    scopeController.commit();
    return () => {
      scopeController.uncommit();
    };
  }, [scopeController]);

  // === EFFECT: Commit subscriptions and handle stale detection ===
  // Use layout effect for synchronous commit before paint
  useIsomorphicLayoutEffect(() => {
    // 1. Resubscribe if StrictMode cleanup cleared subscriptions
    if (refs.subscriptions.size === 0 && refs.trackedDeps.size > 0) {
      subscribe();
    }

    // 2. Mark as committed (prevents microtask cleanup)
    refs.committed = true;

    // 3. If store changed since render, re-render with fresh values
    if (refs.isStale) {
      refs.isStale = false;
      forceUpdate();
    }

    // Cleanup: cleanup all for StrictMode/unmount
    return () => {
      cleanupSubscriptions();
      refs.committed = false;
    };
  });

  // Run scheduled effects after render
  // Effects defined via effect() in the selector are collected here and
  // executed in useEffect, giving them access to fresh closure values
  // (refs, props, other hook results) while auto-tracking store state.
  //
  // Note: We don't clear scheduledEffects here because StrictMode runs
  // effects twice (mount → cleanup → remount). The effect's internal
  // isStarted guard prevents double-execution of the same instance.
  useEffect(() => {
    // Run each effect and collect dispose functions
    const disposers = emitter();
    try {
      for (const runEffect of scheduledEffects) {
        disposers.on(runEffect());
      }
    } catch (ex) {
      // clear disposers on error
      disposers.emitAndClear();
      throw ex;
    }

    // Cleanup: dispose all effects in reverse order (LIFO)
    return () => {
      disposers.emitAndClear();
    };
  });

  return output;
}

/**
 * React hook to consume stores with automatic optimization.
 *
 * Features:
 * - Multi-store access via `get()` for global stores
 * - Component-local stores via `scoped()` (auto-disposed on unmount)
 * - Component-scoped effects via `effect()` with access to external values
 * - Auto-stable functions (never cause re-renders)
 * - Fine-grained updates (only re-renders when selected values change)
 *
 * @example Basic usage
 * ```tsx
 * const { count, increment } = useStore(({ get }) => {
 *   const [state, actions] = get(counterStore);
 *   return { count: state.count, increment: actions.increment };
 * });
 * ```
 *
 * @example Component-local stores
 * ```tsx
 * const { form } = useStore(({ scoped }) => {
 *   const [formState, formActions] = scoped(formStore);
 *   return { form: { ...formState, ...formActions } };
 * });
 * ```
 *
 * @example Effects with access to external values (refs, props, hooks)
 * ```tsx
 * function SearchPage() {
 *   const inputRef = useRef<HTMLInputElement>(null);
 *   const location = useLocation();
 *
 *   const { query } = useStore(({ get }) => {
 *     const [state] = get(searchStore);
 *
 *     // Effect runs in useEffect - has access to refs, props, and hooks
 *     // Auto-tracks store state, re-runs when tracked values change
 *     effect(() => {
 *       if (location.pathname === '/search' && state.isReady) {
 *         inputRef.current?.focus();
 *       }
 *     });
 *
 *     return { query: state.query };
 *   });
 * }
 * ```
 */
function useStoreImpl(
  selectorOrMixins: Selector<any> | MergeMixin | MixinMap
): any {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const container = useContainer();

  // Overload 1: MergeMixin (array of mixins)
  if (Array.isArray(selectorOrMixins)) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useStoreWithContainer(
      (ctx) => ctx.mixin(selectorOrMixins),
      container
    );
  }

  // Overload 2: MixinMap (object of mixins)
  if (
    typeof selectorOrMixins === "object" &&
    selectorOrMixins !== null &&
    !Array.isArray(selectorOrMixins)
  ) {
    // Check if it looks like a MixinMap (has function values)
    const keys = Object.keys(selectorOrMixins);
    if (
      keys.length > 0 &&
      keys.every((k) => typeof (selectorOrMixins as MixinMap)[k] === "function")
    ) {
      // eslint-disable-next-line react-hooks/rules-of-hooks
      return useStoreWithContainer(
        (ctx) => ctx.mixin(selectorOrMixins as MixinMap),
        container
      );
    }
  }

  // Overload 3: Regular Selector function
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStoreWithContainer(selectorOrMixins as Selector<any>, container);
}

/**
 * Create a pre-bound hook for a specific store.
 *
 * Returns a hook that takes a selector receiving state and actions directly,
 * simplifying the common pattern of accessing a single store.
 *
 * @example
 * ```tsx
 * // Create a pre-bound hook
 * const useCounter = useStore.from(counterStore);
 *
 * // Use in components - simpler than full useStore
 * function Counter() {
 *   const { count, increment } = useCounter((state, actions) => ({
 *     count: state.count,
 *     increment: actions.increment,
 *   }));
 *
 *   return <button onClick={increment}>{count}</button>;
 * }
 *
 * // Access other stores or context features via third parameter
 * function UserCounter() {
 *   const { count, userName } = useCounter((state, actions, ctx) => {
 *     const [userState] = ctx.get(userStore);
 *     return {
 *       count: state.count,
 *       userName: userState.name,
 *     };
 *   });
 *
 *   return <div>{userName}: {count}</div>;
 * }
 * ```
 */
function useStoreFromSpec<
  TState extends StateBase,
  TActions extends ActionsBase
>(spec: StoreSpec<TState, TActions>): UseFromStore<TState, TActions> {
  return <T extends object>(
    selector: FromSelector<TState, TActions, T>
  ): StableResult<T> => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useStoreImpl((ctx) => {
      const [state, actions] = ctx.get(spec);
      return selector(state, actions, ctx);
    });
  };
}

/**
 * Create a reusable hook from a selector function with arguments.
 *
 * @example
 * ```tsx
 * // Create a parameterized hook
 * const useUserById = useStore.from((ctx, userId: string) => {
 *   const [state] = ctx.get(userStore);
 *   return { user: state.users[userId] };
 * });
 *
 * // Use in components
 * function UserCard({ userId }: { userId: string }) {
 *   const { user } = useUserById(userId);
 *   return <div>{user?.name}</div>;
 * }
 * ```
 */
function useStoreFromSelector<TResult extends object, TArgs extends unknown[]>(
  selector: FromSelectorWithArgs<TResult, TArgs>
): UseFromSelectorHook<TResult, TArgs> {
  return (...args: TArgs): StableResult<TResult> => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useStoreImpl((ctx) => selector(ctx, ...args));
  };
}

/**
 * Combined useStore.from() implementation.
 * Detects whether argument is a store spec or a selector function.
 */
function useStoreFrom<TState extends StateBase, TActions extends ActionsBase>(
  specOrSelector: StoreSpec<TState, TActions>
): UseFromStore<TState, TActions>;
function useStoreFrom<TResult extends object, TArgs extends unknown[]>(
  specOrSelector: FromSelectorWithArgs<TResult, TArgs>
): UseFromSelectorHook<TResult, TArgs>;
function useStoreFrom(specOrSelector: any): any {
  // If it's a store spec, use the spec-based overload
  if (isSpec(specOrSelector)) {
    return useStoreFromSpec(specOrSelector);
  }
  // Otherwise, it's a selector function
  return useStoreFromSelector(specOrSelector);
}

/**
 * useStore hook interface with from() method.
 */
export interface UseStoreFn {
  /**
   * Main useStore hook - consumes stores with automatic optimization.
   */
  <T extends object>(selector: Selector<T>): StableResult<T>;

  /**
   * useStore with void selector - for side effects only (trigger, effects).
   *
   * @example
   * ```tsx
   * function MyComponent({ id }: { id: string }) {
   *   useStore(({ get }) => {
   *     const [, actions] = get(dataStore);
   *     trigger(actions.fetch, [id], id);
   *     // No return - just side effects
   *   });
   *   return <div>...</div>;
   * }
   * ```
   */
  (selector: Selector<void>): void;

  /**
   * Merge multiple mixins into a single result object.
   *
   * @example
   * ```tsx
   * const selectName = (ctx: SelectorContext) => {
   *   const [state] = ctx.get(userStore);
   *   return { name: state.name };
   * };
   *
   * const selectCount = (ctx: SelectorContext) => {
   *   const [state] = ctx.get(counterStore);
   *   return state.count;
   * };
   *
   * function Component() {
   *   // Direct mixin spreads its result, named mixin maps key to result
   *   const result = useStore([
   *     selectName,           // → { name: string }
   *     { count: selectCount } // → { count: number }
   *   ]);
   *   // result: { name: string, count: number }
   * }
   * ```
   */
  <const T extends MergeMixin>(mixins: T): MergeMixinResult<T>;

  /**
   * Map mixin keys to their results.
   *
   * @example
   * ```tsx
   * const selectName = (ctx: SelectorContext) => {
   *   const [state] = ctx.get(userStore);
   *   return state.name;
   * };
   *
   * const selectAge = (ctx: SelectorContext) => {
   *   const [state] = ctx.get(userStore);
   *   return state.age;
   * };
   *
   * function Component() {
   *   const { name, age } = useStore({
   *     name: selectName,
   *     age: selectAge,
   *   });
   *   // name: string, age: number
   * }
   * ```
   */
  <const T extends MixinMap>(mixinMap: T): MixinMapResult<T>;

  /**
   * Create a pre-bound hook for a specific store.
   *
   * @example
   * ```tsx
   * const useCounter = useStore.from(counterStore);
   *
   * function Counter() {
   *   const { count, increment } = useCounter((state, actions) => ({
   *     count: state.count,
   *     increment: actions.increment,
   *   }));
   *   return <button onClick={increment}>{count}</button>;
   * }
   * ```
   */
  from<TState extends StateBase, TActions extends ActionsBase>(
    spec: StoreSpec<TState, TActions>
  ): UseFromStore<TState, TActions>;

  /**
   * Create a reusable hook from a selector function with arguments.
   *
   * @example
   * ```tsx
   * const useUserById = useStore.from((ctx, userId: string) => {
   *   const [state] = ctx.get(userStore);
   *   return { user: state.users[userId] };
   * });
   *
   * function UserCard({ userId }: { userId: string }) {
   *   const { user } = useUserById(userId);
   *   return <div>{user?.name}</div>;
   * }
   * ```
   */
  from<TResult extends object, TArgs extends unknown[]>(
    selector: FromSelectorWithArgs<TResult, TArgs>
  ): UseFromSelectorHook<TResult, TArgs>;
}

/**
 * React hook to consume stores with automatic optimization.
 *
 * @see {@link UseStoreFn} for full documentation
 */
export const useStore: UseStoreFn = Object.assign(useStoreImpl, {
  from: useStoreFrom,
});

const isServer = typeof window === "undefined";
const useIsomorphicLayoutEffect =
  isServer || typeof useLayoutEffect === "undefined"
    ? useEffect
    : useLayoutEffect;
// Always use microtask for disposal in browser to handle StrictMode correctly
// The microtask allows StrictMode's effect re-run to commit before disposal check
const shouldScheduleDispose =
  !isServer && dev() && typeof useLayoutEffect === "function";

class ScopeController {
  /** Whether the effect has committed (is active) */
  private _committed = false;

  /** Whether this controller has been disposed */
  private _disposed = false;

  /** Whether a disposal check microtask is pending */
  private _pendingDisposalCheck = false;

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
    // Skip if already committed, disposed, or a check is already pending
    if (this._committed || this._disposed || this._pendingDisposalCheck) return;

    if (shouldScheduleDispose) {
      // Mark that a disposal check is pending to prevent duplicate microtasks
      this._pendingDisposalCheck = true;
      // Defer check to next microtask
      // This allows StrictMode's effect re-run to commit before we check
      Promise.resolve().then(() => {
        this._pendingDisposalCheck = false;
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

    // Only schedule disposal check if not already committed
    // This prevents race conditions when selector runs multiple times
    if (shouldScheduleDispose && !this._committed) {
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
    // Clear pending check flag since we're now committed
    this._pendingDisposalCheck = false;
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
