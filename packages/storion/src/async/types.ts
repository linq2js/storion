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
   * Wrap a promise to never resolve if the async operation is cancelled.
   * Useful for nested async operations that should be cancelled together.
   *
   * @example
   * async(focus, async (ctx) => {
   *   const data1 = await ctx.safe(fetch('/api/1'));
   *   const data2 = await ctx.safe(fetch('/api/2'));
   *   return { data1, data2 };
   * });
   */
  safe<T>(promise: Promise<T>): Promise<T>;

  /**
   * Wrap a callback to not run if the async operation is cancelled.
   * Useful for event handlers and timeouts.
   *
   * @example
   * async(focus, async (ctx) => {
   *   setTimeout(ctx.safe(() => {
   *     // Only runs if not cancelled
   *     doSomething();
   *   }), 1000);
   * });
   */
  safe<TArgs extends unknown[], TReturn>(
    callback: (...args: TArgs) => TReturn
  ): (...args: TArgs) => TReturn | undefined;

  /**
   * Cancel the current async operation.
   * Useful for implementing timeouts.
   *
   * @example
   * async(focus, async (ctx) => {
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

export interface AsyncRetryOptions {
  /** Number of retry attempts */
  count: number;
  /** Delay between retries (ms) or function returning delay */
  delay?: number | ((attempt: number, error: Error) => number | Promise<void>);
}

// ===== Mixin Options =====

/**
 * Options for async mixin setup.
 */
export interface AsyncOptions {
  /** Error callback */
  onError?: (error: Error) => void;
  /** Retry configuration */
  retry?: number | AsyncRetryOptions;
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
 * API returned from async() mixin.
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
