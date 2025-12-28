/**
 * Promise-like chaining for async states.
 * Chain callbacks on AsyncState or PromiseState.
 */

import type { AsyncState, PromiseState } from "./types";
import { AsyncNotReadyError } from "./types";
import { getPendingPromise, promiseTry } from "./helpers";

// =============================================================================
// THEN
// =============================================================================

/**
 * Chain a callback on AsyncState or PromiseState, similar to Promise.then().
 *
 * Note: Named `chain` instead of `then` to avoid making `async` look like a
 * PromiseLike (objects with a `then` method are treated as thenables).
 *
 * - Success/Fulfilled: calls fn with data via promiseTry (ensures async)
 * - Pending with source promise: chains .then(fn) on the promise
 * - Stale mode: uses stale data if available (even in idle/pending/error)
 * - Otherwise: rejects with AsyncNotReadyError or the state's error
 *
 * @example
 * // Chain on success state
 * async.chain(userState, user => user.name);
 *
 * // Chain on pending state (waits for resolution)
 * async.chain(loadingState, data => transform(data));
 *
 * // Chain on stale mode (uses cached data)
 * async.chain(staleState, data => data); // Returns even if pending
 */
export function chain<T, R>(
  state: AsyncState<T, any> | PromiseState<T>,
  fn: (data: T) => R
): Promise<R> {
  // Check if it's an AsyncState (has mode property)
  if ("mode" in state) {
    const asyncState = state as AsyncState<T, any>;

    // Success - always call fn
    if (asyncState.status === "success") {
      return promiseTry(() => fn(asyncState.data as T));
    }

    // Pending - try to get source promise
    if (asyncState.status === "pending") {
      const pendingPromise = getPendingPromise(asyncState);
      if (pendingPromise) {
        return pendingPromise.then(fn);
      }
      // No source promise - if stale mode with data, use data
      if (asyncState.mode === "stale" && asyncState.data !== undefined) {
        return promiseTry(() => fn(asyncState.data as T));
      }
      // Fresh mode or no data - can't resolve
      return Promise.reject(
        new AsyncNotReadyError(
          "Cannot chain: pending state has no source promise",
          "pending"
        )
      );
    }

    // Error - reject or use stale data
    if (asyncState.status === "error") {
      // Stale mode might have data even in error state
      if (asyncState.mode === "stale" && asyncState.data !== undefined) {
        return promiseTry(() => fn(asyncState.data as T));
      }
      return Promise.reject(asyncState.error);
    }

    // Idle - use stale data or reject
    if (asyncState.status === "idle") {
      // Stale mode with data
      if (asyncState.mode === "stale" && asyncState.data !== undefined) {
        return promiseTry(() => fn(asyncState.data as T));
      }
      return Promise.reject(
        new AsyncNotReadyError(
          "Cannot chain: state is idle. Call dispatch() to start the async operation.",
          "idle"
        )
      );
    }

    return Promise.reject(
      new AsyncNotReadyError("Cannot chain: unknown async state", "idle")
    );
  }

  // PromiseState (no source promise available)
  const promiseState = state as PromiseState<T>;

  if (promiseState.status === "fulfilled") {
    return promiseTry(() => fn(promiseState.resolved as T));
  }

  if (promiseState.status === "rejected") {
    return Promise.reject(promiseState.rejected);
  }

  // Pending - no source promise available for PromiseState
  return Promise.reject(
    new AsyncNotReadyError(
      "Cannot chain: PromiseState is pending with no source promise",
      "pending"
    )
  );
}
