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
// Effect
// =============================================================================

/**
 * Effect function type.
 * Can return an optional cleanup function.
 */
export type EffectFn = () => void | VoidFunction;

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
 * @param fn - Effect function (can return cleanup)
 * @param options - Effect options (error handling, etc.)
 * @returns Dispose function to stop the effect
 *
 * @example
 * // Basic effect
 * effect(() => {
 *   console.log(state.count); // Tracked dependency
 * });
 *
 * @example
 * // With error handling - keep alive on error
 * effect(() => {
 *   riskyOperation();
 * }, { onError: "keepAlive" });
 *
 * @example
 * // With retry
 * effect(() => {
 *   fetchData();
 * }, { onError: { maxRetries: 3, delay: 1000 } });
 *
 * @example
 * // Custom error handler
 * effect(() => {
 *   doSomething();
 * }, { onError: ({ error, retry, retryCount }) => {
 *   if (retryCount < 3) retry();
 *   else console.error(error);
 * }});
 */
export function effect(fn: EffectFn, options?: EffectOptions): VoidFunction {
  let cleanup: VoidFunction | null = null;
  let subscriptions: VoidFunction[] = [];
  let isRunning = false;
  let isDisposed = false;
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

      // Cancel pending retry
      if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
      }

      // Cleanup previous run
      cleanup?.();
      cleanup = null;

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

      try {
        // Cleanup previous run
        cleanup?.();
        cleanup = null;

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

              // Check for self-reference: reading AND writing same property
              if (trackedDeps.has(key)) {
                throw new Error(
                  `Self-reference detected: Effect reads and writes "${event.prop}". ` +
                    `This would cause an infinite loop.`
                );
              }

              writtenProps.add(key);
            },
          }),
          () => {
            const result = fn();
            if (typeof result === "function") {
              cleanup = result;
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

