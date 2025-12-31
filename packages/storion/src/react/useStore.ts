/**
 * useStore React Hook
 *
 * Consumes stores with automatic optimization.
 */

import { useReducer, useEffect, useRef, useLayoutEffect } from "react";

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
import { isPromiseLike } from "../utils/isPromiseLike";
import { useStrictMode } from "./strictMode";
import { dev } from "../dev";

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" && typeof useLayoutEffect === "function"
    ? useLayoutEffect
    : useEffect;

// =============================================================================
// DISPOSE STRATEGIES
// =============================================================================

/**
 * Strategy for handling disposal timing.
 *
 * @param dispose - Function to dispose the controller
 * @param when - "render" = called during render cleanup, "uncommit" = called during effect cleanup
 * @returns Optional cleanup function to cancel scheduled disposal
 */
type DisposeStrategy = (
  dispose: VoidFunction,
  when: "render" | "uncommit"
) => void | VoidFunction;

/**
 * Normal mode strategy: dispose with small delay on uncommit.
 * The delay allows HMR (Hot Module Replacement) to complete before disposal.
 * In production, this 50ms delay is negligible but prevents HMR issues in dev.
 */
const HMR_SAFETY_DELAY = 50;

const normalStrategy: DisposeStrategy = dev()
  ? (dispose, when) => {
      if (when === "uncommit") {
        const id = setTimeout(dispose, HMR_SAFETY_DELAY);
        return () => clearTimeout(id);
      }
    }
  : (dispose, when) => {
      if (when === "uncommit") {
        dispose();
      }
    };

/**
 * Strict mode strategy: defer disposal with setTimeout.
 * Handles React's double-mount by allowing cancellation if component remounts.
 *
 * Both "render" and "uncommit" schedule deferred disposal because:
 * - StrictMode unmounts/remounts, making the first controller "abandoned"
 * - The deferred disposal allows the 2nd mount to cancel if same fiber
 *
 * Uses 100ms delay instead of 0 to handle HMR (Hot Module Replacement):
 * - HMR involves async module loading which can take longer than setTimeout(0)
 * - Without delay, disposal can fire DURING HMR, causing "store disposed" errors
 * - 100ms is short enough for responsive UX but long enough for HMR to complete
 */
const STRICT_MODE_DISPOSE_DELAY = 100;

const strictStrategy: DisposeStrategy = (dispose, _when) => {
  const id = setTimeout(dispose, STRICT_MODE_DISPOSE_DELAY);
  return () => clearTimeout(id);
};

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
  const isStrictMode = useStrictMode();
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0);

  // Select strategy based on mode
  const strategy = isStrictMode ? strictStrategy : normalStrategy;

  // Use useRef to ensure persistence across React concurrent renders.
  // In concurrent mode, initializers can run multiple times for different "attempts",
  // but useRef.current persists across all attempts for the same fiber.
  const controllerRef = useRef<UseStoreController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new UseStoreController(
      container,
      forceUpdate,
      strategy,
      // onDispose: Clear ref so next render creates fresh controller.
      // Critical for Suspense: when promise is thrown, React preserves refs,
      // but the controller may be disposed. Clearing ensures fresh start on retry.
      () => {
        controllerRef.current = null;
      }
    );
  }
  const controller = controllerRef.current;

  // === RENDER PHASE ===
  // render() handles: preRender, selector execution, postRender (subscribe)
  // On error: disposes and rethrows (postRender doesn't happen)
  const output = controller.render(() => {
    // Capture once flag before selector runs
    const shouldRunOnce = !controller.onceRan;

    // Create selector context
    const ctx: SelectorContext = {
      [STORION_TYPE]: "selector.context",
      id: controller.id,
      container,

      get(specOrFactory: any): any {
        if (!isSpec(specOrFactory)) {
          return container.get(specOrFactory);
        }
        const instance = container.get(specOrFactory);
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
        if (shouldRunOnce) {
          callback();
        }
      },

      scoped(spec: any): any {
        if (!controller.selectorExecution.active) {
          throw new ScopedOutsideSelectorError();
        }
        const instance = controller.getScoped(spec);
        return storeTuple(instance);
      },
    };

    // Run selector with hooks to track dependencies
    controller.selectorExecution.active = true;
    useStoreSelectorDepth++;
    try {
      const result = withHooks(
        {
          onRead: (event) => controller.trackDep(event),
          scheduleEffect: (runEffect) =>
            controller.scheduledEffects.push(runEffect),
        },
        () => {
          const selectorResult = selector(ctx);

          // Prevent async selectors
          if (
            selectorResult &&
            typeof (selectorResult as unknown as PromiseLike<unknown>).then ===
              "function"
          ) {
            throw new AsyncFunctionError(
              "useStore selector",
              "Do not return a Promise from the selector function."
            );
          }

          // Handle void/undefined selectors
          if (selectorResult === undefined || selectorResult === null) {
            return undefined as any;
          }

          // Build output with stable values
          const out = (
            Array.isArray(selectorResult) ? [] : {}
          ) as StableResult<T>;
          for (const [key, value] of Object.entries(selectorResult)) {
            (out as any)[key] = controller.stabilize(key, value);
          }
          return out;
        }
      );

      // Mark once as ran after successful execution
      if (shouldRunOnce) {
        controller.onceRan = true;
      }

      return result;
    } finally {
      controller.selectorExecution.active = false;
      useStoreSelectorDepth--;
    }
  });

  // === COMMIT/CLEANUP: Once on mount/unmount ===
  // deps = [] ensures commit/cleanup run exactly once per mount cycle.
  // StrictMode double-mount naturally creates commit/cleanup pairs.
  useIsomorphicLayoutEffect(() => {
    controller.commit();
    return () => controller.cleanup();
  }, []);

  // === RUN EFFECTS: Every render ===
  // Effects from effect() in selector need to run after each render
  // to access fresh closure values (refs, props, hooks).
  // Returns cleanup function that React calls on unmount/re-render.
  useIsomorphicLayoutEffect(() => controller.runEffects());

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

// =============================================================================
// USE STORE CONTROLLER
// =============================================================================

/**
 * Controller for useStore hook - manages subscriptions, scoped stores, and lifecycle.
 *
 * ## Lifecycle
 *
 * ```
 * render() → commit() → [re-renders...] → cleanup() → dispose
 *            ↑                              ↓
 *            └──────── StrictMode ──────────┘
 * ```
 *
 * ## Public API
 *
 * - `render<T>(fn: () => T): T` - Execute selector, handle subscriptions
 * - `commit()` - Mark as committed (effect is active)
 * - `cleanup()` - Cleanup subscriptions, schedule disposal
 * - `runEffects(): VoidFunction` - Run scheduled effects, return cleanup
 */
class UseStoreController {
  /** Unique ID for this controller (for debugging) */
  readonly id = `useStore:${++controllerId}`;

  // === Subscription State ===
  private readonly _prevValues = new Map<string, { value: unknown }>();
  private readonly _trackedDeps = new Map<string, ReadEvent>();
  private readonly _subscriptions = new Map<string, VoidFunction>();

  /** Whether once() has been executed */
  onceRan = false;

  // === Lifecycle State ===
  private _committed = false;
  private _isStale = false;
  private _flushScheduled = false;
  private _disposed = false;
  private _cancelScheduledDisposal: VoidFunction | null = null;
  private _subscribed = false;

  // === Scoped Stores ===
  private readonly _scopedStores = new Map<
    StoreSpec<any, any>,
    StoreInstance<any, any>
  >();

  // === Selector Execution State ===
  readonly selectorExecution = { active: false };
  readonly scheduledEffects: (() => VoidFunction)[] = [];

  constructor(
    public readonly container: StoreContainer,
    private readonly _forceUpdate: () => void,
    private readonly _disposeStrategy: DisposeStrategy,
    private readonly _onDispose: VoidFunction
  ) {}

  // ==========================================================================
  // PUBLIC API
  // ==========================================================================

  /**
   * Execute selector with dependency tracking.
   * Handles: preRender → selector → postRender (subscribe)
   * On error: disposes and rethrows
   */
  render<T>(fn: () => T): T {
    // --- PRE-RENDER ---
    this._cleanupScheduledDisposal();
    this._isStale = false;
    // NOTE: Don't set _committed = false here!
    // With deps=[], commit() only runs once. If we clear _committed on every render,
    // subscription callbacks won't forceUpdate on re-renders.
    // _committed is set false only in cleanup() when component unmounts.
    this._cleanupSubscriptions();
    this._trackedDeps.clear();
    this.scheduledEffects.length = 0;

    // --- SELECTOR EXECUTION ---
    let result: T;
    try {
      result = fn();
    } catch (error) {
      // Don't dispose on Suspense (promise throw) - React will retry
      // Only dispose on actual errors
      if (!isPromiseLike(error)) {
        this._dispose();
      }
      throw error;
    }

    // --- POST-RENDER ---
    this._subscribe();

    this._scheduleDispose("render");

    return result;
  }

  private _cleanupScheduledDisposal(): void {
    this._cancelScheduledDisposal?.();
    this._cancelScheduledDisposal = null;
  }

  private _scheduleDispose(when: "render" | "uncommit") {
    this._cleanupScheduledDisposal();
    // Schedule disposal via strategy
    const cancel = this._disposeStrategy(() => this._dispose(), when);
    if (cancel) {
      this._cancelScheduledDisposal = cancel;
    }
  }

  /**
   * Mark as committed (effect is active).
   * Cancels any scheduled disposal and handles stale state.
   */
  commit(): void {
    // Cancel any pending disposal (we're still alive!)
    this._cleanupScheduledDisposal();

    // Resubscribe if cleanup cleared subscriptions
    this._subscribe();

    this._committed = true;
    this._disposed = false; // Allow recovery during hot reload

    // If store changed since render, re-render with fresh values
    if (this._isStale) {
      this._isStale = false;
      this._forceUpdate();
    }
  }

  /**
   * Cleanup subscriptions and schedule disposal.
   * Called on effect cleanup (unmount or StrictMode remount).
   */
  cleanup(): void {
    this._cleanupSubscriptions();
    this._committed = false;
    this._flushScheduled = false;
    // Schedule disposal via strategy
    this._scheduleDispose("uncommit");
  }

  /**
   * Run scheduled effects and return cleanup function.
   */
  runEffects(): VoidFunction {
    this._cleanupScheduledDisposal();

    const disposers = emitter();
    try {
      for (const runEffect of this.scheduledEffects) {
        disposers.on(runEffect());
      }
    } catch (ex) {
      disposers.emitAndClear();
      throw ex;
    }
    return () => disposers.emitAndClear();
  }

  // ==========================================================================
  // HELPER METHODS (called from useStoreWithContainer)
  // ==========================================================================

  /** Track a dependency from selector execution */
  trackDep(event: ReadEvent): void {
    this._trackedDeps.set(event.key, event);
  }

  /** Stabilize a value across renders */
  stabilize(key: string, value: unknown): unknown {
    const prev = this._prevValues.get(key);
    const [stableValue] = tryStabilize(prev, value, strictEqual);

    if (prev) {
      prev.value = stableValue;
    } else {
      this._prevValues.set(key, { value: stableValue });
    }

    return stableValue;
  }

  /** Get or create a scoped store instance */
  getScoped<TState extends StateBase, TActions extends ActionsBase>(
    spec: StoreSpec<TState, TActions>
  ): StoreInstance<TState, TActions> {
    if (this._disposed) {
      throw new Error("Scoped store accessed after disposal");
    }
    let store = this._scopedStores.get(spec);
    if (!store) {
      store = this.container.create(spec);
      this._scopedStores.set(spec, store);
    }
    return store;
  }

  // ==========================================================================
  // PRIVATE METHODS
  // ==========================================================================

  private _subscribe(): void {
    if (this._subscribed) return;
    this._subscribed = true;
    for (const [key, dep] of this._trackedDeps) {
      const unsub = dep.subscribe(() => {
        // Before commit: mark stale, commit() will forceUpdate
        if (!this._committed) {
          this._isStale = true;
          return;
        }

        // During another selector: defer to avoid React warnings
        if (useStoreSelectorDepth > 0 || this.selectorExecution.active) {
          this._isStale = true;
          this._scheduleFlushIfCommitted();
          return;
        }

        // Normal update: re-render immediately
        this._forceUpdate();
      });
      this._subscriptions.set(key, unsub);
    }
  }

  private _cleanupSubscriptions(): void {
    if (!this._subscribed) return;
    this._subscribed = false;
    for (const unsub of this._subscriptions.values()) {
      unsub();
    }
    this._subscriptions.clear();
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

  private _dispose(): void {
    if (this._disposed) return;
    this._disposed = true;

    // Dispose scoped stores
    for (const store of this._scopedStores.values()) {
      store.dispose();
    }
    this._scopedStores.clear();

    // Clear prev values for fresh start if recovered
    this._prevValues.clear();

    // Notify parent to clear ref (critical for Suspense)
    this._onDispose();
  }
}

let controllerId = 0;
