/**
 * Safe execution utilities.
 *
 * Creates a `safe` function that wraps operations to be aware of cancellation/staleness.
 * Reused by both effect context and async context.
 */

import { isAbortable, type Abortable } from "./abortable";

/**
 * Safe function type returned by createSafe.
 *
 * Overloads:
 * 1. `safe(promise)` - Wrap promise, never resolve/reject if cancelled
 * 2. `safe(normalFn, ...args)` - Call function, wrap result if promise
 * 3. `safe(Abortable, ...args)` - Call with signal, wrap result if promise
 */
export interface SafeFn {
  /**
   * Wrap a promise to never resolve/reject if cancelled.
   *
   * @example
   * ctx.safe(fetchData()).then(data => {
   *   // Only runs if not cancelled
   *   state.data = data;
   * });
   */
  <T>(promise: Promise<T>): Promise<T>;

  /**
   * Call a normal function and wrap result if it's a promise.
   *
   * @example
   * const result = await ctx.safe(myAsyncFn, arg1, arg2);
   */
  <TArgs extends any[], TResult>(
    fn: (...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult extends Promise<infer U> ? Promise<U> : TResult;

  /**
   * Call an abortable function with the context's signal.
   * Wraps result if it's a promise.
   *
   * @example
   * const user = await ctx.safe(getUser, userId);
   */
  <TArgs extends any[], TResult>(
    fn: Abortable<TArgs, TResult>,
    ...args: TArgs
  ): TResult extends Promise<infer U> ? Promise<U> : TResult;
}

/**
 * Create a safe function for a given context.
 *
 * @param getSignal - Function to get the current AbortSignal
 * @param isCancelled - Function to check if the context is cancelled/stale
 * @returns A safe function
 *
 * @example
 * ```ts
 * const safe = createSafe(
 *   () => abortController.signal,
 *   () => abortController.signal.aborted
 * );
 *
 * // Wrap promise
 * await safe(fetchData());
 *
 * // Call abortable function
 * await safe(getUser, userId);
 * ```
 */
export function createSafe(
  getSignal: () => AbortSignal | undefined,
  isCancelled: () => boolean
): SafeFn {
  /**
   * Wrap a promise to never resolve/reject if cancelled.
   */
  function wrapPromise<T>(promise: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      promise.then(
        (value) => {
          if (!isCancelled()) {
            resolve(value);
          }
          // Never resolve/reject if cancelled - promise stays pending
        },
        (error) => {
          if (!isCancelled()) {
            reject(error);
          }
          // Never resolve/reject if cancelled
        }
      );
    });
  }

  /**
   * Wrap a value - if it's a promise, wrap it.
   */
  function wrapResult<T>(result: T): T {
    if (result instanceof Promise) {
      return wrapPromise(result) as T;
    }
    return result;
  }

  /**
   * The safe function implementation.
   */
  function safe<T, TArgs extends any[]>(
    input: Promise<T> | ((...args: TArgs) => T) | Abortable<TArgs, T>,
    ...args: TArgs
  ): any {
    // Check if cancelled before doing anything
    if (isCancelled()) {
      // Return a never-resolving promise for consistency
      if (input instanceof Promise) {
        return new Promise<T>(() => {});
      }
      // For functions, still call but wrap result
    }

    // Case 1: Promise - wrap it
    if (input instanceof Promise) {
      return wrapPromise(input);
    }

    // Case 2: Abortable - call with signal and wrap result
    if (isAbortable(input)) {
      const signal = getSignal();
      const result = input.withSignal(signal, ...args);
      return wrapResult(result);
    }

    // Case 3: Normal function - call and wrap result
    if (typeof input === "function") {
      const result = (input as (...args: TArgs) => T)(...args);
      return wrapResult(result);
    }

    // Fallback - shouldn't happen with proper types
    return input;
  }

  return safe as SafeFn;
}
