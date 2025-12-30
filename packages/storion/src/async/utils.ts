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
import {
  createCancellablePromise,
  promiseTry,
  toPromiseWithState,
} from "./helpers";

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
 * Get the state of a promise or synchronous function execution.
 * Returns a PromiseWithState that has a `.state` property tracking its status.
 *
 * @overload
 * @param promise - The promise to get the state of.
 * @returns The promise with state tracking.
 *
 * @overload
 * @param fn - A function to execute synchronously.
 * @returns A PromiseWithState based on execution result:
 *   - If returns value → status: "fulfilled", Promise.resolve(value)
 *   - If throws Error → status: "rejected", Promise.reject(error)
 *   - If throws Promise (Suspense) → status: "pending", Promise resolved to thrown promise
 *
 * @example
 * // With promise
 * const pws = async.state(fetch('/api/data'));
 * console.log(pws.state.status); // "pending" | "fulfilled" | "rejected"
 *
 * @example
 * // With function - useful for Suspense patterns
 * const pws = async.state(() => {
 *   const cache = getFromCache(key);
 *   if (!cache) throw fetchAndCache(key); // throws promise for Suspense
 *   return cache;
 * });
 * console.log(pws.state.status); // "pending" if promise thrown, "fulfilled" if cached
 */
export function state<T>(promise: PromiseLike<T>): PromiseWithState<T>;
export function state<T>(fn: () => T): PromiseWithState<Awaited<T>>;
export function state<T>(
  promiseOrFn: PromiseLike<T> | (() => T)
): PromiseWithState<T> {
  // If it's already a PromiseLike, use existing behavior
  if (isPromiseLike(promiseOrFn)) {
    return toPromiseWithState(promiseOrFn);
  }

  // Function overload - execute synchronously and capture result/thrown
  try {
    const result = promiseOrFn();

    // Function returned a value → fulfilled
    const newState: PromiseState<T> = {
      status: "fulfilled",
      value: result as T,
      reason: undefined,
    };

    return Object.assign(Promise.resolve(result), {
      state: newState,
    }) as PromiseWithState<T>;
  } catch (thrown) {
    // Check if thrown value is a Promise (Suspense pattern)
    if (isPromiseLike(thrown)) {
      // Use a mutable wrapper object to allow state transitions
      const stateWrapper = {
        state: {
          status: "pending",
          value: undefined,
          reason: undefined,
        } as PromiseState<T>,
      };

      // Create a promise that follows the thrown promise
      const trackedPromise = (thrown as PromiseLike<T>).then(
        (value) => {
          stateWrapper.state = {
            status: "fulfilled",
            value,
            reason: undefined,
          };
          return value;
        },
        (error) => {
          stateWrapper.state = {
            status: "rejected",
            value: undefined,
            reason: error,
          };
          throw error;
        }
      );

      // Use Object.defineProperty to create a true getter that returns current state
      Object.defineProperty(trackedPromise, "state", {
        get() {
          return stateWrapper.state;
        },
        enumerable: true,
        configurable: true,
      });

      return trackedPromise as PromiseWithState<T>;
    }

    // Thrown value is an Error → rejected
    const newState: PromiseState<T> = {
      status: "rejected",
      value: undefined,
      reason: thrown,
    };

    return Object.assign(Promise.reject(thrown), {
      state: newState,
    }) as PromiseWithState<T>;
  }
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
