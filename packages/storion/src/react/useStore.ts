/**
 * useStore React Hook
 *
 * Consumes stores with automatic optimization.
 */

import { useReducer, useEffect, useRef, useLayoutEffect, useId } from "react";

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
import { tryStabilize, strictEqual } from "../core/equality";
import { isSpec } from "../is";
import { storeTuple } from "../utils/storeTuple";
import { emitter } from "../emitter";
import { microtask } from "../utils/microtask";
import { useStrictMode } from "./strictMode";
import { dev } from "../dev";

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

// Tracks whether ANY useStore selector is currently executing (module-global).
// Used to avoid sync setState from store subscriptions while React is rendering
// another Storion selector (which triggers React's "setState in render" warning).
let useStoreSelectorDepth = 0;

/**
 * Core hook implementation that accepts container as parameter.
 * Use this when you have direct access to a container.
 */
export function useStoreWithContainer<T extends object>(
  selector: Selector<T>,
  container: StoreContainer
): StableResult<T> {
  const id = useId();
  const isStrictMode = useStrictMode();
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Enable deferred disposal if using StrictMode OR in development mode (for Suspense handling)
  const shouldDeferDisposal = isStrictMode || shouldDeferDisposalInDev;

  // Use useRef to ensure persistence across React concurrent renders.
  // In concurrent mode, initializers can run multiple times for different "attempts",
  // but useRef.current persists across all attempts for the same fiber.
  const controllerRef = useRef<UseStoreController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new UseStoreController(
      isStrictMode,
      id,
      container,
      shouldDeferDisposal,
      forceUpdate,
      () => {
        // we should cleanup the controller when the component is disposed
        controllerRef.current = null;
      }
    );
  }
  const controller = controllerRef.current;
  // Update deferDisposal flag each render (it's stable, but ensure consistency)
  controller.deferDisposal = shouldDeferDisposal;

  // === RENDER PHASE START ===
  // Prepare for this render cycle
  controller.prepareRender();

  // Capture once flag before selector runs (so all once() calls see the same value)
  const shouldRunOnce = !controller.onceRan;

  // Create selector context (no tracking proxy needed - hooks handle it)
  const ctx: SelectorContext = {
    [STORION_TYPE]: "selector.context",

    id: controller.id,

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

    mixin(mixin: any, ...args: any[]): any {
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
      if (!controller.selectorExecution.active) {
        throw new ScopedOutsideSelectorError();
      }
      const instance = controller.getScoped(spec);
      return storeTuple(instance);
    },
  };

  // Run selector with hooks to track dependencies
  // Output wrapping is inside withHooks so property reads are tracked
  // (e.g., when user returns state proxy directly: `return state`)
  let output: StableResult<T>;
  controller.selectorExecution.active = true;
  useStoreSelectorDepth++;
  try {
    output = withHooks(
      {
        onRead: (event) => {
          controller.trackDep(event);
        },
        // Collect effects to run in useEffect (not immediately)
        // This enables effect() calls in selector to access component scope
        scheduleEffect: (runEffect) => {
          controller.scheduledEffects.push(runEffect);
        },
      },
      () => {
        const result = selector(ctx);

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
          // Stabilize: handles both functions (stable wrapper) and values (equality)
          const stableValue = controller.stabilize(key, value);
          (out as any)[key] = stableValue;
        }

        return out;
      }
    );
  } catch (error) {
    // dispose controller immediately if there is an error
    controller.dispose();
    throw error;
  } finally {
    controller.selectorExecution.active = false;
    useStoreSelectorDepth--;
  }

  // Mark once as ran after first selector execution
  if (shouldRunOnce) {
    controller.onceRan = true;
  }

  // === RENDER PHASE: Subscribe and schedule macrotask cleanup ===
  // Subscribe during render to catch changes immediately (e.g., hydration)
  controller.subscribe();

  // Note: Cleanup is scheduled via setTimeout (macrotask) in prepareRender (not microtask),
  // because in React 19 concurrent mode microtasks can run BEFORE useLayoutEffect.
  //
  // The goal is to avoid prematurely cleaning up subscriptions before commit.
  // Even so, subscriptions can still end up temporarily cleared in some lifecycles
  // (e.g. StrictMode/unmount sequences), so layoutEffect below will resubscribe if needed.

  // === EFFECT: Commit subscriptions and handle stale detection ===
  // Use layout effect for synchronous commit before paint
  // NOTE: No dependency array - must run on EVERY render to handle subscription updates
  useIsomorphicLayoutEffect(() => {
    controller.commit();
    return () => {
      controller.uncommit();
    };
  });

  // Run scheduled effects after render
  // Effects defined via effect() in the selector are collected here and
  // executed in useEffect, giving them access to fresh closure values
  // (refs, props, other hook results) while auto-tracking store state.
  //
  // scheduledEffects is cleared at render start (not here) so each render
  // cycle processes only effects scheduled during that render. StrictMode
  // double-mounting is handled by effect cleanup/restart, not by keeping
  // stale effects around.
  useEffect(() => {
    // Run each effect and collect dispose functions
    const disposers = emitter();
    try {
      for (const runEffect of controller.scheduledEffects) {
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
function useStoreImpl(selector: Selector<any>): any {
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const container = useContainer();
  // eslint-disable-next-line react-hooks/rules-of-hooks
  return useStoreWithContainer(selector, container);
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

// Whether to use deferred disposal for handling React re-mounting scenarios
// (StrictMode double-rendering, Suspense re-mounts, error boundary recovery)
// Only needed in development mode on client-side.
const shouldDeferDisposalInDev =
  !isServer && dev() && typeof useLayoutEffect === "function";

/**
 * Controller for useStore hook - manages subscriptions, scoped stores, and lifecycle.
 * Combines subscription tracking and scoped store management into a single class.
 */
class UseStoreController {
  // === Subscription State ===
  /** Previous values for stabilization */
  readonly prevValues = new Map<string, { value: unknown }>();
  /** Tracked dependencies from selector */
  readonly trackedDeps = new Map<string, ReadEvent>();
  /** Active subscriptions */
  readonly subscriptions = new Map<string, VoidFunction>();
  /** Whether once() has been executed */
  onceRan = false;

  // === Lifecycle State ===
  /** Whether effect has committed */
  private _committed = false;
  /** Whether store changed since render (for stale detection) */
  private _isStale = false;
  /** Whether a committed update flush is already scheduled */
  private _flushScheduled = false;
  /** Whether this controller has been disposed */
  private _disposed = false;
  /** Whether a disposal check is pending */
  private _pendingDisposalCheck = false;

  // === Scoped Stores ===
  private _scopedStores = new Map<
    StoreSpec<any, any>,
    StoreInstance<any, any>
  >();

  // === Selector Execution State ===
  /** Whether selector is currently executing */
  readonly selectorExecution = { active: false };
  /** Effects scheduled during selector execution */
  readonly scheduledEffects: (() => VoidFunction)[] = [];

  constructor(
    public readonly isStrictMode: boolean,
    public readonly id: string,
    public readonly container: StoreContainer,
    /** Whether deferred disposal is enabled (StrictMode or dev mode) */
    public deferDisposal: boolean,
    private readonly _forceUpdate: () => void,
    private readonly _onDispose: VoidFunction = () => {}
  ) {}

  // === Render Phase Methods ===

  /**
   * Prepare for a new render cycle.
   * Resets flags, clears subscriptions, and schedules cleanup for abandoned renders.
   */
  prepareRender(): void {
    this._isStale = false;
    this._committed = false;
    this._cleanupSubscriptions();
    this.trackedDeps.clear();
    this.scheduledEffects.length = 0;

    // Schedule cleanup for abandoned renders (concurrent mode / error boundaries).
    // IMPORTANT: We use setTimeout (macrotask) instead of Promise.resolve (microtask) because
    // in React 19 concurrent mode, microtasks run BEFORE useLayoutEffect. Since we set
    // _committed = true in useLayoutEffect, using microtask would cause subscriptions
    // to be cleaned up prematurely (before commit). setTimeout runs AFTER useLayoutEffect.
    if (this.deferDisposal) {
      setTimeout(() => {
        if (!this._committed) {
          this._cleanupSubscriptions();
        }
      }, 0);
    }
  }

  /**
   * Track a dependency from selector execution.
   */
  trackDep(event: ReadEvent): void {
    this.trackedDeps.set(event.key, event);
  }

  /**
   * Stabilize a value across renders.
   */
  stabilize(key: string, value: unknown): unknown {
    const prev = this.prevValues.get(key);
    const [stableValue] = tryStabilize(prev, value, strictEqual);

    if (prev) {
      prev.value = stableValue;
    } else {
      this.prevValues.set(key, { value: stableValue });
    }

    return stableValue;
  }

  /**
   * Subscribe to all tracked deps.
   */
  subscribe(): void {
    for (const [key, dep] of this.trackedDeps) {
      const unsub = dep.subscribe(() => {
        // If not committed yet (between render and layoutEffect), mark stale.
        // LayoutEffect will forceUpdate after commit.
        if (!this._committed) {
          this._isStale = true;
          return;
        }

        // If a store updates while React is rendering another Storion selector, do NOT
        // synchronously call setState. Defer to a microtask to avoid React warnings.
        if (useStoreSelectorDepth > 0 || this.selectorExecution.active) {
          this._isStale = true;
          this._scheduleFlushIfCommitted();
          return;
        }

        // Normal post-commit update path: re-render immediately.
        this._forceUpdate();
      });
      this.subscriptions.set(key, unsub);
    }
  }

  // === Lifecycle Methods ===

  /**
   * Mark as committed (effect is active).
   * Called at the start of useLayoutEffect.
   */
  commit(): void {
    // Resubscribe if StrictMode cleanup cleared subscriptions
    if (this.subscriptions.size === 0 && this.trackedDeps.size > 0) {
      this.subscribe();
    }

    this._committed = true;
    // Allow recovery during hot reload - reset disposed flag
    this._disposed = false;
    this._pendingDisposalCheck = false;

    // If store changed since render, re-render with fresh values
    if (this._isStale) {
      this._isStale = false;
      this._forceUpdate();
    }
  }

  /**
   * Mark as uncommitted (effect cleaned up).
   * Schedules deferred disposal check.
   */
  uncommit(): void {
    this._cleanupSubscriptions();
    this._committed = false;
    this._flushScheduled = false;
    this._disposeIfUnused();
  }

  // === Scoped Store Methods ===

  /**
   * Get or create a scoped store instance.
   */
  getScoped<TState extends StateBase, TActions extends ActionsBase>(
    spec: StoreSpec<TState, TActions>
  ): StoreInstance<TState, TActions> {
    if (this._disposed) {
      if (this.deferDisposal) {
        this._committed = false;
        this._disposed = false;
        this._scopedStores.clear();
      } else {
        throw new Error("UseStoreController disposed");
      }
    }
    let store = this._scopedStores.get(spec);
    if (!store) {
      store = this.container.create(spec);
      this._scopedStores.set(spec, store);
    }
    return store;
  }

  // === Private Methods ===

  private _cleanupSubscriptions(): void {
    for (const unsub of this.subscriptions.values()) {
      unsub();
    }
    this.subscriptions.clear();
  }

  private _scheduleFlushIfCommitted(): void {
    if (!this._committed || this._flushScheduled) return;
    this._flushScheduled = true;

    microtask(() => {
      this._flushScheduled = false;
      if (!this._committed || !this._isStale) return;
      this._isStale = false;
      this._forceUpdate();
    });
  }

  private _disposeIfUnused(): void {
    if (this._committed || this._disposed || this._pendingDisposalCheck) return;

    if (this.deferDisposal) {
      this._pendingDisposalCheck = true;
      setTimeout(() => {
        this._pendingDisposalCheck = false;
        if (!this._committed) {
          this.dispose();
        }
      }, 0);
    } else {
      this.dispose();
    }
  }

  dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    // Dispose scoped stores
    for (const store of this._scopedStores.values()) {
      store.dispose();
    }
    this._scopedStores.clear();

    // Clear prev values for fresh start if recovered
    this.prevValues.clear();
    this._onDispose?.();
  }
}
