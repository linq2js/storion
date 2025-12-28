/**
 * Store-bound async actions.
 * Creates async actions that update state via a focus (lens).
 */

import type { Focus } from "../types";
import type {
  AsyncState,
  AsyncMode,
  AsyncContext,
  AsyncHandler,
  AsyncOptions,
  AsyncActions,
  AsyncLastInvocation,
  CancellablePromise,
  AsyncKey,
  AsyncRequestId,
} from "./types";
import { SetupPhaseError } from "../errors";
import { untrack } from "../core/tracking";
import { createAsyncContext } from "./context";
import { isAbortable, type Abortable } from "./abortable";
import {
  pendingPromises,
  promiseTry,
  createCancellablePromise,
  stateToJSON,
} from "./helpers";

// =============================================================================
// HELPER: WRAP ABORTABLE
// =============================================================================

/**
 * Convert an Abortable to an AsyncHandler.
 * Automatically calls fn.withSignal(ctx.signal, ...args).
 * @internal
 */
function wrapAbortable<T, TArgs extends any[]>(
  fn: Abortable<TArgs, T>
): AsyncHandler<T, TArgs> {
  return (ctx: AsyncContext, ...args: TArgs): T | PromiseLike<T> => {
    return fn.withSignal(ctx.signal, ...args) as T | PromiseLike<T>;
  };
}

// =============================================================================
// ASYNC WITH FOCUS IMPLEMENTATION
// =============================================================================

/**
 * Internal implementation for focus-based async.
 * @internal
 */
export function asyncWithFocus<T, M extends AsyncMode, TArgs extends any[]>(
  focus: Focus<AsyncState<T, M>>,
  handler: AsyncHandler<T, TArgs>,
  options?: AsyncOptions
): AsyncActions<T, M, TArgs> {
  // Ensure async.action is called during setup phase
  if (!focus._storeContext.isSetupPhase()) {
    throw new SetupPhaseError(
      "async.action",
      "async.action() must be called during store setup phase."
    );
  }

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

      // Execute the handler
      const execute = async (): Promise<T> => {
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

          const errorObj =
            error instanceof Error ? error : new Error(String(error));

          // Abort the signal to cancel any pending ctx.safe() operations
          if (!abortController.signal.aborted) {
            abortController.abort();
          }

          // Check if state was externally modified before setting error state
          if (isStateExternallyModified()) {
            // State was changed externally, don't overwrite
            // Still throw error to the caller
            throw errorObj;
          }

          // Update state with error
          // In stale mode, keep data; in fresh mode, data is undefined
          setState({
            status: "error",
            mode,
            data: mode === "stale" ? staleData : undefined,
            error: errorObj,
            timestamp: undefined,
            __requestId: requestId,
            toJSON: stateToJSON,
          } as AsyncState<T, M>);

          // Clear lastCancel since we're done
          if (lastCancel === cancel) {
            lastCancel = null;
          }

          throw errorObj;
        }
      };

      // Start execution and race with cancellation
      // This ensures dispatch() rejects immediately on cancel, even if handler is stuck
      const executionPromise = execute();
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

  // Set state to success directly (for optimistic updates, websocket, SSR, testing)
  function success(data: T): void {
    untrack(() => {
      const autoCancel = options?.autoCancel !== false;

      // Respect autoCancel option (same logic as dispatch)
      if (lastCancel && autoCancel) {
        lastCancel();
        lastCancel = null;
      }

      const currentState = getState();
      const mode = currentState.mode;

      // For requestId:
      // - autoCancel: true → new requestId (any mismatch = external modification)
      // - autoCancel: false → undefined (matches the "external modification" check)
      const successRequestId: AsyncRequestId | undefined = autoCancel
        ? {}
        : undefined;

      setState({
        status: "success",
        mode,
        data,
        error: undefined,
        timestamp: Date.now(),
        __requestId: successRequestId,
        toJSON: stateToJSON,
      } as AsyncState<T, M>);
    });
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
    success,
  };
}

// =============================================================================
// ASYNC ACTION
// =============================================================================

/**
 * Create async actions bound to a focus (lens) for async state management.
 * Use *Query naming for read operations, *Mutation for write operations.
 *
 * @example
 * const userStore = store({
 *   name: 'user',
 *   state: { user: async.fresh<User>() },
 *   setup({ focus }) {
 *     const userQuery = async.action(focus('user'), async (ctx, id: string) => {
 *       const res = await fetch(`/api/users/${id}`, { signal: ctx.signal });
 *       return res.json();
 *     });
 *     return { fetchUser: userQuery.dispatch };
 *   },
 * });
 */
export function action<T, M extends AsyncMode, TArgs extends any[]>(
  focus: Focus<AsyncState<T, M>>,
  handler: AsyncHandler<T, TArgs>,
  options?: AsyncOptions
): AsyncActions<T, M, TArgs>;

/**
 * Create async actions with an Abortable (signal auto-injected).
 */
export function action<T, M extends AsyncMode, TArgs extends any[]>(
  focus: Focus<AsyncState<T, M>>,
  abortableFn: Abortable<TArgs, T>,
  options?: AsyncOptions
): AsyncActions<T, M, TArgs>;

// Implementation
export function action<T, M extends AsyncMode, TArgs extends any[]>(
  focus: Focus<AsyncState<T, M>>,
  handlerOrAbortable: AsyncHandler<T, TArgs> | Abortable<TArgs, T>,
  options?: AsyncOptions
): AsyncActions<T, M, TArgs> {
  const handler = isAbortable(handlerOrAbortable)
    ? wrapAbortable(handlerOrAbortable as Abortable<TArgs, T>)
    : (handlerOrAbortable as AsyncHandler<T, TArgs>);
  return asyncWithFocus(focus, handler, options);
}
