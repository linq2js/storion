/**
 * Async module for Storion
 *
 * Provides utilities for handling async operations (queries/mutations)
 * with built-in cancellation, retry, and state management.
 *
 * Two modes:
 * - fresh: data is undefined during loading/error (only show fresh data)
 * - stale: data is preserved during loading/error (stale-while-revalidate)
 */

export {
  async,
  asyncState,
  asyncStateFrom,
  getPendingPromise,
  type AsyncMixinOptions,
  type AsyncMixinResult,
} from "./async";
export {
  AsyncNotReadyError,
  AsyncAggregateError,
  type AsyncMode,
  type AsyncState,
  type AsyncIdleState,
  type AsyncIdleStateFresh,
  type AsyncIdleStateStale,
  type AsyncPendingState,
  type AsyncPendingStateFresh,
  type AsyncPendingStateStale,
  type AsyncSuccessState,
  type AsyncErrorState,
  type AsyncErrorStateFresh,
  type AsyncErrorStateStale,
  type AsyncStatus,
  type AsyncContext,
  type AsyncHandler,
  type AsyncOptions,
  type AsyncRetryOptions,
  type AsyncActions,
  type AsyncLastInvocation,
  type CancellablePromise,
  type InferAsyncData,
  type InferAsyncMode,
  type SettledResult,
  type MapAsyncData,
  type MapSettledResult,
  type RaceResult,
  type AsyncKey,
  type SerializedAsyncState,
} from "./types";
