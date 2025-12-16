import type { Focus, Equality } from "../types";
import type {
  AsyncState,
  AsyncMode,
  AsyncContext,
  AsyncHandler,
  AsyncOptions,
  AsyncActions,
  CancellablePromise,
  AsyncRetryOptions,
  InferAsyncData,
  SettledResult,
  MapAsyncData,
  MapSettledResult,
  RaceResult,
  AsyncKey,
  AsyncRequestId,
  SerializedAsyncState,
} from "./types";
import { AsyncNotReadyError, AsyncAggregateError } from "./types";
import { resolveEquality, shallowEqual } from "../core/equality";

// ===== Global Promise Cache for Suspense =====

const pendingPromises = new WeakMap<AsyncKey<any>, Promise<any>>();

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

// ===== Helper: Ensure async execution (like Promise.try) =====

function promiseTry<T>(fn: () => T | Promise<T>): Promise<T> {
  return new Promise<T>((resolve) => resolve(fn()));
}

// ===== Helper: Create cancellable promise =====

function createCancellablePromise<T>(
  promise: Promise<T>,
  cancel: () => void
): CancellablePromise<T> {
  const cancellable = promise as CancellablePromise<T>;
  cancellable.cancel = cancel;
  return cancellable;
}

// ===== Helper: toJSON for AsyncState serialization =====

/**
 * Serialization method for AsyncState.
 * - Stale mode: always serialize as success (user opted into "keep data")
 * - Fresh mode: only serialize success state
 */
function stateToJSON<T>(
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

// ===== Helper: Get retry config =====

function getRetryCount(retry: number | AsyncRetryOptions | undefined): number {
  if (typeof retry === "number") return retry;
  if (retry && typeof retry === "object") return retry.count;
  return 0;
}

function getRetryDelay(
  retry: number | AsyncRetryOptions | undefined,
  attempt: number,
  error: Error
): number {
  if (typeof retry === "number") return 1000;
  if (retry && typeof retry === "object") {
    if (typeof retry.delay === "function") return retry.delay(attempt, error);
    return retry.delay ?? 1000;
  }
  return 1000;
}

// ===== Helper: Deps equality comparison =====

function createDepsEqual(equality?: Equality<unknown>) {
  const itemEqual = resolveEquality(equality);
  return (a: unknown, b: unknown) => shallowEqual(a, b, itemEqual);
}

// ===== Main async function =====

export function async<T, M extends AsyncMode, TArgs extends any[]>(
  focus: Focus<AsyncState<T, M>>,
  handler: AsyncHandler<T, TArgs>,
  options?: AsyncOptions
): AsyncActions<T, TArgs> {
  const [getState, setState] = focus;

  // Stable key for this async instance (used for promise tracking)
  const asyncKey: AsyncKey<T> = {};

  // Create deps equality comparator using provided equality option
  const depsEqual = createDepsEqual(options?.equality);

  // Track last cancel function and last args/deps
  let lastCancel: (() => void) | null = null;
  let lastArgs: TArgs | null = null;
  let lastDeps: unknown[] | null = null;

  // Core dispatch implementation
  function dispatchCore(...args: TArgs): CancellablePromise<T> {
    // Cancel any ongoing request (if autoCancel enabled, default: true)
    if (lastCancel && options?.autoCancel !== false) {
      lastCancel();
    }

    // Create new abort controller
    const abortController = new AbortController();
    let isCancelled = false;

    // Create unique request ID for this dispatch
    // Used to detect external state modifications (e.g., devtools rollback)
    const requestId: AsyncRequestId = {};

    // Create cancel function
    const cancel = () => {
      if (!isCancelled) {
        isCancelled = true;
        abortController.abort();
        // Clean up promise from cache
        pendingPromises.delete(asyncKey);
      }
    };

    // Store as lastCancel
    lastCancel = cancel;
    lastArgs = args;

    // Get current state to determine mode and stale data
    const prevState = getState();
    const mode = prevState.mode;
    const staleData =
      mode === "stale"
        ? prevState.data
        : prevState.status === "success"
        ? prevState.data
        : undefined;

    // Check if state was externally modified (only relevant when autoCancel is true)
    // With autoCancel: false, concurrent updates are intentional, so skip this check
    const autoCancel = options?.autoCancel !== false;

    // Helper to check if state was externally modified
    // Returns true if state was changed by something other than this async action
    const isStateExternallyModified = (): boolean => {
      if (!autoCancel) {
        // When autoCancel is false, concurrent updates are allowed
        // Only detect true external modifications (no __requestId at all)
        const currentState = getState();
        return currentState.__requestId === undefined;
      }
      // When autoCancel is true, any different requestId means our state is stale
      const currentState = getState();
      return currentState.__requestId !== requestId;
    };

    // Execute with retry logic
    const retryCount = getRetryCount(options?.retry);

    const executeWithRetry = async (): Promise<T> => {
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= retryCount; attempt++) {
        try {
          // Create async context
          const asyncContext: AsyncContext = {
            signal: abortController.signal,
          };

          // Execute handler - always async via promiseTry
          const result = await promiseTry(() => handler(asyncContext, ...args));

          // Check if cancelled
          if (isCancelled) {
            throw new DOMException("Aborted", "AbortError");
          }

          // Check if state was externally modified (e.g., devtools rollback)
          if (isStateExternallyModified()) {
            // State was changed externally, don't overwrite
            // Still return result to the caller
            return result;
          }

          // Success - update state (preserve mode)
          setState({
            status: "success",
            mode,
            data: result,
            error: undefined,
            timestamp: Date.now(),
            __requestId: requestId,
            toJSON: stateToJSON,
          } as AsyncState<T, M>);

          // Clear lastCancel since we're done
          if (lastCancel === cancel) {
            lastCancel = null;
          }

          return result;
        } catch (error) {
          // If aborted, rethrow immediately
          if (isCancelled || abortController.signal.aborted) {
            throw error instanceof Error
              ? error
              : new DOMException("Aborted", "AbortError");
          }

          lastError = error instanceof Error ? error : new Error(String(error));

          // If more retries available, wait and retry
          if (attempt < retryCount) {
            const delay = getRetryDelay(options?.retry, attempt + 1, lastError);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }
      }

      // Check if state was externally modified before setting error state
      if (isStateExternallyModified()) {
        // State was changed externally, don't overwrite
        // Still throw error to the caller
        throw lastError;
      }

      // All retries exhausted - update state with error
      // In stale mode, keep data; in fresh mode, data is undefined
      setState({
        status: "error",
        mode,
        data: mode === "stale" ? staleData : undefined,
        error: lastError!,
        timestamp: undefined,
        __requestId: requestId,
        toJSON: stateToJSON,
      } as AsyncState<T, M>);

      // Clear lastCancel since we're done
      if (lastCancel === cancel) {
        lastCancel = null;
      }

      // Call error callback
      if (options?.onError && lastError) {
        options.onError(lastError);
      }

      throw lastError;
    };

    // Start execution and create cancellable promise
    const promise = executeWithRetry();

    // Store promise in cache for Suspense support
    pendingPromises.set(asyncKey, promise);

    // Update state to pending with key and requestId
    // In stale mode, preserve data; in fresh mode, data is undefined
    setState({
      status: "pending",
      mode,
      data: mode === "stale" ? staleData : undefined,
      error: undefined,
      timestamp: undefined,
      __key: asyncKey,
      __requestId: requestId,
      toJSON: stateToJSON,
    } as AsyncState<T, M>);

    // Clean up promise from cache when done (success or error)
    promise.then(
      () => pendingPromises.delete(asyncKey),
      () => pendingPromises.delete(asyncKey)
    );

    return createCancellablePromise(promise, cancel);
  }

  // Ensure: dispatch only if deps + args changed
  function ensure(deps: unknown[], ...args: TArgs): CancellablePromise<T> {
    // Build actual deps from [...deps, ...args]
    const actualDeps = [...deps, ...args];

    // If deps + args are same, return resolved promise with current data (or reject if error)
    if (depsEqual(lastDeps, actualDeps)) {
      const currentState = getState();
      if (currentState.status === "success") {
        const resolved = Promise.resolve(currentState.data);
        return createCancellablePromise(resolved, () => {});
      }
      if (currentState.status === "error") {
        const rejected = Promise.reject(currentState.error);
        return createCancellablePromise(rejected, () => {});
      }
    }

    // Deps or args changed, update and dispatch
    lastDeps = actualDeps;
    return dispatchCore(...args);
  }

  // Refresh: re-dispatch with last args
  function refresh(): CancellablePromise<T> {
    if (lastArgs === null) {
      const rejected = Promise.reject(
        new Error("Cannot refresh: no previous dispatch")
      );
      return createCancellablePromise(rejected, () => {});
    }
    return dispatchCore(...lastArgs);
  }

  // Cancel: invoke lastCancel
  function cancel(): void {
    if (lastCancel) {
      lastCancel();
      lastCancel = null;
    }
  }

  // Reset: cancel and reset to idle
  function reset(): void {
    cancel();
    lastArgs = null;
    lastDeps = null;
    const currentState = getState();
    const mode = currentState.mode;

    // Create new requestId to invalidate any in-flight requests
    const resetRequestId: AsyncRequestId = {};

    // In stale mode, keep data on reset; in fresh mode, clear it
    if (mode === "stale") {
      setState({
        status: "idle",
        mode: "stale",
        data: currentState.data,
        error: undefined,
        timestamp: undefined,
        __requestId: resetRequestId,
        toJSON: stateToJSON,
      } as AsyncState<T, M>);
    } else {
      setState({
        status: "idle",
        mode: "fresh",
        data: undefined,
        error: undefined,
        timestamp: undefined,
        __requestId: resetRequestId,
        toJSON: stateToJSON,
      } as AsyncState<T, M>);
    }
  }

  return {
    dispatch: dispatchCore,
    ensure,
    refresh,
    cancel,
    reset,
  };
}

// ===== Namespace helpers for creating async state and utilities =====

export namespace async {
  // ===== State Creators =====

  /**
   * Create a fresh mode async state (data undefined during loading/error).
   */
  export function fresh<T = unknown>(): AsyncState<T, "fresh"> {
    return {
      status: "idle",
      mode: "fresh",
      data: undefined,
      error: undefined,
      timestamp: undefined,
      toJSON: stateToJSON,
    };
  }

  /**
   * Create a stale mode async state with initial data.
   * Data is preserved during loading and error states.
   */
  export function stale<T>(initialData: T): AsyncState<T, "stale"> {
    return {
      status: "idle",
      mode: "stale",
      data: initialData,
      error: undefined,
      timestamp: undefined,
      toJSON: stateToJSON,
    };
  }

  /**
   * Create an idle state (fresh mode, no data).
   * @deprecated Use async.fresh() instead
   */
  export function idle<T = unknown>(): AsyncState<T, "fresh"> {
    return fresh<T>();
  }

  /**
   * Create a success state.
   */
  export function success<T, M extends AsyncMode = "fresh">(
    data: T,
    mode: M = "fresh" as M
  ): AsyncState<T, M> {
    return {
      status: "success",
      mode,
      data,
      error: undefined,
      timestamp: Date.now(),
      toJSON: stateToJSON,
    } as AsyncState<T, M>;
  }

  /**
   * Create a pending state.
   */
  export function pending<T = unknown, M extends AsyncMode = "fresh">(
    mode: M = "fresh" as M,
    data?: T
  ): AsyncState<T, M> {
    return {
      status: "pending",
      mode,
      data: mode === "stale" ? data : undefined,
      error: undefined,
      timestamp: undefined,
      toJSON: stateToJSON,
    } as AsyncState<T, M>;
  }

  /**
   * Create an error state.
   */
  export function error<T = unknown, M extends AsyncMode = "fresh">(
    err: Error,
    mode: M = "fresh" as M,
    staleData?: T
  ): AsyncState<T, M> {
    return {
      status: "error",
      mode,
      data: mode === "stale" ? staleData : undefined,
      error: err,
      timestamp: undefined,
      toJSON: stateToJSON,
    } as AsyncState<T, M>;
  }

  // ===== Utility Methods =====

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

    throw new AsyncNotReadyError(
      `Cannot wait: state is ${state.status}`,
      state.status
    );
  }

  /**
   * Returns the first successful result from a record of async states.
   * Also considers stale data as "ready" in stale mode.
   */
  export function race<T extends Record<string, AsyncState<any, any>>>(
    states: T
  ): RaceResult<T> {
    // First check for success
    for (const key in states) {
      if (Object.prototype.hasOwnProperty.call(states, key)) {
        const state = states[key];
        if (state.status === "success") {
          return [key, state.data] as RaceResult<T>;
        }
      }
    }

    // Then check for stale data
    for (const key in states) {
      if (Object.prototype.hasOwnProperty.call(states, key)) {
        const state = states[key];
        if (state.mode === "stale" && state.data !== undefined) {
          return [key, state.data] as RaceResult<T>;
        }
      }
    }

    // Check for errors
    for (const key in states) {
      if (Object.prototype.hasOwnProperty.call(states, key)) {
        const state = states[key];
        if (state.status === "error") {
          throw state.error;
        }
      }
    }

    // All pending or idle (fresh mode)
    throw new AsyncNotReadyError(
      "No async state has resolved successfully",
      "pending"
    );
  }

  /**
   * Returns all data if all states are ready.
   * In stale mode, stale data counts as ready.
   */
  export function all<T extends readonly AsyncState<any, any>[]>(
    ...states: T
  ): MapAsyncData<T> {
    const results: any[] = [];

    for (let i = 0; i < states.length; i++) {
      const state = states[i];

      if (state.status === "success") {
        results.push(state.data);
        continue;
      }

      // In stale mode, use stale data
      if (state.mode === "stale" && state.data !== undefined) {
        results.push(state.data);
        continue;
      }

      if (state.status === "error") {
        throw state.error;
      }

      throw new AsyncNotReadyError(
        `State at index ${i} is ${state.status}`,
        state.status
      );
    }

    return results as MapAsyncData<T>;
  }

  /**
   * Returns the first ready data from multiple states.
   */
  export function any<T extends readonly AsyncState<any, any>[]>(
    ...states: T
  ): InferAsyncData<T[number]> {
    const errors: Error[] = [];

    // First check success
    for (const state of states) {
      if (state.status === "success") {
        return state.data;
      }
    }

    // Then check stale data
    for (const state of states) {
      if (state.mode === "stale" && state.data !== undefined) {
        return state.data;
      }
      if (state.status === "error") {
        errors.push(state.error);
      }
    }

    // If all are errors, throw aggregate
    if (errors.length === states.length) {
      throw new AsyncAggregateError("All async states have errors", errors);
    }

    // Some are pending/idle
    throw new AsyncNotReadyError(
      "No async state has resolved successfully",
      "pending"
    );
  }

  /**
   * Returns settled results for all states (never throws).
   * Includes mode-aware data in results.
   */
  export function settled<T extends readonly AsyncState<any, any>[]>(
    ...states: T
  ): MapSettledResult<T> {
    const results: SettledResult<any, any>[] = [];

    for (const state of states) {
      switch (state.status) {
        case "success":
          results.push({ status: "success", data: state.data });
          break;
        case "error":
          results.push({
            status: "error",
            error: state.error,
            data: state.mode === "stale" ? state.data : undefined,
          });
          break;
        case "pending":
          results.push({
            status: "pending",
            data: state.mode === "stale" ? state.data : undefined,
          });
          break;
        case "idle":
          results.push({
            status: "idle",
            data: state.mode === "stale" ? state.data : undefined,
          });
          break;
      }
    }

    return results as MapSettledResult<T>;
  }

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
}
