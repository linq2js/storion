import type {
  Focus,
  MetaEntry,
  SelectorContext,
  SelectorMixin,
} from "../types";
import type {
  AsyncState,
  AsyncMode,
  AsyncContext,
  AsyncHandler,
  AsyncOptions,
  AsyncActions,
  AsyncLastInvocation,
  CancellablePromise,
  AsyncRetryOptions,
  AsyncRetryDelayFn,
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
import { effect } from "../core/effect";
import { untrack } from "../core/tracking";
import { AsyncFunctionError } from "../errors";
import { store } from "../core/store";
import { createAsyncContext } from "./context";
import { isAbortable, type AbortableFn } from "./abortable";

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

/**
 * Wraps a synchronous or async function to always return a Promise.
 * Ensures async execution even for synchronous functions.
 */
function promiseTry<T>(fn: () => T | PromiseLike<T>): Promise<Awaited<T>> {
  return new Promise<Awaited<T>>((resolve) => {
    resolve(fn() as Awaited<T>);
  });
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

import { retryStrategy, type RetryStrategyName } from "./types";

type RetryOption =
  | number
  | RetryStrategyName
  | AsyncRetryDelayFn
  | AsyncRetryOptions
  | undefined;

const STRATEGY_NAMES = new Set<string>([
  "backoff",
  "linear",
  "fixed",
  "fibonacci",
  "immediate",
]);

function isStrategyName(value: unknown): value is RetryStrategyName {
  return typeof value === "string" && STRATEGY_NAMES.has(value);
}

function getRetryCount(retry: RetryOption): number {
  if (typeof retry === "number") return retry;
  if (typeof retry === "function") return Infinity; // Retry until delay function signals stop
  if (isStrategyName(retry)) return 3; // Default 3 retries for named strategies
  if (retry && typeof retry === "object") return retry.count;
  return 0;
}

function getRetryDelay(
  retry: RetryOption,
  attempt: number,
  error: Error
): number | Promise<void> {
  // Number: use default backoff strategy
  if (typeof retry === "number") return retryStrategy.backoff(attempt);
  // Function: custom delay
  if (typeof retry === "function") return retry(attempt, error);
  // Strategy name: use named strategy
  if (isStrategyName(retry)) return retryStrategy[retry](attempt);
  // Object with delay
  if (retry && typeof retry === "object") {
    const { delay } = retry;
    if (typeof delay === "function") return delay(attempt, error);
    if (isStrategyName(delay)) return retryStrategy[delay](attempt);
    return delay ?? retryStrategy.backoff(attempt);
  }
  return retryStrategy.backoff(attempt);
}

// ===== Async Mixin Options =====

/**
 * Options for creating an async selector mixin.
 */
export interface AsyncMixinOptions<T, M extends AsyncMode = "fresh">
  extends AsyncOptions {
  /**
   * Initial async state. Defaults to `async.fresh<T>()`.
   */
  initial?: AsyncState<T, M>;
  /**
   * Name of store for the async state. Defaults to `async:${handler.name || "anonymous"}`.
   */
  name?: string;
  /**
   * Metadata for the async state. Defaults to empty array.
   */
  meta?: MetaEntry<"result"> | MetaEntry<"result">[];
}

/**
 * Result tuple from async selector mixin: [state, actions]
 */
export type AsyncMixinResult<T, M extends AsyncMode, TArgs extends any[]> = [
  AsyncState<T, M>,
  AsyncActions<T, M, TArgs>
];

// ===== Main async function =====

/**
 * Convert an AbortableFn to an AsyncHandler.
 * Automatically calls fn.withSignal(ctx.signal, ...args).
 */
function wrapAbortableFn<T, TArgs extends any[]>(
  fn: AbortableFn<TArgs, T | PromiseLike<T>>
): AsyncHandler<T, TArgs> {
  return (ctx: AsyncContext, ...args: TArgs) => {
    return fn.withSignal(ctx.signal, ...args);
  };
}

/**
 * Create async actions bound to a focus (lens) for async state management.
 * Use *Query naming for read operations, *Mutation for write operations.
 *
 * @example
 * const userStore = store({
 *   name: 'user',
 *   state: { user: async.fresh<User>() },
 *   setup({ focus }) {
 *     // Use *Query for read operations
 *     const userQuery = async(focus('user'), async (ctx, id: string) => {
 *       const res = await fetch(`/api/users/${id}`, { signal: ctx.signal });
 *       return res.json();
 *     });
 *     return { fetchUser: userQuery.dispatch };
 *   },
 * });
 */
export function async<T, M extends AsyncMode, TArgs extends any[]>(
  focus: Focus<AsyncState<T, M>>,
  handler: AsyncHandler<T, TArgs>,
  options?: AsyncOptions
): AsyncActions<T, M, TArgs>;

/**
 * Create async actions with an AbortableFn (signal auto-injected).
 *
 * @example
 * const getUser = abortable(async (signal, id: string) => {
 *   const res = await fetch(`/api/users/${id}`, { signal });
 *   return res.json();
 * });
 *
 * const userQuery = async(focus('user'), getUser);
 */
export function async<T, M extends AsyncMode, TArgs extends any[]>(
  focus: Focus<AsyncState<T, M>>,
  abortableFn: AbortableFn<TArgs, T | PromiseLike<T>>,
  options?: AsyncOptions
): AsyncActions<T, M, TArgs>;

/**
 * Create an async selector mixin for component-local async state.
 * Uses `scoped()` internally, so state is isolated per component and auto-disposed.
 *
 * @example
 * const fetchUser = async(
 *   async (ctx, userId: string) => {
 *     const res = await fetch(`/api/users/${userId}`, { signal: ctx.signal });
 *     return res.json();
 *   }
 * );
 *
 * function UserProfile({ userId }) {
 *   const [user, { dispatch }] = useStore(({ mixin }) => {
 *     return mixin(fetchUser);
 *   });
 *
 *   // Trigger fetch
 *   trigger(dispatch, [userId], userId);
 *
 *   if (user.status === 'pending') return <Spinner />;
 *   return <div>{user.data?.name}</div>;
 * }
 */
export function async<T, TArgs extends any[]>(
  handler: AsyncHandler<T, TArgs>,
  options?: AsyncMixinOptions<T, "fresh">
): SelectorMixin<AsyncMixinResult<T, "fresh", TArgs>>;

/**
 * Create an async selector mixin with stale mode.
 */
export function async<T, TArgs extends any[]>(
  handler: AsyncHandler<T, TArgs>,
  options: AsyncMixinOptions<T, "stale"> & { initial: AsyncState<T, "stale"> }
): SelectorMixin<AsyncMixinResult<T, "stale", TArgs>>;

/**
 * Create an async selector mixin with an AbortableFn (signal auto-injected).
 *
 * @example
 * const getUser = abortable(async (signal, id: string) => {
 *   const res = await fetch(`/api/users/${id}`, { signal });
 *   return res.json();
 * });
 *
 * const userMixin = async(getUser);
 */
export function async<T, TArgs extends any[]>(
  abortableFn: AbortableFn<TArgs, T | PromiseLike<T>>,
  options?: AsyncMixinOptions<T, "fresh">
): SelectorMixin<AsyncMixinResult<T, "fresh", TArgs>>;

/**
 * Create an async selector mixin with an AbortableFn and stale mode.
 */
export function async<T, TArgs extends any[]>(
  abortableFn: AbortableFn<TArgs, T | PromiseLike<T>>,
  options: AsyncMixinOptions<T, "stale"> & { initial: AsyncState<T, "stale"> }
): SelectorMixin<AsyncMixinResult<T, "stale", TArgs>>;

// Implementation
export function async<T, M extends AsyncMode, TArgs extends any[]>(
  focusOrHandler:
    | Focus<AsyncState<T, M>>
    | AsyncHandler<T, TArgs>
    | AbortableFn<TArgs, T | PromiseLike<T>>,
  handlerOrOptions?:
    | AsyncHandler<T, TArgs>
    | AbortableFn<TArgs, T | PromiseLike<T>>
    | AsyncMixinOptions<T, M>,
  maybeOptions?: AsyncOptions
): AsyncActions<T, M, TArgs> | SelectorMixin<AsyncMixinResult<T, M, TArgs>> {
  // Check if first argument is a handler/abortable (mixin mode) or focus (actions mode)
  if (typeof focusOrHandler === "function") {
    // Mixin mode: async(handler, options?) or async(abortableFn, options?) => SelectorMixin
    const handler = isAbortable(focusOrHandler)
      ? wrapAbortableFn(
          focusOrHandler as AbortableFn<TArgs, T | PromiseLike<T>>
        )
      : (focusOrHandler as AsyncHandler<T, TArgs>);
    const options = handlerOrOptions as AsyncMixinOptions<T, M> | undefined;

    // Determine initial state
    const initialState =
      options?.initial ?? (asyncState("fresh", "idle") as AsyncState<T, M>);

    // Create a store spec for the async state
    // Use 'any' to bypass ActionsBase constraint - we control the types at mixin return
    const asyncSpec = store({
      name: options?.name ?? `async:${handler.name || "anonymous"}`,
      state: { result: initialState },
      meta: options?.meta,
      setup(storeContext) {
        const { focus } = storeContext;
        // Create async actions bound to the result focus
        const actions = asyncWithFocus(
          focus("result") as Focus<AsyncState<T, M>>,
          (asyncContext: AsyncContext, ...args: TArgs) => {
            return handler(asyncContext, ...args);
          },
          options
        ) as any;

        return actions;
      },
    });

    // Return a selector mixin that uses scoped()
    return ((context: SelectorContext) => {
      const [state, actions] = context.scoped(asyncSpec);
      return [state.result, actions] as AsyncMixinResult<T, M, TArgs>;
    }) as SelectorMixin<AsyncMixinResult<T, M, TArgs>>;
  }

  // Actions mode: async(focus, handler, options?) or async(focus, abortableFn, options?) => AsyncActions
  const focus = focusOrHandler as Focus<AsyncState<T, M>>;
  const handler = isAbortable(handlerOrOptions)
    ? wrapAbortableFn(
        handlerOrOptions as AbortableFn<TArgs, T | PromiseLike<T>>
      )
    : (handlerOrOptions as AsyncHandler<T, TArgs>);
  const options = maybeOptions;

  return asyncWithFocus(focus, handler, options);
}

// Internal implementation for focus-based async
function asyncWithFocus<T, M extends AsyncMode, TArgs extends any[]>(
  focus: Focus<AsyncState<T, M>>,
  handler: AsyncHandler<T, TArgs>,
  options?: AsyncOptions
): AsyncActions<T, M, TArgs> {
  const [getState, setState] = focus;

  // Stable key for this async instance (used for promise tracking)
  const asyncKey: AsyncKey<T> = {};

  // Track last cancel function, last args, and invocation count (in closure)
  let lastCancel: (() => void) | null = null;
  let lastArgs: TArgs | null = null;
  let invocationCount = 0;

  // Dispatch implementation
  function dispatch(...args: TArgs): CancellablePromise<T> {
    return untrack(() => {
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

      // Create a promise that rejects when cancelled
      // This ensures dispatch() rejects immediately on cancel, even if handler is stuck
      let rejectOnCancel: ((error: Error) => void) | null = null;
      const cancelPromise = new Promise<never>((_, reject) => {
        rejectOnCancel = reject;
      });

      // Create cancel function
      const cancel = () => {
        if (!isCancelled) {
          isCancelled = true;
          abortController.abort();
          // Clean up promise from cache
          pendingPromises.delete(asyncKey);
          // Reject the cancel promise to ensure dispatch() rejects immediately
          rejectOnCancel?.(new DOMException("Aborted", "AbortError"));
        }
      };

      // Store as lastCancel and increment invocation count
      lastCancel = cancel;
      lastArgs = args;
      invocationCount++;

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
            const isCancelledOrAborted = () =>
              isCancelled || abortController.signal.aborted;
            const asyncContext = createAsyncContext(
              abortController,
              isCancelledOrAborted,
              cancel,
              focus._resolver
            );

            // Execute handler - always async via invoke
            const result = await promiseTry(() =>
              handler(asyncContext, ...args)
            );

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

            lastError =
              error instanceof Error ? error : new Error(String(error));

            // If more retries available, wait and retry
            if (attempt < retryCount) {
              const delay = getRetryDelay(
                options?.retry,
                attempt + 1,
                lastError
              );
              // Support both number (ms) and Promise<void> for custom delay logic
              if (typeof delay === "number") {
                await new Promise((resolve) => setTimeout(resolve, delay));
              } else {
                await delay;
              }
              continue;
            }
          }
        }

        // All retries exhausted - abort the signal to cancel any pending ctx.safe() operations
        if (!abortController.signal.aborted) {
          abortController.abort();
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

      // Start execution and race with cancellation
      // This ensures dispatch() rejects immediately on cancel, even if handler is stuck
      const executionPromise = executeWithRetry();
      const promise = Promise.race([executionPromise, cancelPromise]);

      // Store execution promise in cache for Suspense support
      // (not the raced promise, as we want Suspense to track actual execution)
      pendingPromises.set(asyncKey, executionPromise);

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
    });
  }

  // Refresh: re-dispatch with last args
  function refresh(): CancellablePromise<T> | undefined {
    if (lastArgs === null) {
      return undefined;
    }
    return dispatch(...lastArgs);
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

  // Get last invocation info (reactive via state read)
  function last(): AsyncLastInvocation<T, M, TArgs> | undefined {
    // Check if ever dispatched
    const hasDispatched = !!lastArgs;
    if (!hasDispatched) {
      return undefined;
    }

    return {
      args: lastArgs!,
      nth: invocationCount,
      // Read state to trigger reactivity (via focus getter) - this is the only tracked read
      state: getState(),
    };
  }
  if (options?.autoCancel) {
    focus._storeContext.onDispose(() => {
      cancel();
    });
  }

  return {
    dispatch,
    refresh,
    cancel,
    reset,
    last,
  };
}

// ===== Namespace helpers for creating async state and utilities =====

// ===== asyncState() Factory Function =====

/**
 * Extra properties that can be added to async state.
 * @internal
 */
interface AsyncStateExtra<T> {
  __key?: AsyncKey<T>;
  __requestId?: AsyncRequestId;
}

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

export namespace async {
  // ===== State Creators =====

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

  // ===== Utility Methods =====
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

  /**
   * Derive an async state from other async states using a synchronous computation.
   * The computation function uses `async.wait()` to extract data from async states,
   * which throws promises when states are pending.
   *
   * Key behaviors:
   * - If `computeFn` throws a promise (via `async.wait`), sets focus to pending and re-runs after promise settles
   * - If `computeFn` throws an error, sets focus to error state
   * - If `computeFn` returns a value, sets focus to success state
   * - If `computeFn` returns a promise (not throws), throws an error - must be synchronous
   * - Uses a single wrapper promise to avoid cascading re-renders
   *
   * @param focus - Focus to update with derived async state
   * @param computeFn - Synchronous computation function that uses `async.wait()` to read async states
   * @returns Dispose function to stop the derivation
   *
   * @example
   * // Basic usage - derive from multiple async states
   * async.derive(focus('c'), () => {
   *   const a = async.wait(state.a);
   *   const b = async.wait(state.b);
   *   return a + b;
   * });
   *
   * @example
   * // Conditional dependencies
   * async.derive(focus('result'), () => {
   *   const type = async.wait(state.type);
   *   if (type === 'user') {
   *     return async.wait(state.userData);
   *   } else {
   *     return async.wait(state.guestData);
   *   }
   * });
   *
   * @example
   * // For parallel waiting, use async.all
   * async.derive(focus('combined'), () => {
   *   const [a, b, c] = async.all(state.a, state.b, state.c);
   *   return { a, b, c };
   * });
   *
   * @example
   * // With stale mode - preserves data during loading/error
   * async.derive(focus('result'), () => {
   *   return async.wait(state.userData);
   * });
   */
  export function derive<T, M extends AsyncMode = "fresh">(
    focus: Focus<AsyncState<T, M>>,
    computeFn: () => T
  ): VoidFunction {
    const [getState, setState] = focus;

    // Track if we've created a wrapper promise for this derivation cycle
    let hasSetPending = false;

    return effect((ctx) => {
      // Read current state WITHOUT tracking to get mode and stale data
      // This prevents the derived state from depending on itself
      const currentState = untrack(getState);

      try {
        const result = computeFn();

        // computeFn must be synchronous - returning a promise is an error
        if (
          result !== null &&
          result !== undefined &&
          typeof (result as any).then === "function"
        ) {
          throw new AsyncFunctionError(
            "async.derive computeFn",
            "Use async.wait() for async values, not async/await or returning promises."
          );
        }

        // Success - reset pending flag and set success state
        hasSetPending = false;
        setState(asyncState.from(currentState, "success", result));
      } catch (ex) {
        // Check if it's a thrown promise (from async.wait on pending state)
        if (
          ex !== null &&
          ex !== undefined &&
          typeof (ex as any).then === "function"
        ) {
          // Only set pending state once per derivation cycle
          if (!hasSetPending) {
            hasSetPending = true;
            setState(asyncState.from(currentState, "pending"));
          }

          // When promise settles, refresh the effect to re-run computation
          ctx.safe(ex as Promise<unknown>).then(ctx.refresh, ctx.refresh);
        } else {
          // Real error - reset pending flag and set error state
          hasSetPending = false;
          const error = ex instanceof Error ? ex : new Error(String(ex));
          setState(asyncState.from(currentState, "error", error));
        }
      }
    });
  }
}
