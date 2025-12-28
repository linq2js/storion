/**
 * Built-in wrapper utilities for abortable functions.
 *
 * Use with the `.use()` method to compose behavior:
 *
 * ```ts
 * import { retry, catchError, timeout, logging } from "storion/async";
 *
 * const getUser = userService.getUser
 *   .use(retry(3))
 *   .use(catchError(console.error))
 *   .use(timeout(5000))
 *   .use(logging("getUser"));
 * ```
 */

import { dev } from "../dev";
import {
  type AbortableContext,
  type AbortableWrapper,
  type IdentityWrapper,
} from "./abortable";
import {
  retryStrategy,
  type RetryStrategyName,
  type AsyncRetryDelayFn,
} from "./types";

// =============================================================================
// Types
// =============================================================================

/** Options for retry wrapper */
export interface RetryOptions {
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Delay between retries: ms, strategy name, or custom function */
  delay?: number | RetryStrategyName | AsyncRetryDelayFn;
}

/** Options for cache wrapper */
export interface CacheOptions {
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Custom key function (default: JSON.stringify of args) */
  key?: (...args: any[]) => string;
}

/** Options for rate limit wrapper */
export interface RateLimitOptions {
  /** Maximum number of calls allowed in the window */
  limit: number;
  /** Time window in milliseconds */
  window: number;
}

/** Options for circuit breaker wrapper */
export interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  threshold?: number;
  /** Time in ms before attempting to close circuit (default: 30000) */
  resetTimeout?: number;
}

/** Circuit breaker state */
type CircuitState = "closed" | "open" | "half-open";

/**
 * Lifecycle callbacks returned from observe's onStart handler.
 *
 * @template TResult - The result type of the observed function
 */
export type ObserveCallbacks<TResult> = {
  /** Called when the function is aborted via AbortController */
  onAbort?: () => void;
  /** Called when the function completes successfully */
  onSuccess?: (result: TResult) => void;
  /** Called when the function throws an error (error is re-thrown after) */
  onError?: (error: unknown) => void;
  /** Called after completion, regardless of success or error (like finally) */
  onDone?: VoidFunction;
};

/**
 * Callback invoked when the observed function starts execution.
 * Can return lifecycle callbacks for success/error/abort handling.
 *
 * @template TArgs - The argument types of the observed function
 * @template TResult - The result type of the observed function
 */
export type ObserveOnStart<TArgs extends readonly any[], TResult> = (
  ctx: AbortableContext<any>,
  ...args: TArgs
) => void | ObserveCallbacks<TResult>;

// =============================================================================
// Wrappers
// =============================================================================

/**
 * Retry on failure.
 *
 * @example
 * ```ts
 * // Retry 3 times with backoff delay
 * fn.use(retry(3))
 *
 * // Retry 3 times with named strategy
 * fn.use(retry("linear"))
 *
 * // Retry 5 times with linear delay
 * fn.use(retry({ retries: 5, delay: "linear" }))
 *
 * // Custom delay function
 * fn.use(retry({ retries: 3, delay: (attempt) => attempt * 1000 }))
 * ```
 */
export function retry(retries?: number): IdentityWrapper;
export function retry(strategy: RetryStrategyName): IdentityWrapper;
export function retry(options: RetryOptions): IdentityWrapper;
export function retry(
  retriesOrStrategyOrOptions?: number | RetryStrategyName | RetryOptions
): IdentityWrapper {
  const options: RetryOptions =
    typeof retriesOrStrategyOrOptions === "number"
      ? { retries: retriesOrStrategyOrOptions }
      : typeof retriesOrStrategyOrOptions === "string"
      ? { delay: retriesOrStrategyOrOptions }
      : retriesOrStrategyOrOptions ?? {};

  const retries = options.retries ?? 3;
  const delayOption = options.delay ?? "backoff";

  // Get delay function
  const getDelay: AsyncRetryDelayFn =
    typeof delayOption === "function"
      ? delayOption
      : typeof delayOption === "number"
      ? () => delayOption
      : retryStrategy[delayOption];

  return (next) =>
    async (ctx, ...args) => {
      let lastError: Error;

      for (let attempt = 0; attempt < retries; attempt++) {
        try {
          return await next(ctx, ...args);
        } catch (error) {
          lastError = error as Error;

          // Don't retry if cancelled
          if (ctx.signal.aborted) {
            throw error;
          }

          // Don't delay on last attempt
          if (attempt < retries - 1) {
            const delayResult = getDelay(attempt, lastError);

            if (typeof delayResult === "number") {
              // Abort-aware delay
              await new Promise<void>((resolve, reject) => {
                const timer = setTimeout(resolve, delayResult);
                const onAbort = () => {
                  clearTimeout(timer);
                  reject(ctx.signal.reason ?? new Error("Aborted"));
                };
                if (ctx.signal.aborted) {
                  onAbort();
                } else {
                  ctx.signal.addEventListener("abort", onAbort, { once: true });
                }
              });
            } else {
              // Promise<void> - wait for it (e.g., wait for network)
              await delayResult;
            }
          }
        }
      }

      throw lastError!;
    };
}

/**
 * Catch and handle errors with a callback (without swallowing them).
 *
 * @example
 * ```ts
 * fn.use(catchError((error) => {
 *   console.error("Failed:", error.message);
 *   analytics.track("error", { message: error.message });
 * }))
 * ```
 */
export function catchError(
  callback: (error: Error, ctx: AbortableContext<any>, ...args: any[]) => void
): IdentityWrapper {
  return (next) =>
    async (ctx, ...args) => {
      try {
        return await next(ctx, ...args);
      } catch (error) {
        callback(error as Error, ctx, ...args);
        throw error;
      }
    };
}

/**
 * Add timeout to abort after specified milliseconds.
 *
 * @example
 * ```ts
 * // Abort after 5 seconds
 * fn.use(timeout(5000))
 *
 * // With custom error message
 * fn.use(timeout(5000, "Request timed out"))
 * ```
 */
export function timeout(
  ms: number,
  message = "Operation timed out"
): IdentityWrapper {
  return (next) =>
    async (ctx, ...args) => {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(message));
        }, ms);

        // Clear timeout if signal is aborted
        ctx.signal.addEventListener("abort", () => clearTimeout(timer));
      });

      // Race between operation and timeout (cancellation-aware)
      return ctx.safe.race([next(ctx, ...args), timeoutPromise]);
    };
}

/**
 * Log function calls for debugging.
 *
 * Behavior varies by environment:
 * - **Development**: Always logs using `devLogger` (default: console)
 * - **Production**: Only logs if `proLogger` is provided
 *   - `proLogger: true` → use `devLogger` in prod too
 *   - `proLogger: customLogger` → use custom logger in prod
 *   - `proLogger: undefined` → no logging in prod (no-op wrapper)
 *
 * @param name - Label for log messages (e.g., function name)
 * @param devLogger - Logger for development (default: console)
 * @param proLogger - Logger for production, or `true` to use devLogger
 *
 * @example
 * ```ts
 * // Basic: logs in dev only
 * fn.use(logging("getUser"))
 * // [getUser] calling with: ["123"]
 * // [getUser] success: { id: "123", name: "John" }
 * // [getUser] error: Error: Not found
 *
 * // Log in prod too (same logger)
 * fn.use(logging("getUser", console, true))
 *
 * // Custom prod logger (e.g., error tracking service)
 * fn.use(logging("getUser", console, Sentry))
 * ```
 */
export function logging(
  name: string,
  devLogger: Pick<Console, "log" | "error"> = console,
  proLogger?: Pick<Console, "log" | "error"> | boolean
): IdentityWrapper {
  return (next) => {
    const logger = dev()
      ? devLogger
      : proLogger === true
      ? devLogger
      : proLogger || undefined;
    if (!logger) {
      return next;
    }

    return async (ctx, ...args) => {
      logger.log(`[${name}] calling with:`, args);

      try {
        const result = await next(ctx, ...args);
        logger.log(`[${name}] success:`, result);
        return result;
      } catch (error) {
        logger.error(`[${name}] error:`, error);
        throw error;
      }
    };
  };
}

/**
 * Debounce calls - only execute after delay with no new calls.
 *
 * Note: This creates a shared timer, so multiple calls to the same
 * debounced function will share the debounce state.
 *
 * @example
 * ```ts
 * // Debounce search - only execute 300ms after last keystroke
 * const debouncedSearch = search.use(debounce(300));
 * ```
 */
export function debounce(ms: number): IdentityWrapper {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return (next) =>
    async (ctx, ...args) => {
      // Clear previous timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Return a promise that will be resolved when the debounce completes
      return new Promise((resolve, reject) => {
        timeoutId = setTimeout(async () => {
          try {
            const result = await next(ctx, ...args);
            resolve(result);
          } catch (error) {
            reject(error as Error);
          }
        }, ms);

        // Cancel on abort
        ctx.signal.addEventListener("abort", () => {
          if (timeoutId) {
            clearTimeout(timeoutId);
            reject(new Error("Debounced operation cancelled"));
          }
        });
      });
    };
}

/**
 * Throttle calls - only execute once per time window.
 *
 * @example
 * ```ts
 * // Throttle to max once per second
 * const throttledSave = save.use(throttle(1000));
 * ```
 */
export function throttle(ms: number): IdentityWrapper {
  let lastCall = 0;
  let lastResult: any;
  let pending: Promise<any> | undefined;

  return (next) =>
    async (ctx, ...args) => {
      const now = Date.now();

      // If within throttle window, return last result or wait for pending
      if (now - lastCall < ms) {
        if (pending) {
          return pending;
        }
        if (lastResult !== undefined) {
          return lastResult;
        }
      }

      lastCall = now;
      pending = next(ctx, ...args);

      try {
        lastResult = await pending;
        return lastResult;
      } finally {
        pending = undefined;
      }
    };
}

/**
 * Return a fallback value on error instead of throwing.
 *
 * @example
 * ```ts
 * // Return null on error
 * fn.use(fallback(null))
 *
 * // Return empty array on error
 * fn.use(fallback([]))
 *
 * // Dynamic fallback based on error
 * fn.use(fallback((error) => ({ error: error.message })))
 * ```
 */
export function fallback<T>(
  value: T | ((error: Error, ctx: AbortableContext, ...args: any[]) => T)
): IdentityWrapper {
  return (next) =>
    async (ctx, ...args) => {
      try {
        return await next(ctx, ...args);
      } catch (error) {
        // Don't fallback on abort - propagate cancellation
        if (ctx.signal.aborted) {
          throw error;
        }
        return typeof value === "function"
          ? (value as Function)(error, ctx, ...args)
          : value;
      }
    };
}

/**
 * Cache results with TTL. Results are cached by serialized arguments.
 *
 * Note: This creates a shared cache, so all calls to the same
 * cached function share the cache.
 *
 * @example
 * ```ts
 * // Cache for 5 minutes
 * fn.use(cache(5 * 60 * 1000))
 *
 * // Cache with custom key function
 * fn.use(cache({ ttl: 60000, key: (id) => `user:${id}` }))
 * ```
 */
export function cache(ttlOrOptions: number | CacheOptions): IdentityWrapper {
  const options: CacheOptions =
    typeof ttlOrOptions === "number" ? { ttl: ttlOrOptions } : ttlOrOptions;

  const { ttl, key: keyFn = (...args: any[]) => JSON.stringify(args) } =
    options;

  const cacheMap = new Map<string, { value: any; expires: number }>();

  return (next) =>
    async (ctx, ...args) => {
      const cacheKey = keyFn(...args);
      const now = Date.now();

      // Check cache
      const cached = cacheMap.get(cacheKey);
      if (cached && cached.expires > now) {
        return cached.value;
      }

      // Execute and cache
      const result = await next(ctx, ...args);
      cacheMap.set(cacheKey, { value: result, expires: now + ttl });

      return result;
    };
}

/**
 * Rate limit calls - queue excess calls beyond the limit.
 *
 * Note: This creates shared state, so all calls to the same
 * rate-limited function share the rate limit.
 *
 * @example
 * ```ts
 * // Max 10 calls per second
 * fn.use(rateLimit({ limit: 10, window: 1000 }))
 *
 * // Max 100 calls per minute
 * fn.use(rateLimit({ limit: 100, window: 60000 }))
 * ```
 */
export function rateLimit(options: RateLimitOptions): IdentityWrapper {
  const { limit, window } = options;

  const timestamps: number[] = [];
  const queue: Array<{
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    ctx: AbortableContext<any>;
    args: any[];
    next: Function;
  }> = [];

  let processing = false;

  const processQueue = async () => {
    if (processing || queue.length === 0) return;
    processing = true;

    while (queue.length > 0) {
      const now = Date.now();

      // Remove expired timestamps
      while (timestamps.length > 0 && timestamps[0] <= now - window) {
        timestamps.shift();
      }

      // Check if we can process
      if (timestamps.length < limit) {
        const item = queue.shift()!;

        // Skip if already aborted
        if (item.ctx.signal.aborted) {
          item.reject(item.ctx.signal.reason ?? new Error("Aborted"));
          continue;
        }

        timestamps.push(now);

        try {
          const result = await item.next(item.ctx, ...item.args);
          item.resolve(result);
        } catch (error) {
          item.reject(error as Error);
        }
      } else {
        // Wait until oldest timestamp expires
        const waitTime = timestamps[0] + window - now;
        await new Promise((r) => setTimeout(r, waitTime));
      }
    }

    processing = false;
  };

  return (next) =>
    async (ctx, ...args) => {
      const now = Date.now();

      // Remove expired timestamps
      while (timestamps.length > 0 && timestamps[0] <= now - window) {
        timestamps.shift();
      }

      // If under limit, execute immediately
      if (timestamps.length < limit) {
        timestamps.push(now);
        return next(ctx, ...args);
      }

      // Queue the request
      return new Promise((resolve, reject) => {
        queue.push({ resolve, reject, ctx, args, next });

        // Handle abort
        ctx.signal.addEventListener(
          "abort",
          () => {
            const index = queue.findIndex((item) => item.ctx === ctx);
            if (index !== -1) {
              queue.splice(index, 1);
              reject(ctx.signal.reason ?? new Error("Aborted"));
            }
          },
          { once: true }
        );

        processQueue();
      });
    };
}

/**
 * Circuit breaker - fail fast after repeated errors.
 *
 * States:
 * - closed: Normal operation, requests pass through
 * - open: Circuit tripped, requests fail immediately
 * - half-open: Testing if service recovered (allows one request)
 *
 * @example
 * ```ts
 * // Open after 5 failures, try again after 30s
 * fn.use(circuitBreaker())
 *
 * // Custom threshold and reset timeout
 * fn.use(circuitBreaker({ threshold: 3, resetTimeout: 10000 }))
 * ```
 */
export function circuitBreaker(
  options: CircuitBreakerOptions = {}
): IdentityWrapper {
  const { threshold = 5, resetTimeout = 30000 } = options;

  let state: CircuitState = "closed";
  let failures = 0;
  let lastFailure = 0;

  return (next) =>
    async (ctx, ...args) => {
      const now = Date.now();

      // Check if we should transition from open to half-open
      if (state === "open" && now - lastFailure >= resetTimeout) {
        state = "half-open";
      }

      // Fail fast if circuit is open
      if (state === "open") {
        throw new Error(
          `Circuit breaker is open. Retry after ${Math.ceil(
            (lastFailure + resetTimeout - now) / 1000
          )}s`
        );
      }

      try {
        const result = await next(ctx, ...args);

        // Success - reset on half-open or decrement failures
        if (state === "half-open") {
          state = "closed";
          failures = 0;
        } else if (failures > 0) {
          failures--;
        }

        return result;
      } catch (error) {
        // Don't count aborts as failures
        if (ctx.signal.aborted) {
          throw error;
        }

        failures++;
        lastFailure = now;

        // Trip the circuit if threshold reached
        if (failures >= threshold) {
          state = "open";
        }

        throw error;
      }
    };
}

/**
 * Create a simplified wrapper for argument/result transformations.
 *
 * Unlike regular wrappers, `map()` hides the `ctx` parameter, providing
 * a simple `next(...args)` function. Use this for transformations that
 * don't need access to the abort signal.
 *
 * @example
 * ```ts
 * // Transform return type: User → string
 * const getUserName = getUser.use(
 *   map(async (next, id: string) => {
 *     const user = await next(id);
 *     return user.name;
 *   })
 * );
 *
 * // Change argument signature: email → id lookup
 * const getUserByEmail = getUser.use(
 *   map(async (next, email: string) => {
 *     const id = await lookupUserId(email);
 *     return next(id);
 *   })
 * );
 *
 * // Combine multiple calls
 * const getUserWithPosts = getUser.use(
 *   map(async (next, id: string) => {
 *     const [user, posts] = await Promise.all([
 *       next(id),
 *       fetchPosts(id),
 *     ]);
 *     return { ...user, posts };
 *   })
 * );
 * ```
 */
export function map<
  TArgs extends any[],
  TResult,
  TNewArgs extends any[],
  TNewResult
>(
  mapper: (
    next: (...args: NoInfer<TArgs>) => Promise<NoInfer<TResult>>,
    ...newArgs: TNewArgs
  ) => Promise<TNewResult>
): AbortableWrapper<TArgs, TResult, any, TNewArgs, TNewResult, any> {
  return (next) =>
    async (ctx, ...newArgs) => {
      return mapper((...args) => next(ctx as any, ...args), ...newArgs);
    };
}

/**
 * Observe lifecycle events of an abortable function.
 * Useful for logging, analytics, loading indicators, or cleanup on abort.
 *
 * The `onStart` callback is invoked when the function starts. It can optionally
 * return an object with lifecycle callbacks:
 * - `onAbort` - Called when the function is aborted
 * - `onSuccess` - Called when the function completes successfully (receives result)
 * - `onError` - Called when the function throws (error is re-thrown after)
 * - `onDone` - Called after completion, regardless of outcome (like finally)
 *
 * @param onStart - Called when the function starts. Can return lifecycle callbacks.
 *
 * @example Simple logging (no callbacks returned)
 * ```ts
 * const fetchUser = abortable(async (ctx, id: string) => { ... })
 *   .use(observe((ctx, id) => {
 *     console.log(`Fetching user ${id}`);
 *   }));
 * ```
 *
 * @example Abort handling
 * ```ts
 * const fetchUser = abortable(async (ctx, id: string) => { ... })
 *   .use(observe((ctx, id) => ({
 *     onAbort: () => console.log(`Fetch ${id} aborted`),
 *   })));
 * ```
 *
 * @example Loading indicator with cleanup
 * ```ts
 * const fetchData = abortable(async () => { ... })
 *   .use(observe(() => {
 *     showLoading();
 *     return { onDone: hideLoading };
 *   }));
 * ```
 *
 * @example Full lifecycle
 * ```ts
 * const fetchUser = abortable(async (ctx, id: string) => { ... })
 *   .use(observe((ctx, id) => ({
 *     onAbort: () => console.log(`Aborted: ${id}`),
 *     onSuccess: (user) => console.log(`Fetched: ${user.name}`),
 *     onError: (err) => console.error(`Failed: ${err}`),
 *     onDone: () => console.log('Completed'),
 *   })));
 * ```
 */
export function observe<
  TArgs extends any[],
  TResult,
  TYield extends void | object = void
>(
  onStart: NoInfer<ObserveOnStart<TArgs, TResult>>
): AbortableWrapper<TArgs, TResult, TYield, TArgs, TResult, TYield> {
  return (next) =>
    async (ctx, ...args) => {
      // Call onStart and capture returned cleanup
      const onStartResult = onStart(ctx, ...(args as unknown as TArgs));

      if (!onStartResult) {
        return next(ctx, ...args);
      }

      const { onAbort, onSuccess, onError, onDone } = onStartResult ?? {};

      // Register abort handlers if any cleanup is needed
      if (onAbort) {
        ctx.signal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        const result = await next(ctx, ...args);
        onSuccess?.(result);
        return result;
      } catch (error) {
        onError?.(error);
        throw error;
      } finally {
        onDone?.();
      }
    };
}
