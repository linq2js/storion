// ===== Async Mode =====

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
}

// ===== Handler Type =====

/**
 * Async handler function signature.
 * Receives AsyncContext as first arg, then user-defined args.
 */
export type AsyncHandler<T, TArgs extends any[]> = (
  context: AsyncContext,
  ...args: TArgs
) => T | Promise<T>;

// ===== Retry Options =====

export interface AsyncRetryOptions {
  /** Number of retry attempts */
  count: number;
  /** Delay between retries (ms) or function returning delay */
  delay?: number | ((attempt: number, error: Error) => number);
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

// ===== Async Actions API =====

/**
 * API returned from async() mixin.
 */
export interface AsyncActions<T, TArgs extends any[]> {
  /** Dispatch the async operation */
  dispatch(...args: TArgs): CancellablePromise<T>;
  /** Re-dispatch with last args */
  refresh(): CancellablePromise<T>;
  /** Cancel ongoing operation */
  cancel(): void;
  /** Reset to idle state */
  reset(): void;
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
