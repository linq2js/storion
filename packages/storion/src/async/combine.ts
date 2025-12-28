/**
 * Async state combinators.
 * Combine multiple async states: all, any, race, settled.
 */

import type {
  AsyncOrPromise,
  InferData,
  MapData,
  MapRecordData,
  CombinedSettledResult,
  MapCombinedSettledResult,
  CombinedRaceResult,
} from "./types";
import { AsyncNotReadyError, AsyncAggregateError } from "./types";
import { isPromiseLike } from "../utils/isPromiseLike";
import {
  isAsyncState,
  isAsyncOrPromise,
  getData,
  toPromiseWithState,
} from "./helpers";

// =============================================================================
// RACE
// =============================================================================

/**
 * Returns the first successful result from an array or record of async states.
 * Supports both AsyncState and PromiseWithState.
 *
 * @example
 * ```ts
 * // Array form
 * const [key, data] = async.race([state1, state2]);
 *
 * // Map form
 * const [key, data] = async.race({ user: userState, posts: postsState });
 * ```
 */
export function race<const T extends readonly AsyncOrPromise[]>(
  states: T
): [number, InferData<T[number]>];
export function race<T extends Record<string, AsyncOrPromise>>(
  states: T
): CombinedRaceResult<T>;
export function race(
  states: readonly AsyncOrPromise[] | Record<string, AsyncOrPromise>
): [string | number, any] {
  const isArray = Array.isArray(states);
  const entries = isArray
    ? (states as AsyncOrPromise[]).map((v, i) => [i, v] as const)
    : Object.entries(states);

  const promises: PromiseLike<any>[] = [];

  // First check for ready data or errors
  for (const [key, item] of entries) {
    const result = getData(item, key);
    if (result.ready) {
      return [key, result.data];
    }
    if ("error" in result) {
      throw result.error;
    }
    if ("promise" in result) {
      promises.push(result.promise);
    }
  }

  // If there are pending promises, throw Promise.race for Suspense
  if (promises.length > 0) {
    throw Promise.race(promises);
  }

  // All are idle (not started)
  throw new AsyncNotReadyError(
    "No async state has resolved successfully",
    "idle"
  );
}

// =============================================================================
// ALL
// =============================================================================

/**
 * Returns all data if all states are ready.
 * Supports both AsyncState and PromiseWithState, as array, record, or rest params.
 *
 * @example
 * ```ts
 * // Rest params (backward compatible)
 * const [a, b, c] = async.all(state1, state2, state3);
 *
 * // Array form - returns tuple of data
 * const [userData, postsData] = async.all([userState, postsState]);
 *
 * // Map form - returns record of data
 * const { user, posts } = async.all({ user: userState, posts: postsState });
 * ```
 */
export function all<const T extends readonly AsyncOrPromise[]>(
  states: T
): MapData<T>;
export function all<T extends Record<string, AsyncOrPromise>>(
  states: T
): MapRecordData<T>;
export function all<const T extends readonly AsyncOrPromise[]>(
  ...states: T
): MapData<T>;
export function all(
  ...args:
    | [readonly AsyncOrPromise[]]
    | [Record<string, AsyncOrPromise>]
    | AsyncOrPromise[]
): any[] | Record<string, any> {
  // Normalize arguments: support both all([...]) and all(...rest)
  let states: readonly AsyncOrPromise[] | Record<string, AsyncOrPromise>;
  if (
    args.length === 1 &&
    (Array.isArray(args[0]) || !isAsyncOrPromise(args[0]))
  ) {
    states = args[0] as
      | readonly AsyncOrPromise[]
      | Record<string, AsyncOrPromise>;
  } else {
    states = args as AsyncOrPromise[];
  }

  if (Array.isArray(states)) {
    const arr = states as readonly AsyncOrPromise[];
    const results: any[] = [];
    for (let i = 0; i < arr.length; i++) {
      const result = getData(arr[i], i);
      if (result.ready) {
        results.push(result.data);
      } else if ("error" in result) {
        throw result.error;
      } else if ("promise" in result) {
        // Throw promise for Suspense
        throw result.promise;
      } else {
        // idle state - not started yet
        throw new AsyncNotReadyError(
          `State at index ${i} is not ready`,
          "idle"
        );
      }
    }
    return results;
  }

  const record = states as Record<string, AsyncOrPromise>;
  const results: Record<string, any> = {};
  for (const key in record) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      const result = getData(record[key], key);
      if (result.ready) {
        results[key] = result.data;
      } else if ("error" in result) {
        throw result.error;
      } else if ("promise" in result) {
        // Throw promise for Suspense
        throw result.promise;
      } else {
        // idle state - not started yet
        throw new AsyncNotReadyError(
          `State at key "${key}" is not ready`,
          "idle"
        );
      }
    }
  }
  return results;
}

// =============================================================================
// ANY
// =============================================================================

/**
 * Returns the first ready data from multiple states.
 * Supports both AsyncState and PromiseWithState, as array, record, or rest params.
 *
 * @example
 * ```ts
 * // Rest params (backward compatible)
 * const data = async.any(state1, state2, state3);
 *
 * // Array form
 * const data = async.any([state1, state2, state3]);
 *
 * // Map form
 * const data = async.any({ primary: primaryState, fallback: fallbackState });
 * ```
 */
export function any<const T extends readonly AsyncOrPromise[]>(
  states: T
): InferData<T[number]>;
export function any<T extends Record<string, AsyncOrPromise>>(
  states: T
): InferData<T[keyof T]>;
export function any<const T extends readonly AsyncOrPromise[]>(
  ...states: T
): InferData<T[number]>;
export function any(
  ...args:
    | [readonly AsyncOrPromise[]]
    | [Record<string, AsyncOrPromise>]
    | AsyncOrPromise[]
): any {
  // Normalize arguments
  let states: readonly AsyncOrPromise[] | Record<string, AsyncOrPromise>;
  if (
    args.length === 1 &&
    (Array.isArray(args[0]) || !isAsyncOrPromise(args[0]))
  ) {
    states = args[0] as
      | readonly AsyncOrPromise[]
      | Record<string, AsyncOrPromise>;
  } else {
    states = args as AsyncOrPromise[];
  }

  const isArray = Array.isArray(states);
  const entries = isArray
    ? (states as AsyncOrPromise[]).map((v, i) => [i, v] as const)
    : Object.entries(states);

  const errors: Error[] = [];
  const promises: PromiseLike<any>[] = [];

  // First check for ready data
  for (const [key, item] of entries) {
    const result = getData(item, key);
    if (result.ready) {
      return result.data;
    }
    if ("error" in result) {
      errors.push(result.error);
    } else if ("promise" in result) {
      promises.push(result.promise);
    }
  }

  // If all are errors, throw aggregate
  if (errors.length === entries.length) {
    throw new AsyncAggregateError("All async states have errors", errors);
  }

  // If there are pending promises, throw Promise.race for Suspense
  if (promises.length > 0) {
    throw Promise.race(promises);
  }

  // All are idle (not started)
  throw new AsyncNotReadyError(
    "No async state has resolved successfully",
    "idle"
  );
}

// =============================================================================
// SETTLED
// =============================================================================

/**
 * Get settled result from AsyncOrPromise.
 * @internal
 */
function getSettledResult(item: AsyncOrPromise): CombinedSettledResult<any> {
  // Handle AsyncState
  if (isAsyncState(item)) {
    // Preserve old format for AsyncState (backward compatibility)
    switch (item.status) {
      case "success":
        return { status: "success", data: item.data } as any;
      case "error":
        return {
          status: "error",
          error: item.error,
          data: item.mode === "stale" ? item.data : undefined,
        } as any;
      case "pending":
        return {
          status: "pending",
          data: item.mode === "stale" ? item.data : undefined,
        } as any;
      case "idle":
        return {
          status: "idle",
          data: item.mode === "stale" ? item.data : undefined,
        } as any;
    }
  }

  // Handle PromiseLike (convert to PromiseWithState)
  if (isPromiseLike(item)) {
    const pws = toPromiseWithState(item);
    const s = pws.state;
    if (s.status === "fulfilled") {
      return { status: "fulfilled", value: s.resolved };
    }
    if (s.status === "rejected") {
      return { status: "rejected", reason: s.rejected };
    }
    return { status: "pending" };
  }

  throw new Error("Invalid state");
}

/**
 * Returns settled results for all states (never throws).
 * Supports both AsyncState and PromiseWithState, as array, record, or rest params.
 *
 * @example
 * ```ts
 * // Rest params (backward compatible)
 * const results = async.settled(state1, state2);
 *
 * // Array form
 * const results = async.settled([state1, state2]);
 * // [{ status: "fulfilled", value: data1 }, { status: "rejected", reason: error }]
 *
 * // Map form
 * const results = async.settled({ user: userState, posts: postsState });
 * // { user: { status: "fulfilled", value: userData }, posts: { status: "pending" } }
 * ```
 */
export function settled<const T extends readonly AsyncOrPromise[]>(
  states: T
): MapCombinedSettledResult<T>;
export function settled<T extends Record<string, AsyncOrPromise>>(
  states: T
): { [K in keyof T]: CombinedSettledResult<InferData<T[K]>> };
export function settled<const T extends readonly AsyncOrPromise[]>(
  ...states: T
): MapCombinedSettledResult<T>;
export function settled(
  ...args:
    | [readonly AsyncOrPromise[]]
    | [Record<string, AsyncOrPromise>]
    | AsyncOrPromise[]
): CombinedSettledResult<any>[] | Record<string, CombinedSettledResult<any>> {
  // Normalize arguments
  let states: readonly AsyncOrPromise[] | Record<string, AsyncOrPromise>;
  if (
    args.length === 1 &&
    (Array.isArray(args[0]) || !isAsyncOrPromise(args[0]))
  ) {
    states = args[0] as
      | readonly AsyncOrPromise[]
      | Record<string, AsyncOrPromise>;
  } else {
    states = args as AsyncOrPromise[];
  }

  if (Array.isArray(states)) {
    return (states as readonly AsyncOrPromise[]).map(getSettledResult);
  }

  const record = states as Record<string, AsyncOrPromise>;
  const results: Record<string, CombinedSettledResult<any>> = {};
  for (const key in record) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      results[key] = getSettledResult(record[key]);
    }
  }
  return results;
}

