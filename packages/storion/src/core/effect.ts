/**
 * Reactive effect system.
 *
 * Effects run immediately and re-run when tracked dependencies change.
 * Dependencies are automatically tracked when state properties are read.
 */

import type { Emitter } from "../emitter";
import { emitter } from "../emitter";
import { isPromiseLike } from "../utils/isPromiseLike";
import {
  withHooks,
  getHooks,
  scheduleNotification,
  type Hooks,
} from "./tracking";

// =============================================================================
// Effect Error Handling Types
// =============================================================================

/**
 * Retry configuration for effects.
 */
export interface EffectRetryConfig {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Delay in ms between retries (or function for custom backoff) */
  delay?: number | ((attempt: number) => number);
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
   * Wrap a promise to never resolve if effect becomes stale.
   * Useful for async operations that should be cancelled on re-run.
   *
   * @example
   * effect((ctx) => {
   *   ctx.safe(fetchData()).then(data => {
   *     // Only runs if effect hasn't re-run
   *     state.data = data;
   *   });
   * });
   */
  safe<T>(promise: Promise<T>): Promise<T>;

  /**
   * Wrap a callback to not run if effect is stale/disposed.
   * Useful for event handlers and timeouts.
   *
   * @example
   * effect((ctx) => {
   *   const handler = ctx.safe((event) => {
   *     // Only runs if effect is still active
   *     state.value = event.target.value;
   *   });
   *   element.addEventListener('input', handler);
   *   ctx.onCleanup(() => element.removeEventListener('input', handler));
   * });
   */
  safe<TArgs extends unknown[], TReturn>(
    callback: (...args: TArgs) => TReturn
  ): (...args: TArgs) => TReturn | undefined;
}

/**
 * Create an EffectContext for a single effect run.
 */
function createEffectContext(
  nth: number
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

  /**
   * return a promise that never resolves or rejects if the effect is stale
   * @param promise - The promise to wrap
   * @returns The wrapped promise
   */
  function wrapPromise<T>(promise: PromiseLike<T>): PromiseLike<T> {
    return new Promise<T>((resolve, reject) => {
      promise.then(
        (value) => {
          if (!isStale) {
            resolve(value);
          }
        },
        (error) => {
          if (!isStale) {
            reject(error);
          }
        }
      );
    });
  }

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

    safe<T>(
      promiseOrCallback: PromiseLike<T> | ((...args: unknown[]) => T)
    ): any {
      if (promiseOrCallback instanceof Promise) {
        // Wrap promise
        return wrapPromise(promiseOrCallback);
      }

      // Wrap callback
      return (...args: unknown[]) => {
        if (!isStale) {
          const result = (promiseOrCallback as (...args: unknown[]) => T)(
            ...args
          );
          if (isPromiseLike<T>(result)) {
            return wrapPromise<T>(result);
          }

          return result;
        }
        return undefined;
      };
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
  if (typeof config.delay === "function") {
    return config.delay(attempt);
  }
  return config.delay ?? 100 * Math.pow(2, attempt); // Default: exponential backoff
}

/**
 * Create a reactive effect.
 *
 * The effect runs immediately and re-runs when any tracked dependency changes.
 * Dependencies are automatically tracked when state properties are read.
 *
 * Effects can span multiple stores - use `resolver` from ReadEvent to subscribe.
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
 * }, { onError: { maxRetries: 3, delay: 1000 } });
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
    if (retryCount < retryConfig.maxRetries) {
      const delay = getRetryDelay(retryConfig, retryCount);
      retryCount++;
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        execute();
      }, delay);
    } else {
      console.error(
        `Effect failed after ${retryConfig.maxRetries} retries:`,
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

      const getOrCreateContext = () => {
        if (!lazyContext) {
          lazyContext = createEffectContext(currentGeneration);
        }
        return lazyContext;
      };

      const lazyContextProxy = new Proxy({} as EffectContext, {
        get(_, prop) {
          return getOrCreateContext()[prop as keyof EffectContext];
        },
      });

      // Run effect with tracking
      withHooks(getTrackingHooks, () => {
        const result: unknown = fn(lazyContextProxy);

        if (
          result !== null &&
          result !== undefined &&
          typeof (result as PromiseLike<unknown>).then === "function"
        ) {
          throw new Error(
            "Effect function must be synchronous. " +
              "Use ctx.safe(promise) for async operations instead of returning a Promise."
          );
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
      handleError(error);
    } finally {
      isRunning = false;
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
