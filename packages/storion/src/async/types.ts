// ===== Async Mode =====

import { ActionsBase, StateBase, StoreSpec, StoreTuple } from "../types";

/**
 * Async data mode:
 * - "fresh": data is undefined during loading/error (only show fresh data)
 * - "stale": data is preserved during loading/error (stale-while-revalidate)
 */
export type AsyncMode = "fresh" | "stale";

// ===== Async State Types =====

export type AsyncStatus = "idle" | "pending" | "success" | "error";

/**
 * Serialized async state for persistence/hydration.
 * Only success states are persisted.
 */
export type SerializedAsyncState<T = unknown> = {
  status: "success";
  mode: AsyncMode;
  data: T;
} | null;

/**
 * Async state with mode support.
 * - Fresh mode: data is undefined during idle/pending/error
 * - Stale mode: data is preserved (T) during pending/error after first load
 */
export type AsyncState<T = unknown, M extends AsyncMode = AsyncMode> =
  | AsyncIdleState<T, M>
  | AsyncPendingState<T, M>
  | AsyncSuccessState<T>
  | AsyncErrorState<T, M>;

// Fresh mode states
export interface AsyncIdleStateFresh {
  status: "idle";
  mode: "fresh";
  data: undefined;
  error: undefined;
  timestamp: undefined;
  /** @internal Request ID for concurrency control */
  __requestId?: AsyncRequestId;
  toJSON?(): SerializedAsyncState<undefined>;
}

export interface AsyncPendingStateFresh<T = unknown> {
  status: "pending";
  mode: "fresh";
  data: undefined;
  error: undefined;
  timestamp: undefined;
  /** @internal Key for Suspense promise tracking */
  __key?: AsyncKey<T>;
  /** @internal Request ID for concurrency control */
  __requestId?: AsyncRequestId;
  toJSON?(): SerializedAsyncState<T>;
}

export interface AsyncErrorStateFresh {
  status: "error";
  mode: "fresh";
  data: undefined;
  error: Error;
  timestamp: undefined;
  /** @internal Request ID for concurrency control */
  __requestId?: AsyncRequestId;
  toJSON?(): SerializedAsyncState<undefined>;
}

// Stale mode states
export interface AsyncIdleStateStale<T = unknown> {
  status: "idle";
  mode: "stale";
  data: T;
  error: undefined;
  timestamp: undefined;
  /** @internal Request ID for concurrency control */
  __requestId?: AsyncRequestId;
  toJSON?(): SerializedAsyncState<T>;
}

export interface AsyncPendingStateStale<T = unknown> {
  status: "pending";
  mode: "stale";
  data: T;
  error: undefined;
  timestamp: undefined;
  /** @internal Key for Suspense promise tracking */
  __key?: AsyncKey<T>;
  /** @internal Request ID for concurrency control */
  __requestId?: AsyncRequestId;
  toJSON?(): SerializedAsyncState<T>;
}

export interface AsyncErrorStateStale<T = unknown> {
  status: "error";
  mode: "stale";
  data: T;
  error: Error;
  timestamp: undefined;
  /** @internal Request ID for concurrency control */
  __requestId?: AsyncRequestId;
  toJSON?(): SerializedAsyncState<T>;
}

// Union types for each status
export type AsyncIdleState<
  T = unknown,
  M extends AsyncMode = AsyncMode
> = M extends "fresh"
  ? AsyncIdleStateFresh
  : M extends "stale"
  ? AsyncIdleStateStale<T>
  : AsyncIdleStateFresh | AsyncIdleStateStale<T>;

export type AsyncPendingState<
  T = unknown,
  M extends AsyncMode = AsyncMode
> = M extends "fresh"
  ? AsyncPendingStateFresh<T>
  : M extends "stale"
  ? AsyncPendingStateStale<T>
  : AsyncPendingStateFresh<T> | AsyncPendingStateStale<T>;

export interface AsyncSuccessState<T = unknown> {
  status: "success";
  mode: "fresh" | "stale";
  data: T;
  error: undefined;
  timestamp: number;
  /** @internal Request ID for concurrency control */
  __requestId?: AsyncRequestId;
  toJSON?(): SerializedAsyncState<T>;
}

export type AsyncErrorState<
  T = unknown,
  M extends AsyncMode = AsyncMode
> = M extends "fresh"
  ? AsyncErrorStateFresh
  : M extends "stale"
  ? AsyncErrorStateStale<T>
  : AsyncErrorStateFresh | AsyncErrorStateStale<T>;

/**
 * Opaque key type for linking state to pending promise.
 * Used internally for React Suspense support.
 */
export type AsyncKey<T = unknown> = object & { __brand?: T };

/**
 * Request ID for detecting external state modifications.
 * Used to prevent stale async updates from overwriting rolled-back state.
 */
export type AsyncRequestId = object;

// ===== AsyncContext for Handler =====

/**
 * Context passed to async handlers.
 */
export interface AsyncContext {
  /** AbortSignal for cancellation */
  signal: AbortSignal;

  /**
   * Safely execute operations that should be cancelled together.
   *
   * Overloads:
   * 1. `safe(promise)` - Wrap promise, never resolve/reject if cancelled
   * 2. `safe(fn, ...args)` - Call function, wrap result if promise
   * 3. `safe(Abortable, ...args)` - Call with signal, wrap result if promise
   *
   * @example
   * ```ts
   * // Wrap a promise
   * const data = await ctx.safe(fetch('/api/data'));
   *
   * // Call a normal function
   * const result = await ctx.safe(myAsyncFn, arg1, arg2);
   *
   * // Call an abortable function (auto-injects signal)
   * const user = await ctx.safe(getUser, userId);
   * ```
   */
  safe<T>(promise: Promise<T>): Promise<T>;
  safe<TArgs extends any[], TResult>(
    fn: (...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult extends Promise<infer U> ? Promise<U> : TResult;

  /**
   * Cancel the current async operation.
   * Useful for implementing timeouts.
   *
   * @example
   * async.action(focus, async (ctx) => {
   *   // Timeout after 5 seconds
   *   setTimeout(ctx.cancel, 5000);
   *
   *   const data = await ctx.safe(fetch('/api/slow'));
   *   return data;
   * });
   */
  cancel(): void;

  /**
   * Get another store's state and actions.
   *
   * @example
   * // Array destructuring
   * const [state, actions] = get(counterSpec);
   *
   * // Named properties
   * const tuple = get(counterSpec);
   * tuple.state.count;
   */
  get<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreTuple<S, A>;

  /**
   * Get a service or factory instance.
   *
   * @example
   * const db = get(() => new IndexedDBService());
   * await db.users.getAll();
   */
  get<T>(factory: (...args: any[]) => T): T;
}

// ===== Handler Type =====

/**
 * Async handler function signature.
 * Receives AsyncContext as first arg, then user-defined args.
 */
export type AsyncHandler<T, TArgs extends any[]> = (
  context: AsyncContext,
  ...args: TArgs
) => T | PromiseLike<T>;

// ===== Retry Options =====

/**
 * Built-in retry delay strategies.
 */
export const retryStrategy = {
  /** Exponential backoff: 1s, 2s, 4s, 8s... (max 30s) */
  backoff: (attempt: number) => Math.min(1000 * 2 ** attempt, 30000),

  /** Linear: 1s, 2s, 3s, 4s... (max 30s) */
  linear: (attempt: number) => Math.min(1000 * (attempt + 1), 30000),

  /** Fixed 1 second delay */
  fixed: () => 1000,

  /** Fibonacci: 1s, 1s, 2s, 3s, 5s, 8s... (max 30s) */
  fibonacci: (attempt: number) => {
    const fib = [1, 1, 2, 3, 5, 8, 13, 21, 30];
    return Math.min(fib[attempt] ?? 30, 30) * 1000;
  },

  /** Immediate retry (no delay) */
  immediate: () => 0,

  /** Add jitter (±30%) to any strategy */
  withJitter: (strategy: (n: number) => number) => (attempt: number) => {
    const base = strategy(attempt);
    const jitter = base * 0.3 * (Math.random() * 2 - 1); // ±30%
    return Math.max(0, Math.round(base + jitter));
  },
} as const;

/** Built-in retry strategy names */
export type RetryStrategyName = Exclude<
  keyof typeof retryStrategy,
  "withJitter"
>;

export type AsyncRetryDelayFn = (
  attempt: number,
  error: Error
) => number | Promise<void>;

export type AsyncRetryDelay = number | AsyncRetryDelayFn;

export interface AsyncRetryOptions {
  /** Number of retry attempts */
  count: number;
  /** Delay between retries: ms, strategy name, or custom function */
  delay?: AsyncRetryDelay | RetryStrategyName;
}

// ===== Mixin Options =====

/**
 * Options for async state management.
 *
 * For retry, error handling, and other cross-cutting concerns,
 * use the `use()` pattern with wrapper utilities:
 *
 * ```ts
 * import { retry, catchError } from "storion/async";
 *
 * const userQuery = async.action(
 *   focus("user"),
 *   userService.getUser.use(retry(3)).use(catchError(console.error))
 * );
 * ```
 */
export interface AsyncOptions {
  /** Auto-cancel previous request on new dispatch (default: true) */
  autoCancel?: boolean;
}

// ===== Cancellable Promise =====

export type CancellablePromise<T> = Promise<T> & {
  cancel(): void;
};

// ===== Async Last Invocation =====

/**
 * Last invocation info for async action (for typing asyncAction.last())
 */
export interface AsyncLastInvocation<
  T,
  M extends AsyncMode,
  TArgs extends any[]
> {
  /** Arguments passed to the last dispatch */
  readonly args: TArgs;
  /** Invocation count (1-indexed) */
  readonly nth: number;
  /** Current async state (reactive) */
  readonly state: AsyncState<T, M>;
}

// ===== Async Actions API =====

/**
 * API returned from async.action() or async.mixin().
 */
export interface AsyncActions<T, M extends AsyncMode, TArgs extends any[]> {
  /** Dispatch the async operation */
  dispatch(...args: TArgs): CancellablePromise<T>;
  /** Re-dispatch with last args. Returns undefined if no previous dispatch. */
  refresh(): CancellablePromise<T> | undefined;
  /** Cancel ongoing operation */
  cancel(): void;
  /** Reset to idle state */
  reset(): void;
  /**
   * Get the last invocation info including current async state.
   * Reactive - reads from the async state, triggers re-render when state changes.
   *
   * @returns Last invocation info with state, or undefined if never dispatched
   */
  last(): AsyncLastInvocation<T, M, TArgs> | undefined;
}

// ===== Type Utilities =====

/**
 * Infer the data type from an AsyncState
 */
export type InferAsyncData<T> = T extends AsyncState<infer D, any> ? D : never;

/**
 * Infer the mode from an AsyncState
 */
export type InferAsyncMode<T> = T extends AsyncState<any, infer M> ? M : never;

/**
 * Settled result for a single async state
 */
export type SettledResult<T, M extends AsyncMode = AsyncMode> =
  | { status: "success"; data: T }
  | (M extends "stale"
      ? { status: "error"; error: Error; data: T }
      : { status: "error"; error: Error; data: undefined })
  | (M extends "stale"
      ? { status: "pending"; data: T }
      : { status: "pending"; data: undefined })
  | (M extends "stale"
      ? { status: "idle"; data: T }
      : { status: "idle"; data: undefined });

/**
 * Map a tuple of AsyncState to their data types
 */
export type MapAsyncData<T extends readonly AsyncState<any, any>[]> = {
  -readonly [K in keyof T]: InferAsyncData<T[K]>;
};

/**
 * Map a tuple of AsyncState to SettledResult
 */
export type MapSettledResult<T extends readonly AsyncState<any, any>[]> = {
  -readonly [K in keyof T]: SettledResult<
    InferAsyncData<T[K]>,
    InferAsyncMode<T[K]>
  >;
};

/**
 * Race result type - tuple of [key, value]
 */
export type RaceResult<T extends Record<string, AsyncState<any, any>>> = {
  [K in keyof T]: [K, InferAsyncData<T[K]>];
}[keyof T];

// ===== Error Classes =====

export class AsyncNotReadyError extends Error {
  constructor(message: string, public readonly status: AsyncStatus) {
    super(message);
    this.name = "AsyncNotReadyError";
  }
}

export class AsyncAggregateError extends Error {
  constructor(message: string, public readonly errors: Error[]) {
    super(message);
    this.name = "AsyncAggregateError";
  }
}

export interface PromiseWithState<T> extends PromiseLike<T> {
  state: NoInfer<PromiseState<T>>;
}

export interface PromiseState<T = any> {
  status: "pending" | "fulfilled" | "rejected";
  resolved: T | undefined;
  rejected: any;
}
