/**
 * Async wait and check helper functions.
 * Extract data from async states and check their status.
 */

import type { AsyncState, AsyncMode } from "./types";
import { AsyncNotReadyError } from "./types";
import { getPendingPromise } from "./helpers";

// =============================================================================
// WAIT
// =============================================================================

/**
 * Extract data from AsyncState, throws if not ready.
 * - Success: returns data
 * - Stale mode (idle/pending/error with data): returns stale data
 * - Pending with promise: throws promise (for Suspense)
 * - Otherwise: throws error or AsyncNotReadyError
 */
export function wait<T, M extends AsyncMode>(
  state: AsyncState<T, M>
): M extends "stale" ? T : T {
  if (state.status === "success") {
    return state.data as any;
  }

  // In stale mode, return stale data even if not success
  if (state.mode === "stale" && state.data !== undefined) {
    return state.data as any;
  }

  if (state.status === "error") {
    throw state.error;
  }

  if (state.status === "pending") {
    // Throw promise for React Suspense
    const promise = getPendingPromise(state);
    if (promise) {
      throw promise;
    }
  }

  const message =
    state.status === "idle"
      ? `Cannot wait: state is idle. Call dispatch() or use trigger() to start the async operation before calling async.wait().`
      : `Cannot wait: state is ${state.status}`;

  throw new AsyncNotReadyError(message, state.status);
}

// =============================================================================
// CHECK HELPERS
// =============================================================================

/**
 * Check if state has data available (success or stale).
 */
export function hasData<T, M extends AsyncMode>(
  state: AsyncState<T, M>
): state is AsyncState<T, M> & { data: T } {
  if (state.status === "success") return true;
  if (state.mode === "stale" && state.data !== undefined) return true;
  return false;
}

/**
 * Check if state is loading (pending status).
 */
export function isLoading<T, M extends AsyncMode>(
  state: AsyncState<T, M>
): state is AsyncState<T, M> & { status: "pending" } {
  return state.status === "pending";
}

/**
 * Check if state has an error.
 */
export function isError<T, M extends AsyncMode>(
  state: AsyncState<T, M>
): state is AsyncState<T, M> & { status: "error"; error: Error } {
  return state.status === "error";
}
