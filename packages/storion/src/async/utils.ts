/**
 * Async utility functions.
 * Helpers for working with promises and async operations.
 */

import type {
  CancellablePromise,
  PromiseState,
  PromiseWithState,
} from "./types";
import { isPromiseLike } from "../utils/isPromiseLike";
import { createCancellablePromise, promiseTry } from "./helpers";

// =============================================================================
// DELAY
// =============================================================================

/**
 * Create a cancellable delay promise.
 *
 * @example
 * const delay = async.delay(1000);
 * // Later...
 * delay.cancel(); // Cancel the delay
 */
export function delay<T = void>(
  ms: number,
  resolved?: T
): CancellablePromise<T> {
  let timeout: any;
  return createCancellablePromise(
    new Promise((resolve) => {
      timeout = setTimeout(resolve, ms, resolved);
    }),
    () => {
      clearTimeout(timeout);
    }
  );
}

// =============================================================================
// INVOKE
// =============================================================================

/**
 * Wraps a synchronous or async function to always return a Promise.
 * Ensures async execution even for synchronous functions.
 *
 * This is the same utility used internally for dispatching handlers.
 *
 * @example
 * const promise = async.invoke(() => {
 *   // Sync or async code
 *   return someValue;
 * });
 */
export const invoke = promiseTry;

// =============================================================================
// STATE
// =============================================================================

/**
 * Get the state of a promise.
 * Returns a PromiseWithState that has a `.state` property tracking its status.
 *
 * @param promise - The promise to get the state of.
 * @returns The promise with state tracking.
 *
 * @example
 * const pws = async.state(fetch('/api/data'));
 * console.log(pws.state.status); // "pending" | "fulfilled" | "rejected"
 */
export function state<T>(promise: PromiseLike<T>): PromiseWithState<T> {
  if (!isPromiseLike(promise)) {
    throw new Error("Promise is not a PromiseLike");
  }

  if ("state" in promise) {
    return promise as PromiseWithState<T>;
  }

  const newState: PromiseState<T> = {
    status: "pending",
    resolved: undefined,
    rejected: undefined,
  };
  promise.then(
    (value) => {
      newState.status = "fulfilled";
      newState.resolved = value;
    },
    (error) => {
      newState.status = "rejected";
      newState.rejected = error;
    }
  );

  return Object.assign(promise, { state: newState }) as PromiseWithState<T>;
}

// =============================================================================
// TO PROMISE
// =============================================================================

/**
 * Convert a value or parameterless function to a Promise.
 * Handles: PromiseLike, sync values, functions returning either.
 *
 * @example
 * toPromise(42)                    // Promise.resolve(42)
 * toPromise(Promise.resolve(42))   // Promise.resolve(42)
 * toPromise(() => 42)              // Promise.resolve(42)
 * toPromise(() => fetchData())     // fetchData() promise
 * toPromise(thenable)              // Promise wrapping thenable
 */
export function toPromise<T>(value: T | (() => T)): Promise<Awaited<T>> {
  // PromiseLike - wrap with Promise.resolve for normalization
  if (isPromiseLike(value)) {
    return Promise.resolve(value) as Promise<Awaited<T>>;
  }

  // Function - invoke it first
  if (typeof value === "function") {
    try {
      const result = (value as () => T)();
      return toPromise(result as T);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  // Sync value
  return Promise.resolve(value) as Promise<Awaited<T>>;
}
