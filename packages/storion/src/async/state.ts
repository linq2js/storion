/**
 * Async state factory functions.
 * Creates and transforms AsyncState objects.
 */

import type { AsyncState, AsyncMode, AsyncKey, AsyncRequestId } from "./types";
import { stateToJSON } from "./helpers";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Extra properties that can be added to async state.
 * @internal
 */
export interface AsyncStateExtra<T> {
  __key?: AsyncKey<T>;
  __requestId?: AsyncRequestId;
}

// =============================================================================
// ASYNC STATE FACTORY
// =============================================================================

/**
 * Create a frozen AsyncState with the specified status.
 * Users cannot modify properties directly - must use async actions.
 *
 * Overloads:
 * - asyncState("fresh", "idle") - Fresh idle state
 * - asyncState("fresh", "pending", extra?) - Fresh pending state
 * - asyncState("fresh", "success", data) - Fresh success state
 * - asyncState("fresh", "error", error, extra?) - Fresh error state
 * - asyncState("stale", "idle", data) - Stale idle state
 * - asyncState("stale", "pending", data, extra?) - Stale pending state
 * - asyncState("stale", "success", data) - Stale success state
 * - asyncState("stale", "error", data, error, extra?) - Stale error state
 */

// Fresh mode overloads
export function asyncState<T = unknown>(
  mode: "fresh",
  status: "idle"
): AsyncState<T, "fresh">;

export function asyncState<T = unknown>(
  mode: "fresh",
  status: "pending",
  extra?: AsyncStateExtra<T>
): AsyncState<T, "fresh">;

export function asyncState<T>(
  mode: "fresh",
  status: "success",
  data: T
): AsyncState<T, "fresh">;

export function asyncState<T = unknown>(
  mode: "fresh",
  status: "error",
  error: Error,
  extra?: AsyncStateExtra<T>
): AsyncState<T, "fresh">;

// Stale mode overloads
export function asyncState<T>(
  mode: "stale",
  status: "idle",
  data: T
): AsyncState<T, "stale">;

export function asyncState<T>(
  mode: "stale",
  status: "pending",
  data: T,
  extra?: AsyncStateExtra<T>
): AsyncState<T, "stale">;

export function asyncState<T>(
  mode: "stale",
  status: "success",
  data: T
): AsyncState<T, "stale">;

export function asyncState<T>(
  mode: "stale",
  status: "error",
  data: T,
  error: Error,
  extra?: AsyncStateExtra<T>
): AsyncState<T, "stale">;

// Implementation
export function asyncState<T>(
  mode: AsyncMode,
  status: "idle" | "pending" | "success" | "error",
  dataOrError?: T | Error,
  errorOrExtra?: Error | AsyncStateExtra<T>,
  extra?: AsyncStateExtra<T>
): AsyncState<T, AsyncMode> {
  let state: AsyncState<T, AsyncMode>;

  if (mode === "fresh") {
    switch (status) {
      case "idle":
        state = {
          status: "idle",
          mode: "fresh",
          data: undefined,
          error: undefined,
          timestamp: undefined,
          toJSON: stateToJSON,
        };
        break;
      case "pending":
        state = {
          status: "pending",
          mode: "fresh",
          data: undefined,
          error: undefined,
          timestamp: undefined,
          ...(dataOrError as AsyncStateExtra<T>),
          toJSON: stateToJSON,
        };
        break;
      case "success":
        state = {
          status: "success",
          mode: "fresh",
          data: dataOrError as T,
          error: undefined,
          timestamp: Date.now(),
          toJSON: stateToJSON,
        };
        break;
      case "error":
        state = {
          status: "error",
          mode: "fresh",
          data: undefined,
          error: dataOrError as Error,
          timestamp: undefined,
          ...(errorOrExtra as AsyncStateExtra<T>),
          toJSON: stateToJSON,
        };
        break;
    }
  } else {
    // Stale mode
    switch (status) {
      case "idle":
        state = {
          status: "idle",
          mode: "stale",
          data: dataOrError as T,
          error: undefined,
          timestamp: undefined,
          toJSON: stateToJSON,
        };
        break;
      case "pending":
        state = {
          status: "pending",
          mode: "stale",
          data: dataOrError as T,
          error: undefined,
          timestamp: undefined,
          ...(errorOrExtra as AsyncStateExtra<T>),
          toJSON: stateToJSON,
        };
        break;
      case "success":
        state = {
          status: "success",
          mode: "stale",
          data: dataOrError as T,
          error: undefined,
          timestamp: Date.now(),
          toJSON: stateToJSON,
        };
        break;
      case "error":
        state = {
          status: "error",
          mode: "stale",
          data: dataOrError as T,
          error: errorOrExtra as Error,
          timestamp: undefined,
          ...extra,
          toJSON: stateToJSON,
        };
        break;
    }
  }

  // Freeze the state to prevent direct mutations
  return Object.freeze(state);
}

// =============================================================================
// ASYNC STATE FROM (DERIVE)
// =============================================================================

/**
 * Create a new AsyncState based on a previous state, preserving mode and stale data.
 * Useful for deriving new states while maintaining the mode semantics.
 *
 * @example
 * // From success to pending (preserves mode and stale data)
 * const next = asyncState.from(prev, "pending");
 *
 * // From pending to success
 * const next = asyncState.from(prev, "success", newData);
 *
 * // From any to error
 * const next = asyncState.from(prev, "error", new Error("failed"));
 */
export function asyncStateFrom<T, M extends AsyncMode>(
  prev: AsyncState<T, M>,
  status: "idle"
): AsyncState<T, M>;

export function asyncStateFrom<T, M extends AsyncMode>(
  prev: AsyncState<T, M>,
  status: "pending"
): AsyncState<T, M>;

export function asyncStateFrom<T, M extends AsyncMode>(
  prev: AsyncState<T, M>,
  status: "success",
  data: T
): AsyncState<T, M>;

export function asyncStateFrom<T, M extends AsyncMode>(
  prev: AsyncState<T, M>,
  status: "error",
  error: Error
): AsyncState<T, M>;

export function asyncStateFrom<T, M extends AsyncMode>(
  prev: AsyncState<T, M>,
  status: "idle" | "pending" | "success" | "error",
  dataOrError?: T | Error
): AsyncState<T, M> {
  const mode = prev.mode;
  // Get stale data from previous state (for stale mode)
  // In stale mode, data is always preserved across all statuses
  const staleData = mode === "stale" ? prev.data : undefined;

  if (mode === "stale") {
    switch (status) {
      case "idle":
        return asyncState("stale", "idle", staleData as T) as AsyncState<T, M>;
      case "pending":
        return asyncState("stale", "pending", staleData as T) as AsyncState<
          T,
          M
        >;
      case "success":
        return asyncState("stale", "success", dataOrError as T) as AsyncState<
          T,
          M
        >;
      case "error":
        return asyncState(
          "stale",
          "error",
          staleData as T,
          dataOrError as Error
        ) as AsyncState<T, M>;
    }
  } else {
    switch (status) {
      case "idle":
        return asyncState("fresh", "idle") as AsyncState<T, M>;
      case "pending":
        return asyncState("fresh", "pending") as AsyncState<T, M>;
      case "success":
        return asyncState("fresh", "success", dataOrError as T) as AsyncState<
          T,
          M
        >;
      case "error":
        return asyncState("fresh", "error", dataOrError as Error) as AsyncState<
          T,
          M
        >;
    }
  }
}

// Attach as property for convenient access: asyncState.from(prev, status, data)
asyncState.from = asyncStateFrom;

// =============================================================================
// STATE CREATORS
// =============================================================================

/**
 * Create a fresh mode async state (data undefined during loading/error).
 */
export function fresh<T = unknown>(): AsyncState<T, "fresh"> {
  return asyncState("fresh", "idle");
}

/**
 * Create a stale mode async state with initial data.
 * Data is preserved during loading and error states.
 */
export function stale<T>(): AsyncState<T | undefined, "stale">;
export function stale<T>(
  initialData: T | undefined | null
): AsyncState<T, "stale">;
export function stale<T>(
  initialData?: T | undefined | null
): AsyncState<T, "stale"> {
  return asyncState("stale", "idle", initialData as T);
}
