/**
 * Async module for Storion
 *
 * Provides utilities for handling async operations (queries/mutations)
 * with built-in cancellation and state management.
 *
 * Two modes:
 * - fresh: data is undefined during loading/error (only show fresh data)
 * - stale: data is preserved during loading/error (stale-while-revalidate)
 *
 * Use wrappers for cross-cutting concerns:
 * ```ts
 * import { retry, catchError, timeout } from "storion/async";
 *
 * const getUser = userService.getUser
 *   .use(retry(3))
 *   .use(catchError(console.error))
 *   .use(timeout(5000));
 * ```
 */

export { async, type AsyncMixinOptions, type AsyncMixinResult } from "./async";
export {
  abortable,
  isAbortable,
  type Abortable,
  type AbortableContext,
  type AbortableWrapper,
  type IdentityWrapper,
} from "./abortable";
export { createSafe, type SafeFn } from "./safe";

// Wrapper utilities
export {
  retry,
  catchError,
  timeout,
  logging,
  debounce,
  throttle,
  fallback,
  cache,
  rateLimit,
  circuitBreaker,
  map,
  type RetryOptions,
  type CacheOptions,
  type RateLimitOptions,
  type CircuitBreakerOptions,
} from "./wrappers";

export {
  AsyncNotReadyError,
  AsyncAggregateError,
  retryStrategy,
  type RetryStrategyName,
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
