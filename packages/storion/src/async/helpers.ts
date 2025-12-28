/**
 * Internal helpers for async module.
 * These are shared utilities used across multiple async functions.
 * @internal
 */

import type {
  AsyncState,
  AsyncMode,
  AsyncKey,
  CancellablePromise,
  SerializedAsyncState,
  PromiseState,
  PromiseWithState,
  AsyncOrPromise,
} from "./types";
import { isPromiseLike } from "../utils/isPromiseLike";

// =============================================================================
// GLOBAL PROMISE CACHE
// =============================================================================

/**
 * Global cache for pending promises (used for Suspense support).
 * @internal
 */
export const pendingPromises = new WeakMap<AsyncKey<any>, Promise<any>>();

/**
 * Get the pending promise for an async state (for Suspense).
 * Returns undefined if no pending promise.
 */
export function getPendingPromise<T>(
  state: AsyncState<T, any>
): Promise<T> | undefined {
  if (state.status === "pending" && "__key" in state && state.__key) {
    return pendingPromises.get(state.__key) as Promise<T> | undefined;
  }
  return undefined;
}

// =============================================================================
// PROMISE HELPERS
// =============================================================================

/**
 * Wraps a synchronous or async function to always return a Promise.
 * Ensures async execution even for synchronous functions.
 * @internal
 */
export function promiseTry<T>(
  fn: () => T | PromiseLike<T>
): Promise<Awaited<T>> {
  return new Promise<Awaited<T>>((resolve) => {
    resolve(fn() as Awaited<T>);
  });
}

/**
 * Create a cancellable promise with a cancel method.
 * @internal
 */
export function createCancellablePromise<T>(
  promise: Promise<T>,
  cancel: () => void
): CancellablePromise<T> {
  const cancellable = promise as CancellablePromise<T>;
  cancellable.cancel = cancel;
  return cancellable;
}

// =============================================================================
// STATE SERIALIZATION
// =============================================================================

/**
 * Serialization method for AsyncState.
 * - Stale mode: always serialize as success (user opted into "keep data")
 * - Fresh mode: only serialize success state
 * @internal
 */
export function stateToJSON<T>(
  this: AsyncState<T, AsyncMode>
): SerializedAsyncState<T> {
  if (this.mode === "stale") {
    return { status: "success", mode: "stale", data: this.data as T };
  }
  if (this.status === "success") {
    return { status: "success", mode: "fresh", data: this.data };
  }
  return null;
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Check if value is an AsyncState.
 * @internal
 */
export function isAsyncState(value: unknown): value is AsyncState<any, any> {
  return (
    value !== null &&
    typeof value === "object" &&
    "status" in value &&
    "mode" in value &&
    ((value as any).status === "idle" ||
      (value as any).status === "pending" ||
      (value as any).status === "success" ||
      (value as any).status === "error")
  );
}

/**
 * Check if value is AsyncOrPromise.
 * @internal
 */
export function isAsyncOrPromise(value: unknown): value is AsyncOrPromise {
  return isAsyncState(value) || isPromiseLike(value);
}

// =============================================================================
// PROMISE STATE CONVERSION
// =============================================================================

/**
 * Convert a PromiseLike to PromiseWithState.
 * @internal
 */
export function toPromiseWithState<T>(
  promise: PromiseLike<T>
): PromiseWithState<T> {
  if (!isPromiseLike(promise)) {
    throw new Error("Expected PromiseLike");
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
// DATA EXTRACTION HELPERS
// =============================================================================

/**
 * Result type for getData helper.
 * @internal
 */
export type GetDataResult =
  | { ready: true; data: any }
  | { ready: false; error: Error }
  | { ready: false; promise: PromiseLike<any> }
  | { ready: false; status: "idle" };

/**
 * Extract data from AsyncState or PromiseLike.
 * @internal
 */
export function getData(
  item: AsyncOrPromise,
  index: number | string
): GetDataResult {
  // Handle AsyncState
  if (isAsyncState(item)) {
    if (item.status === "success") {
      return { ready: true, data: item.data };
    }
    if (item.mode === "stale" && item.data !== undefined) {
      return { ready: true, data: item.data };
    }
    if (item.status === "error") {
      return { ready: false, error: item.error };
    }
    // Check for pending promise (used for Suspense)
    const pendingPromise = getPendingPromise(item);
    if (item.status === "pending" && pendingPromise) {
      return { ready: false, promise: pendingPromise };
    }
    // idle state or pending without promise
    return { ready: false, status: "idle" };
  }

  // Handle PromiseLike (convert to PromiseWithState)
  if (isPromiseLike(item)) {
    const pws = toPromiseWithState(item);
    const s = pws.state;
    if (s.status === "fulfilled") {
      return { ready: true, data: s.resolved };
    }
    if (s.status === "rejected") {
      return { ready: false, error: s.rejected };
    }
    // Promise is pending - return the promise for Suspense
    return { ready: false, promise: item };
  }

  throw new Error(`Invalid state at ${index}`);
}
