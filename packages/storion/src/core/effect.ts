/**
 * Reactive effect system.
 *
 * Effects run immediately and re-run when tracked dependencies change.
 * Dependencies are automatically tracked when state properties are read.
 */

import type { Emitter } from "../emitter";
import { emitter } from "../emitter";
import {
  withHooks,
  getHooks,
  scheduleNotification,
  type Hooks,
} from "./tracking";
import { EffectRefreshError, AsyncFunctionError } from "../errors";
import { isPromiseLike } from "../utils/isPromiseLike";
import { createSafe, type SafeFnWithUtils } from "../async/safe";
import { retryStrategy, type RetryStrategyName } from "../async/types";

// =============================================================================
// Effect Error Handling Types
// =============================================================================

/**
 * Retry delay: milliseconds, strategy name, or custom function.
 */
export type EffectRetryDelay =
  | number
  | RetryStrategyName
  | ((attempt: number) => number);

/**
 * Retry configuration for effects.
 * Unified with async module retry options.
 */
export interface EffectRetryConfig {
  /** Number of retry attempts */
  retries: number;
  /** Delay between retries: ms, strategy name, or custom function (default: "backoff") */
  delay?: EffectRetryDelay;
}

/**
 * Context passed to custom error handlers.
 */
export interface EffectErrorContext {
  /** The error that was thrown */
  error: unknown;
  /** Call to retry the effect immediately */
  retry: () => void;
  /** Number of times this error has occurred consecutively */
  retryCount: number;
}

/**
 * Error handling strategy for effects.
 */
export type EffectErrorStrategy =
  | "failFast" // Stop effect, incomplete deps
  | "keepAlive" // Keep last dependencies, effect stays reactive (default)
  | EffectRetryConfig
  | ((context: EffectErrorContext) => void);

/**
 * Options for effect().
 */
export interface EffectOptions {
  /** Error handling strategy */
  onError?: EffectErrorStrategy;
}

/**
 * Options passed from store to effect via scheduleEffect hook.
 */
export interface RunEffectOptions {
  /** Store-level error callback - always called when effect errors */
  onError?: (error: unknown) => void;
}

// =============================================================================
// Effect Context
// =============================================================================

/**
 * Context passed to effect functions.
 * Provides utilities for safe cleanup and async handling.
 */
export interface EffectContext {
  /**
   * The run number (1-indexed). Increments each time the effect runs.
   * Can be used as a token to detect stale async operations.
   *
   * @example
   * effect((ctx) => {
   *   const runToken = ctx.nth;
   *   fetchData().then(data => {
   *     if (ctx.nth === runToken) {
   *       state.data = data; // Only if still same run
   *     }
   *   });
   * });
   */
  readonly nth: number;

  /**
   * AbortSignal that is aborted when effect is cleaned up.
   * Created lazily on first access.
   *
   * @example
   * effect((ctx) => {
   *   fetch('/api/data', { signal: ctx.signal });
   * });
   */
  readonly signal: AbortSignal;

  /**
   * Register a cleanup function.
   * Cleanup runs when effect re-runs or is disposed.
   * Can be called multiple times - all cleanups run in LIFO order.
   *
   * @returns Unregister function to remove this cleanup
   *
   * @example
   * effect((ctx) => {
   *   const sub = subscribe();
   *   ctx.onCleanup(() => sub.unsubscribe()); // Registered before risky code
   *   doSomethingRisky(); // Even if this throws, cleanup runs
   * });
   */
  onCleanup(listener: VoidFunction): VoidFunction;

  /**
   * Safely execute operations that should be cancelled if effect becomes stale.
   *
   * Overloads:
   * 1. `safe(promise)` - Wrap promise, never resolve/reject if stale
   * 2. `safe(fn, ...args)` - Call function, wrap result if promise
   * 3. `safe(Abortable, ...args)` - Call with signal, wrap result if promise
   *
   * Utilities:
   * - `safe.all([...])` - Like Promise.all, cancellation-aware
   * - `safe.race([...])` - Like Promise.race, cancellation-aware
   * - `safe.any([...])` - Like Promise.any, cancellation-aware
   * - `safe.settled([...])` - Like Promise.allSettled, cancellation-aware
   * - `safe.callback(fn)` - Wrap callback to only execute if not stale
   *
   * @example
   * ```ts
   * effect((ctx) => {
   *   // Wrap a promise
   *   ctx.safe(fetchData()).then(data => {
   *     state.data = data;
   *   });
   *
   *   // Concurrent operations
   *   ctx.safe.all([fetchA(), fetchB()]).then(([a, b]) => {
   *     state.data = { a, b };
   *   });
   *
   *   // Wrap event callback
   *   const onClick = ctx.safe.callback(() => state.clicked = true);
   * });
   * ```
   */
  safe: SafeFnWithUtils;

  /**
   * Manually trigger a re-run of the effect.
   * Useful for async.derive pattern where thrown promises should trigger re-computation.
   *
   * Note: If called while the effect is currently running, the refresh will be
   * scheduled for after the current run completes.
   *
   * @example
   * effect((ctx) => {
   *   try {
   *     const data = async.wait(state.asyncData); // throws if pending
   *     state.computed = transform(data);
   *   } catch (ex) {
   *     if (isPromise(ex)) {
   *       ctx.safe(ex).then(ctx.refresh, ctx.refresh);
   *     }
   *   }
   * });
   */
  refresh(): void;
}

/**
 * Create an EffectContext for a single effect run.
 */
function createEffectContext(
  nth: number,
  onRefresh: () => void
): EffectContext & { _runCleanups: () => void } {
  // Lazy initialization - only create when actually used
  let cleanupEmitter: Emitter | null = null;
  let abortController: AbortController | null = null;
  let isStale = false;

  const runCleanups = () => {
    if (isStale) return;
    isStale = true;
    // Abort signal first
    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    // Run cleanups in LIFO order - errors throw naturally
    if (cleanupEmitter && cleanupEmitter.size > 0) {
      cleanupEmitter.emitAndClearLifo();
    }
  };

  // Create safe function using shared utility
  const safe = createSafe(
    () => (abortController ? abortController.signal : undefined),
    () => isStale
  );

  const context: EffectContext = {
    nth,

    get signal() {
      // Lazy creation
      if (!abortController) {
        abortController = new AbortController();
      }
      return abortController.signal;
    },

    onCleanup(listener: VoidFunction): VoidFunction {
      // Lazy init emitter
      if (!cleanupEmitter) {
        cleanupEmitter = emitter();
      }
      return cleanupEmitter.on(listener);
    },

    safe,

    refresh() {
      if (!isStale) {
        onRefresh();
      }
    },
  };

  return Object.assign(context, { _runCleanups: runCleanups });
}

// =============================================================================
// Effect
// =============================================================================

/**
 * Effect function type.
 * Receives EffectContext for cleanup registration, safe async, and abort signal.
 */
export type EffectFn = (ctx: EffectContext) => void;

/**
 * Resolve error strategy from effect options.
 * Default: "keepAlive" - effect stays reactive even on error.
 */
function resolveErrorStrategy(
  effectOptions?: EffectOptions
): EffectErrorStrategy {
  return effectOptions?.onError ?? "keepAlive";
}

/**
 * Get delay for retry attempt.
 */
function getRetryDelay(config: EffectRetryConfig, attempt: number): number {
  const { delay = "backoff" } = config;

  // Named strategy
  if (typeof delay === "string") {
    return retryStrategy[delay](attempt);
  }

  // Custom function
  if (typeof delay === "function") {
    return delay(attempt);
  }

  // Fixed number
  return delay;
}

/**
 * Create a reactive effect.
 *
 * The effect runs immediately and re-runs when any tracked dependency changes.
 * Dependencies are automatically tracked when state properties are read.
 *
 * Effects can span multiple stores - use `resolver` from ReadEvent to subscribe.
 *
 * ## Suspense-like Behavior
 *
 * Effects automatically catch thrown promises (e.g., from `async.wait()`) and
 * re-run when they resolve. Uses `ctx.nth` for staleness detection - if dependencies
 * change before the promise resolves, the refresh is skipped.
 *
 * @param fn - Effect function that receives EffectContext
 * @param options - Effect options (error handling, etc.)
 * @returns Dispose function to stop the effect
 *
 * @example
 * // Basic effect with cleanup
 * effect((ctx) => {
 *   const sub = subscribe();
 *   ctx.onCleanup(() => sub.unsubscribe());
 * });
 *
 * @example
 * // Suspense-like: auto-catches thrown promises
 * effect(() => {
 *   const s = state.otherProp;
 *   const user = async.wait(state.userAsync); // throws if pending
 *   // Effect auto-re-runs when promise resolves
 *   // If otherProp changes first, promise refresh is skipped
 *   state.computed = transform(user);
 * });
 *
 * @example
 * // Safe async - never resolves if effect re-runs
 * effect((ctx) => {
 *   ctx.safe(fetchData()).then(data => {
 *     state.data = data;
 *   });
 * });
 *
 * @example
 * // Abort signal for fetch
 * effect((ctx) => {
 *   fetch('/api/data', { signal: ctx.signal });
 * });
 *
 * @example
 * // With retry on error
 * effect((ctx) => {
 *   fetchData();
 * }, { onError: { retries: 3, delay: 1000 } });
 *
 * @example
 * // Custom error handler
 * effect((ctx) => {
 *   doSomething();
 * }, { onError: ({ error, retry, retryCount }) => {
 *   if (retryCount < 3) retry();
 *   else console.error(error);
 * }});
 */
export function effect(fn: EffectFn, options?: EffectOptions): VoidFunction {
  // ==========================================================================
  // Effect State (shared across all runs)
  // ==========================================================================

  let currentContext: (EffectContext & { _runCleanups: () => void }) | null =
    null;
  let subscriptionEmitter: Emitter | null = null;
  let isStarted = false;
  let isRunning = false;
  let isDisposed = false;
  let runGeneration = 0;
  let retryCount = 0;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;
  let errorStrategy: EffectErrorStrategy = "keepAlive";
  let onErrorCallback: ((error: unknown) => void) | null = null;

  // Tracked dependency type
  type TrackedDep = {
    key: string;
    value: unknown;
    subscribe: (listener: VoidFunction) => VoidFunction;
  };

  // Previous successful state (for keepAlive strategy)
  let prevTrackedDeps = new Map<string, TrackedDep>();
  let prevSubscriptionEmitter: Emitter | null = null;

  // Current tracked dependencies
  let trackedDeps = new Map<string, TrackedDep>();
  const writtenProps = new Set<string>();

  // For tracking during execution
  let newTrackedDeps: Map<string, TrackedDep> | null = null;

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  const getSubscriptionEmitter = () => {
    if (!subscriptionEmitter) {
      subscriptionEmitter = emitter();
    }
    return subscriptionEmitter;
  };

  const clearSubscriptions = () => {
    if (subscriptionEmitter && subscriptionEmitter.size > 0) {
      subscriptionEmitter.emitAndClear();
    }
  };

  const areDepsChanged = (
    prev: Map<string, unknown>,
    next: Map<string, unknown>
  ): boolean => {
    if (prev.size !== next.size) return true;
    for (const key of next.keys()) {
      if (!prev.has(key)) return true;
    }
    return false;
  };

  const subscribeToTrackedDeps = () => {
    for (const [key, dep] of trackedDeps) {
      if (writtenProps.has(key)) continue;

      const unsub = dep.subscribe(() => {
        scheduleNotification(execute, fn);
      });
      getSubscriptionEmitter().on(unsub);
    }
  };

  const handleError = (error: unknown) => {
    // Always notify store-level callback if provided
    onErrorCallback?.(error);

    if (errorStrategy === "failFast") {
      throw error;
    }

    if (errorStrategy === "keepAlive") {
      console.error("Effect error (keepAlive):", error);

      if (prevSubscriptionEmitter && prevSubscriptionEmitter.size > 0) {
        trackedDeps = new Map(prevTrackedDeps);
        subscriptionEmitter = prevSubscriptionEmitter;
        prevSubscriptionEmitter = null;
        return;
      }

      if (newTrackedDeps && newTrackedDeps.size > 0) {
        trackedDeps = newTrackedDeps;
      }
      subscribeToTrackedDeps();
      return;
    }

    if (typeof errorStrategy === "function") {
      const retry = () => {
        retryCount++;
        execute();
      };
      errorStrategy({ error, retry, retryCount });
      return;
    }

    const retryConfig = errorStrategy as EffectRetryConfig;
    if (retryCount < retryConfig.retries) {
      const delay = getRetryDelay(retryConfig, retryCount);
      retryCount++;
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        execute();
      }, delay);
    } else {
      console.error(
        `Effect failed after ${retryConfig.retries} retries:`,
        error
      );
    }
  };

  // Pre-allocated hooks
  let cachedHooks: import("./tracking").Hooks | null = null;

  const getTrackingHooks = (current: Hooks): Hooks => {
    if (!cachedHooks) {
      cachedHooks = {
        ...current,
        onRead: (event) => {
          current.onRead?.(event);
          if (!newTrackedDeps!.has(event.key)) {
            newTrackedDeps!.set(event.key, {
              key: event.key,
              value: event.value,
              subscribe: event.subscribe,
            });
          }
        },
        onWrite: (event) => {
          current.onWrite?.(event);
          writtenProps.add(event.key);
        },
        scheduleNotification: current.scheduleNotification,
        scheduleEffect: current.scheduleEffect,
      };
    }
    return cachedHooks;
  };

  // ==========================================================================
  // Execute - runs the effect (initial or re-run)
  // ==========================================================================

  const execute = () => {
    if (isDisposed || isRunning) return;
    isRunning = true;
    let shouldRefresh = false;

    const currentGeneration = ++runGeneration;

    try {
      // Run previous context cleanups
      currentContext?._runCleanups();
      currentContext = null;

      // Save current state for keepAlive recovery
      if (subscriptionEmitter && subscriptionEmitter.size > 0) {
        prevTrackedDeps = new Map(trackedDeps);
        prevSubscriptionEmitter = subscriptionEmitter;
        subscriptionEmitter = null;
      }

      // Reset for this run
      newTrackedDeps = new Map();
      writtenProps.clear();

      // Lazy context creation
      let lazyContext: (EffectContext & { _runCleanups: () => void }) | null =
        null;

      if (fn.length) {
        lazyContext = createEffectContext(currentGeneration, () => {
          if (isRunning) {
            throw new EffectRefreshError();
          }
          // refreshing the effect will re-run the effect, no need to re-schedule effect
          // typically calling refresh must be async, so it will be scheduled after the current run completes
          execute();
        });
      }

      // Run effect with tracking
      withHooks(getTrackingHooks, () => {
        const result: unknown = fn(lazyContext as EffectContext);

        if (
          result !== null &&
          result !== undefined &&
          typeof (result as PromiseLike<unknown>).then === "function"
        ) {
          throw new AsyncFunctionError(
            "Effect function",
            "Use ctx.safe(promise) for async operations instead of returning a Promise."
          );
        }

        // by returning the refresh function from the effect, it can be used to manually trigger a re-run of the effect
        // with this approach, we won't break rest of the effect execution
        if (lazyContext && lazyContext.refresh === result) {
          shouldRefresh = true;
        }
      });

      currentContext = lazyContext;
      retryCount = 0;

      // Handle subscription updates
      const depsChanged = areDepsChanged(trackedDeps, newTrackedDeps!);

      if (depsChanged) {
        if (prevSubscriptionEmitter && prevSubscriptionEmitter.size > 0) {
          prevSubscriptionEmitter.emitAndClear();
        }
        trackedDeps = newTrackedDeps!;
        subscribeToTrackedDeps();
      } else {
        if (prevSubscriptionEmitter) {
          subscriptionEmitter = prevSubscriptionEmitter;
        }
      }

      prevTrackedDeps.clear();
      prevSubscriptionEmitter = null;
    } catch (error) {
      // Programming errors should always be thrown, not handled
      if (error instanceof EffectRefreshError) {
        throw error;
      }

      // Check if it's a thrown promise (from async.wait on pending state)
      // This enables Suspense-like behavior in effects
      if (isPromiseLike(error)) {
        // Use ctx.nth to detect if promise callback is stale
        // If another dep triggers re-run before promise resolves, skip
        const nthAtThrow = currentGeneration;
        (error as Promise<unknown>).then(
          () => {
            // Only refresh if this is still the same run (nth unchanged)
            if (!isDisposed && runGeneration === nthAtThrow) {
              execute();
            }
          },
          (rejectionError) => {
            // On rejection, treat as normal error and use handleError
            // This respects options.onError (keepAlive, failFast, retry, custom)
            if (!isDisposed && runGeneration === nthAtThrow) {
              handleError(rejectionError);
            }
          }
        );

        // Keep subscriptions alive (similar to keepAlive strategy)
        // So dep changes can still trigger re-runs
        if (newTrackedDeps && newTrackedDeps.size > 0) {
          trackedDeps = newTrackedDeps;
        }
        subscribeToTrackedDeps();
        isRunning = false;
        return;
      }

      handleError(error);
    } finally {
      isRunning = false;
    }

    if (shouldRefresh) {
      execute();
    }
  };

  // ==========================================================================
  // Dispose - stops the effect permanently
  // ==========================================================================

  const dispose = () => {
    if (isDisposed) return;
    isDisposed = true;
    runGeneration++;

    if (retryTimeout) {
      clearTimeout(retryTimeout);
      retryTimeout = null;
    }

    currentContext?._runCleanups();
    currentContext = null;

    clearSubscriptions();

    if (prevSubscriptionEmitter && prevSubscriptionEmitter.size > 0) {
      prevSubscriptionEmitter.emitAndClear();
    }
  };

  // ==========================================================================
  // Start - called by scheduleEffect hook (only once)
  // ==========================================================================

  const start = (runOptions?: RunEffectOptions) => {
    if (isStarted) return;
    isStarted = true;
    errorStrategy = resolveErrorStrategy(options);
    onErrorCallback = runOptions?.onError ?? null;
    execute();
  };

  // ==========================================================================
  // Schedule via hooks
  // ==========================================================================

  getHooks().scheduleEffect((runOptions?: RunEffectOptions) => {
    start(runOptions);
    return dispose;
  });

  return dispose;
}
