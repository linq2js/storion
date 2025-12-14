/**
 * Reactive effect system.
 *
 * Effects run immediately and re-run when tracked dependencies change.
 * Dependencies are automatically tracked when state properties are read.
 */

import type { StoreResolver } from "../types";
import { withHooks, getHooks, scheduleNotification } from "./tracking";

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
  /** Store-level error handler (fallback if effect doesn't specify) */
  onError?: EffectErrorStrategy;
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
  nth: number,
  isStale: () => boolean
): EffectContext {
  const cleanups: VoidFunction[] = [];
  let abortController: AbortController | null = null;

  const runCleanups = () => {
    // Abort signal first
    if (abortController) {
      abortController.abort();
      abortController = null;
    }

    // Run cleanups in LIFO order
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop()!;
      try {
        cleanup();
      } catch (e) {
        console.error("Effect cleanup error:", e);
      }
    }
  };

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
      cleanups.push(listener);
      // Return unregister function
      return () => {
        const index = cleanups.indexOf(listener);
        if (index !== -1) {
          cleanups.splice(index, 1);
        }
      };
    },

    safe<T>(promiseOrCallback: Promise<T> | ((...args: unknown[]) => T)): any {
      if (promiseOrCallback instanceof Promise) {
        // Wrap promise
        return new Promise<T>((resolve, reject) => {
          promiseOrCallback.then(
            (value) => {
              if (!isStale()) {
                resolve(value);
              }
              // Never resolve/reject if stale - promise stays pending
            },
            (error) => {
              if (!isStale()) {
                reject(error);
              }
              // Never resolve/reject if stale
            }
          );
        });
      }

      // Wrap callback
      return (...args: unknown[]) => {
        if (!isStale()) {
          return (promiseOrCallback as (...args: unknown[]) => T)(...args);
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
 * Resolve error strategy from effect options or store options.
 * Default: "keepAlive" - effect stays reactive even on error.
 */
function resolveErrorStrategy(
  effectOptions?: EffectOptions,
  runOptions?: RunEffectOptions
): EffectErrorStrategy {
  return effectOptions?.onError ?? runOptions?.onError ?? "keepAlive";
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
  let currentContext: (EffectContext & { _runCleanups: () => void }) | null =
    null;
  let subscriptions: VoidFunction[] = [];
  let isRunning = false;
  let isDisposed = false;
  let runGeneration = 0; // Track effect generations for staleness
  let retryCount = 0;
  let retryTimeout: ReturnType<typeof setTimeout> | null = null;

  // Previous successful state (for keepAlive strategy)
  let prevTrackedDeps = new Map<
    string,
    { storeId: string; prop: string; resolver: StoreResolver }
  >();
  let prevSubscriptions: VoidFunction[] = [];

  const runEffect = (runOptions?: RunEffectOptions): VoidFunction => {
    const errorStrategy = resolveErrorStrategy(options, runOptions);

    // Dispose function
    const dispose = () => {
      if (isDisposed) return;
      isDisposed = true;
      runGeneration++; // Mark all pending async as stale

      // Cancel pending retry
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }

      // Run context cleanups
      currentContext?._runCleanups();
      currentContext = null;

      // Unsubscribe all
      for (const unsub of subscriptions) {
        unsub();
      }
      subscriptions = [];

      // Also cleanup previous subscriptions (keepAlive)
      for (const unsub of prevSubscriptions) {
        unsub();
      }
      prevSubscriptions = [];
    };

    // Track dependencies and written props
    let trackedDeps = new Map<
      string,
      { storeId: string; prop: string; resolver: StoreResolver }
    >();
    const writtenProps = new Set<string>();

    const subscribeToTrackedDeps = () => {
      // Subscribe to tracked dependencies (excluding written props)
      for (const [key, dep] of trackedDeps) {
        // Skip properties that were written by this effect
        if (writtenProps.has(key)) {
          continue;
        }

        const instance = dep.resolver.get(dep.storeId);
        if (instance) {
          // Use internal subscription if available (doesn't affect refCount)
          const subscribeMethod =
            (instance as any)._subscribeInternal ??
            ((prop: string, listener: () => void) =>
              instance.subscribe(prop as any, listener));

          const unsub = subscribeMethod(dep.prop, () => {
            // Re-run effect when dependency changes
            scheduleNotification(executeEffect, fn);
          });
          subscriptions.push(unsub);
        }
      }
    };

    const handleError = (error: unknown) => {
      if (errorStrategy === "failFast") {
        // Default: let error propagate, effect becomes inactive
        throw error;
      }

      if (errorStrategy === "keepAlive") {
        console.error("Effect error (keepAlive):", error);

        // If we have previous subscriptions, restore them
        if (prevSubscriptions.length > 0) {
          trackedDeps = new Map(prevTrackedDeps);
          subscriptions = [...prevSubscriptions];
          return;
        }

        // First run failed - subscribe to whatever deps were tracked before error
        // This keeps the effect reactive so it can retry when deps change
        subscribeToTrackedDeps();
        return;
      }

      if (typeof errorStrategy === "function") {
        // Custom error handler
        const retry = () => {
          retryCount++;
          executeEffect();
        };
        errorStrategy({ error, retry, retryCount });
        return;
      }

      // Retry config
      const retryConfig = errorStrategy as EffectRetryConfig;
      if (retryCount < retryConfig.maxRetries) {
        const delay = getRetryDelay(retryConfig, retryCount);
        retryCount++;
        retryTimeout = setTimeout(() => {
          retryTimeout = null;
          executeEffect();
        }, delay);
      } else {
        // Max retries reached
        console.error(
          `Effect failed after ${retryConfig.maxRetries} retries:`,
          error
        );
      }
    };

    const executeEffect = () => {
      if (isDisposed || isRunning) return;
      isRunning = true;

      // Increment generation to mark previous async operations as stale
      const currentGeneration = ++runGeneration;

      try {
        // Run previous context cleanups (this handles onCleanup registrations)
        currentContext?._runCleanups();
        currentContext = null;

        // Save current state before clearing (for keepAlive)
        if (subscriptions.length > 0) {
          prevTrackedDeps = new Map(trackedDeps);
          prevSubscriptions = [...subscriptions];
        }

        // Unsubscribe previous
        for (const unsub of subscriptions) {
          unsub();
        }
        subscriptions = [];
        trackedDeps.clear();
        writtenProps.clear();

        // Create new context for this run
        // nth is 1-indexed (first run = 1), using currentGeneration as the value
        const isStale = () => isDisposed || runGeneration !== currentGeneration;
        currentContext = createEffectContext(
          currentGeneration,
          isStale
        ) as EffectContext & {
          _runCleanups: () => void;
        };

        // Run effect with tracking
        withHooks(
          (current) => ({
            ...current,
            onRead: (event) => {
              current.onRead?.(event); // Call existing hooks (devtools)
              const key = `${event.storeId}.${event.prop}`;
              if (!trackedDeps.has(key)) {
                trackedDeps.set(key, {
                  storeId: event.storeId,
                  prop: event.prop,
                  resolver: event.resolver,
                });
              }
            },
            onWrite: (event) => {
              current.onWrite?.(event); // Call existing hooks
              const key = `${event.storeId}.${event.prop}`;
              // Track written props to skip subscribing to them
              // This allows patterns like: state.count += state.by
              // Effect will re-run on `by` change, not `count` change
              writtenProps.add(key);
            },
          }),
          () => {
            const result: unknown = fn(currentContext!);

            // Prevent async effects - they cause tracking issues
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
          }
        );

        // Success - reset retry count and subscribe
        retryCount = 0;
        subscribeToTrackedDeps();

        // Clear previous state after successful run
        prevTrackedDeps.clear();
        prevSubscriptions = [];
      } catch (error) {
        handleError(error);
      } finally {
        isRunning = false;
      }
    };

    // Initial run
    executeEffect();

    return dispose;
  };

  // Schedule effect via hooks (store can defer until after instance creation)
  getHooks().scheduleEffect(runEffect);

  // Return dispose (may not work if scheduleEffect defers)
  return () => {
    // This will be handled by the scheduled effect's dispose
  };
}
