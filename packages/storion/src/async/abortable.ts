/**
 * Abortable function utilities.
 *
 * Creates async functions with full lifecycle control:
 * - Pause/Resume execution
 * - Abort with cleanup
 * - External event injection (take/send)
 * - Status tracking
 *
 * Similar to saga pattern but uses async/await instead of suspense.
 */

import { createSafe, type SafeFnWithUtils } from "./safe";
import { abortableSymbol, isAbortable } from "./abortable-guard";

// Re-export for public API
export { isAbortable };

// =============================================================================
// STATUS TYPE
// =============================================================================

export type AbortableStatus =
  | "running"
  | "success"
  | "error"
  | "paused"
  | "waiting"
  | "aborted";

// =============================================================================
// EVENT TYPES (TYield)
// =============================================================================

/**
 * Send function type.
 * - When TYield is void: `() => void` (checkpoint/nudge pattern)
 * - When TYield is object: `<K>(key: K, value: TYield[K]) => void`
 */
export type AbortableSend<TYield extends void | object = void> =
  void extends TYield
    ? () => void
    : <TKey extends keyof TYield>(key: TKey, value: TYield[TKey]) => void;

/**
 * Take function type.
 * Returns a Promise that resolves when the event arrives.
 * - When TYield is void: `() => Promise<void>` (checkpoint pattern)
 * - When TYield is object: `<K>(key: K) => Promise<TYield[K]>`
 */
export type AbortableTake<TYield extends void | object = void> =
  void extends TYield
    ? () => Promise<void>
    : <TKey extends keyof TYield>(key: TKey) => Promise<TYield[TKey]>;

/**
 * Join function type for coordinating multiple abortable results.
 * When the parent abortable is aborted, all joined results are also aborted.
 */
export type AbortableJoin = {
  /** Join a single abortable result */
  <TResult>(result: AbortableResult<TResult, any>): Promise<TResult>;

  /** Join multiple abortable results (like Promise.all with abort propagation) */
  <const T extends readonly AbortableResult<any, any>[]>(results: T): Promise<{
    -readonly [K in keyof T]: Awaited<T[K]>;
  }>;
};

// =============================================================================
// ABORTABLE RESULT
// =============================================================================

/**
 * Result returned when invoking an abortable function.
 * Extends Promise for async consumption while providing control methods.
 *
 * @example
 * ```ts
 * const result = myAbortable(args);
 *
 * // Promise-like usage
 * const value = await result;
 *
 * // Control methods
 * result.pause();
 * result.resume();
 * result.abort();
 *
 * // Status checks
 * result.running();  // boolean
 * result.status();   // "running" | "success" | ...
 *
 * // Event sending
 * result.send("eventKey", eventValue);
 * ```
 */
export type AbortableResult<
  TResult,
  TYield extends void | object = void
> = Promise<TResult> & {
  /** Send an event to the abortable */
  send: AbortableSend<TYield>;

  // ---------------------------------------------------------------------------
  // Status checks
  // ---------------------------------------------------------------------------

  /** Check if abortable has failed */
  failed(): boolean;

  /** Check if abortable has completed (success, error, or aborted) */
  completed(): boolean;

  /** Check if abortable is currently running */
  running(): boolean;

  /** Check if abortable succeeded */
  succeeded(): boolean;

  /** Check if abortable is paused */
  paused(): boolean;

  /** Check if abortable is waiting for async operation or event */
  waiting(): boolean;

  /** Check if abortable was aborted */
  aborted(): boolean;

  /** Get current status */
  status(): AbortableStatus;

  // ---------------------------------------------------------------------------
  // Result access
  // ---------------------------------------------------------------------------

  /** Get result if succeeded, undefined otherwise */
  result(): Awaited<TResult> | undefined;

  /** Get error if failed, undefined otherwise */
  error(): Error | undefined;

  // ---------------------------------------------------------------------------
  // Control methods
  // ---------------------------------------------------------------------------

  /**
   * Pause execution at current await point.
   * @returns false if already paused or completed
   */
  pause(): boolean;

  /**
   * Resume execution from paused state.
   * @returns false if not paused
   */
  resume(): boolean;

  /**
   * Abort execution.
   * Does NOT affect parent signal - only this abortable's internal signal.
   * @returns false if already aborted or completed
   */
  abort(): boolean;
};

// =============================================================================
// ABORTABLE CONTEXT
// =============================================================================

/**
 * Context passed to abortable function handlers.
 *
 * @example
 * ```ts
 * const myFn = abortable<[string], Result, { confirm: boolean }>(
 *   async ({ signal, safe, take, aborted, abort }, id) => {
 *     const data = await safe(fetchData, id);
 *
 *     if (aborted()) return null;
 *
 *     const confirmed = await take("confirm");
 *     if (!confirmed) {
 *       abort();
 *       return null;
 *     }
 *
 *     return processData(data);
 *   }
 * );
 * ```
 */
export interface AbortableContext<TYield extends void | object = void> {
  /**
   * AbortSignal for this abortable instance.
   * This is the abortable's OWN signal, not the parent's.
   * Use this for fetch, timers, etc.
   */
  signal: AbortSignal;

  /**
   * Safe execution utility.
   * Wraps async operations to handle abort gracefully.
   *
   * Includes utilities: `.all()`, `.race()`, `.any()`, `.settled()`, `.callback()`
   */
  safe: SafeFnWithUtils;

  /**
   * Wait for an external event.
   * Returns a Promise that resolves when `send(key, value)` is called.
   *
   * @example
   * ```ts
   * // With typed events
   * const confirmed = await take("confirm");
   *
   * // Checkpoint pattern (TYield = void)
   * await take(); // Waits for send()
   * ```
   */
  take: AbortableTake<TYield>;

  /**
   * Check if this abortable has been aborted.
   */
  aborted(): boolean;

  /**
   * Abort this abortable from inside.
   * Does NOT affect parent signal.
   * @returns false if already aborted
   */
  abort(): boolean;

  /**
   * Check for pause point.
   * Call this between async operations to allow pause/resume.
   * Throws AbortableAbortedError if aborted.
   *
   * @example
   * ```ts
   * const myFn = abortable(async (ctx) => {
   *   const data = await fetchData();
   *   await ctx.checkpoint(); // Allow pause here
   *   const processed = await process(data);
   *   await ctx.checkpoint(); // Allow pause here
   *   return processed;
   * });
   * ```
   */
  checkpoint(): Promise<void>;

  /**
   * Join one or more abortable results.
   * When this abortable is aborted, all joined results are also aborted.
   *
   * @example
   * ```ts
   * // Single result
   * const user = await ctx.join(fetchUser(id));
   *
   * // Multiple results (like Promise.all)
   * const [user, posts, comments] = await ctx.join([
   *   fetchUser(id),
   *   fetchPosts(id),
   *   fetchComments(id),
   * ]);
   * ```
   */
  join: AbortableJoin;
}

// =============================================================================
// ABORTABLE FUNCTION TYPES
// =============================================================================

/**
 * Handler function signature for abortable.
 */
export type AbortableFn<
  TArgs extends any[],
  TResult,
  TYield extends void | object = void
> = (ctx: AbortableContext<TYield>, ...args: TArgs) => Promise<TResult>;

/**
 * Wrapper type for use() method.
 */
export type AbortableWrapper<
  TArgs extends any[],
  TResult,
  TYield extends void | object,
  TNewArgs extends any[] = TArgs,
  TNewResult = TResult,
  TNewYield extends void | object = TYield
> = (
  next: AbortableFn<TArgs, TResult, TYield>
) => AbortableFn<TNewArgs, TNewResult, TNewYield>;

/**
 * Identity wrapper that preserves all input types including TYield.
 */
export type IdentityWrapper = <
  TArgs extends any[],
  TResult,
  TYield extends void | object = void
>(
  next: AbortableFn<TArgs, TResult, TYield>
) => AbortableFn<TArgs, TResult, TYield>;

// =============================================================================
// ABORTABLE INTERFACE
// =============================================================================

/**
 * An abortable function with full lifecycle control.
 *
 * - Direct call: `fn(...args)` - creates new AbortController
 * - With signal: `fn.withSignal(signal, ...args)` - links to parent signal
 * - Chainable: `fn.use(wrapper)` - returns new Abortable with wrapper applied
 *
 * Signal relationship:
 * - Abortable creates its own internal AbortController
 * - When `withSignal(parentSignal)` is called:
 *   - If parent aborts → this abortable aborts
 *   - If this abortable aborts → parent NOT affected
 */
export interface Abortable<
  TArgs extends any[],
  TResult,
  TYield extends void | object = void
> {
  /** Call without signal (creates new AbortController) */
  (...args: TArgs): AbortableResult<TResult, TYield>;

  /**
   * Call with parent signal.
   * Parent abort → this aborts. This abort → parent unaffected.
   */
  withSignal(
    signal: AbortSignal | undefined,
    ...args: TArgs
  ): AbortableResult<TResult, TYield>;

  /**
   * Apply a wrapper and return a new Abortable.
   *
   * @example
   * ```ts
   * const fetchUserWithRetry = fetchUser.use(withRetry(3));
   * ```
   */
  use<
    TNewArgs extends any[] = TArgs,
    TNewResult = TResult,
    TNewYield extends void | object = TYield
  >(
    wrapper: AbortableWrapper<
      TArgs,
      TResult,
      TYield,
      TNewArgs,
      TNewResult,
      TNewYield
    >
  ): Abortable<TNewArgs, TNewResult, TNewYield>;

  /**
   * Type assertion for return type.
   */
  as<
    TNewResult,
    TNewArgs extends any[] = TArgs,
    TNewYield extends void | object = TYield
  >(): Abortable<TNewArgs, TNewResult, TNewYield>;

  /** Type brand for discrimination */
  readonly [abortableSymbol]: true;
}


// =============================================================================
// ERROR TYPES
// =============================================================================

/**
 * Error thrown when abortable is aborted.
 */
export class AbortableAbortedError extends Error {
  readonly name = "AbortableAbortedError";

  constructor(message = "Abortable was aborted") {
    super(message);
  }
}

// =============================================================================
// INTERNAL: PAUSE STATE
// =============================================================================

interface PauseState {
  isPaused: boolean;
  resumeResolve: (() => void) | null;
}

// =============================================================================
// INTERNAL: CREATE CONTEXT
// =============================================================================

interface TakeState {
  pendingTakes: Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: any) => void;
      promise: Promise<any>;
    }
  >;
}

function createAbortableContext<TYield extends void | object>(
  controller: AbortController,
  pauseState: PauseState,
  takeState: TakeState,
  setStatus: (status: AbortableStatus) => void
): AbortableContext<TYield> {
  const signal = controller.signal;

  // Shared checkpoint logic - checks abort and pause
  // Used by: checkpoint(), take() (after event), safe() (after promise)
  const checkPauseAndAbort = async (): Promise<void> => {
    // Check abort before pause
    if (signal.aborted) {
      throw new AbortableAbortedError();
    }

    // Wait if paused
    if (pauseState.isPaused) {
      setStatus("paused");
      await new Promise<void>((resolve) => {
        pauseState.resumeResolve = resolve;
      });
      pauseState.resumeResolve = null;
      setStatus("running");
    }

    // Check abort after resume (might have been aborted while paused)
    if (signal.aborted) {
      throw new AbortableAbortedError();
    }
  };

  // Helper to chain pause/abort check after promise resolution
  const afterCheck = async <T>(value: T): Promise<T> => {
    await checkPauseAndAbort();
    return value;
  };

  // Join function - coordinates multiple abortable results
  // Defined first because safe() uses it for abortable functions
  const join = ((
    resultOrResults: AbortableResult<any, any> | AbortableResult<any, any>[]
  ): Promise<any> => {
    // Check abort before starting
    if (signal.aborted) {
      return Promise.reject(new AbortableAbortedError());
    }

    const isArray = Array.isArray(resultOrResults);
    const results = isArray ? resultOrResults : [resultOrResults];

    // Abort all joined results when this abortable aborts
    const abortAll = () => {
      for (const result of results) {
        result.abort();
      }
    };
    signal.addEventListener("abort", abortAll, { once: true });

    // Wait for all results
    const promise = Promise.all(results)
      .then(async (values) => {
        // Clean up abort listener
        signal.removeEventListener("abort", abortAll);
        // Check pause/abort after all complete
        await checkPauseAndAbort();
        return isArray ? values : values[0];
      })
      .catch(async (error) => {
        // Clean up abort listener
        signal.removeEventListener("abort", abortAll);
        // Abort remaining results on error
        abortAll();
        // Re-throw as AbortableAbortedError if aborted
        if (signal.aborted) {
          throw new AbortableAbortedError();
        }
        throw error;
      });

    return promise;
  }) as AbortableJoin;

  // Enhanced safe() that respects pause
  const baseSafe = createSafe(
    () => signal,
    () => signal.aborted
  );

  const safeFn = async (fnOrPromise: any, ...args: any[]) => {
    // If it's an abortable, use withSignal and join for proper abort propagation
    if (isAbortable(fnOrPromise)) {
      const abortableResult = fnOrPromise.withSignal(signal, ...args);
      return join(abortableResult);
    }

    // Call the base safe for regular functions/promises
    const result = await baseSafe(fnOrPromise, ...args);
    // Check pause/abort after async operation completes
    await checkPauseAndAbort();
    return result;
  };

  // Attach utility methods from baseSafe (.all, .race, .settled, .any, .callback)
  const safe: typeof baseSafe = Object.assign(safeFn, {
    all: baseSafe.all,
    race: baseSafe.race,
    settled: baseSafe.settled,
    any: baseSafe.any,
    callback: baseSafe.callback,
    delay: baseSafe.delay,
  });

  const take = ((key?: keyof TYield) => {
    const takeKey = String(key ?? "__checkpoint__");

    // Check if aborted before waiting
    if (signal.aborted) {
      return Promise.reject(new AbortableAbortedError());
    }

    // Check if already resolved
    const existing = takeState.pendingTakes.get(takeKey);
    if (existing) {
      return existing.promise.then(afterCheck);
    }

    // Create new pending take
    let resolve: (value: any) => void;
    let reject: (error: any) => void;
    const promise = new Promise<any>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    takeState.pendingTakes.set(takeKey, {
      resolve: resolve!,
      reject: reject!,
      promise,
    });
    setStatus("waiting");

    return promise.then(afterCheck);
  }) as AbortableTake<TYield>;

  return {
    signal,
    safe,
    take,
    join,
    aborted: () => signal.aborted,
    abort: () => {
      if (signal.aborted) return false;
      controller.abort();
      return true;
    },
    checkpoint: checkPauseAndAbort,
  };
}

// =============================================================================
// INTERNAL: CREATE SEND
// =============================================================================

function createSend<TYield extends void | object>(
  takeState: TakeState,
  setStatus: (status: AbortableStatus) => void
): AbortableSend<TYield> {
  return ((key?: keyof TYield, value?: any) => {
    const takeKey = String(key ?? "__checkpoint__");
    const pending = takeState.pendingTakes.get(takeKey);

    if (pending) {
      pending.resolve(value);
      takeState.pendingTakes.delete(takeKey);
      setStatus("running");
    }
  }) as AbortableSend<TYield>;
}

// =============================================================================
// INTERNAL: EXECUTE ABORTABLE
// =============================================================================

function executeAbortable<
  TArgs extends any[],
  TResult,
  TYield extends void | object
>(
  fn: AbortableFn<TArgs, TResult, TYield>,
  args: TArgs,
  parentSignal?: AbortSignal
): AbortableResult<TResult, TYield> {
  // Create own AbortController
  const controller = new AbortController();

  // Link to parent signal (parent abort → this aborts, but not vice versa)
  if (parentSignal) {
    if (parentSignal.aborted) {
      controller.abort();
    } else {
      const onParentAbort = () => controller.abort();
      parentSignal.addEventListener("abort", onParentAbort, { once: true });
      // Clean up listener when this completes
      controller.signal.addEventListener(
        "abort",
        () => parentSignal.removeEventListener("abort", onParentAbort),
        { once: true }
      );
    }
  }

  // State
  let status: AbortableStatus = "running";
  let resultValue: TResult | undefined;
  let errorValue: Error | undefined;

  const pauseState: PauseState = {
    isPaused: false,
    resumeResolve: null,
  };

  const takeState: TakeState = {
    pendingTakes: new Map(),
  };

  const setStatus = (newStatus: AbortableStatus) => {
    if (!["success", "error", "aborted"].includes(status)) {
      status = newStatus;
    }
  };

  // Create context
  const ctx = createAbortableContext<TYield>(
    controller,
    pauseState,
    takeState,
    setStatus
  );

  // Wrap the function
  const wrappedFn = async (): Promise<TResult> => {
    try {
      // Check abort before starting
      if (controller.signal.aborted) {
        throw new AbortableAbortedError();
      }

      // Execute the handler
      const result = await fn(ctx, ...args);

      return result;
    } catch (e) {
      // Re-check if this was due to abort
      if (controller.signal.aborted) {
        throw new AbortableAbortedError();
      }
      throw e;
    }
  };

  // Execute and track result
  const promise = wrappedFn()
    .then((result) => {
      status = "success";
      resultValue = result;
      return result;
    })
    .catch((error) => {
      if (error instanceof AbortableAbortedError || controller.signal.aborted) {
        status = "aborted";
        errorValue =
          error instanceof Error ? error : new AbortableAbortedError();
      } else {
        status = "error";
        errorValue = error instanceof Error ? error : new Error(String(error));
      }
      throw errorValue;
    });

  // Create send function
  const send = createSend<TYield>(takeState, setStatus);

  // Attach control methods to promise
  return Object.assign(promise, {
    send,

    // Status checks
    failed: () => status === "error",
    completed: () => ["success", "error", "aborted"].includes(status),
    running: () => status === "running",
    succeeded: () => status === "success",
    paused: () => status === "paused",
    waiting: () => status === "waiting",
    aborted: () => status === "aborted",
    status: () => status,

    // Result access
    result: () => resultValue,
    error: () => errorValue,

    // Control methods
    pause: () => {
      if (
        pauseState.isPaused ||
        ["success", "error", "aborted"].includes(status)
      ) {
        return false;
      }
      pauseState.isPaused = true;
      status = "paused";
      return true;
    },

    resume: () => {
      if (!pauseState.isPaused) {
        return false;
      }
      pauseState.isPaused = false;
      status = "running";
      if (pauseState.resumeResolve) {
        pauseState.resumeResolve();
      }
      return true;
    },

    abort: () => {
      if (controller.signal.aborted || ["success", "error"].includes(status)) {
        return false;
      }
      status = "aborted";
      controller.abort();
      // Reject any pending takes to unblock with abort error
      const abortError = new AbortableAbortedError();
      for (const [, pending] of takeState.pendingTakes) {
        pending.reject(abortError);
      }
      takeState.pendingTakes.clear();
      // Resume if paused
      if (pauseState.resumeResolve) {
        pauseState.resumeResolve();
      }
      return true;
    },
  }) as AbortableResult<TResult, TYield>;
}

// =============================================================================
// MAIN: ABORTABLE FACTORY
// =============================================================================

/**
 * Create an abortable function with full lifecycle control.
 *
 * Features:
 * - Pause/Resume execution
 * - Abort with cleanup
 * - External event injection (take/send)
 * - Status tracking
 * - Parent signal linkage (parent abort → this aborts, not vice versa)
 *
 * @example
 * ```ts
 * // Simple abortable
 * const fetchUser = abortable(async ({ signal, safe }, id: string) => {
 *   const res = await fetch(`/api/users/${id}`, { signal });
 *   return res.json();
 * });
 *
 * // With events
 * const checkout = abortable<[Cart], Receipt, { confirm: boolean }>(
 *   async ({ signal, safe, take }, cart) => {
 *     const validated = await safe(validateCart, cart);
 *
 *     const confirmed = await take("confirm");
 *     if (!confirmed) throw new Error("Cancelled");
 *
 *     return await safe(processPayment, validated);
 *   }
 * );
 *
 * // Usage
 * const result = checkout(cart);
 * result.send("confirm", true);
 * const receipt = await result;
 *
 * // With pause/resume
 * result.pause();
 * result.resume();
 *
 * // With abort
 * result.abort();
 * ```
 */
export function abortable<
  const TArgs extends any[],
  TResult,
  TYield extends void | object = void
>(fn: AbortableFn<TArgs, TResult, TYield>): Abortable<TArgs, TResult, TYield> {
  // Create the wrapper function
  const wrapper = ((...args: TArgs): AbortableResult<TResult, TYield> => {
    return executeAbortable(fn, args);
  }) as Abortable<TArgs, TResult, TYield>;

  // Add withSignal() method for parent signal linkage
  wrapper.withSignal = (
    signal: AbortSignal | undefined,
    ...args: TArgs
  ): AbortableResult<TResult, TYield> => {
    return executeAbortable(fn, args, signal);
  };

  // Add use() method for chainable wrappers
  wrapper.use = <
    TNewArgs extends any[] = TArgs,
    TNewResult = TResult,
    TNewYield extends void | object = TYield
  >(
    wrapperFn: AbortableWrapper<
      TArgs,
      TResult,
      TYield,
      TNewArgs,
      TNewResult,
      TNewYield
    >
  ): Abortable<TNewArgs, TNewResult, TNewYield> => {
    const wrappedHandler = wrapperFn(fn);
    return abortable<TNewArgs, TNewResult, TNewYield>(wrappedHandler);
  };

  // Add as() method for type assertion
  wrapper.as = <
    TNewResult,
    TNewArgs extends any[] = TArgs,
    TNewYield extends void | object = TYield
  >(): Abortable<TNewArgs, TNewResult, TNewYield> => {
    return wrapper as unknown as Abortable<TNewArgs, TNewResult, TNewYield>;
  };

  // Add type brand
  Object.defineProperty(wrapper, abortableSymbol, {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  return wrapper;
}
