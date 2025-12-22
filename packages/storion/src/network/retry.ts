/**
 * Network retry service for wrapping functions with network-aware retry logic.
 */

import type { Factory } from "../types";
import { AsyncRetryDelayFn, retryStrategy, RetryStrategyName } from "../async";
import { networkStore } from "./store";
import { isNetworkError } from "./utils";

// =============================================================================
// Types
// =============================================================================

type AsyncFn<TArgs extends any[] = any[], TReturn = any> = (
  ...args: TArgs
) => Promise<TReturn>;

type AsyncFnMap = Record<string, AsyncFn>;

type WrappedFnMap<T extends AsyncFnMap> = {
  [K in keyof T]: T[K];
};

// =============================================================================
// Network Retry Service
// =============================================================================

export interface NetworkRetryService {
  /**
   * Wrap a single function to retry on network reconnection.
   *
   * @example
   * const fetchWithRetry = wrap((url: string) => fetch(url).then(r => r.json()));
   * const data = await fetchWithRetry('/api/data');
   */
  wrap<TArgs extends any[], TReturn>(
    fn: AsyncFn<TArgs, TReturn>
  ): AsyncFn<TArgs, TReturn>;

  /**
   * Wrap multiple functions to retry on network reconnection.
   *
   * @example
   * const api = wrap({
   *   getUser: (id: string) => fetch(`/api/users/${id}`).then(r => r.json()),
   *   getPosts: () => fetch('/api/posts').then(r => r.json()),
   * });
   * const user = await api.getUser('123');
   * const posts = await api.getPosts();
   */
  wrap<TMap extends AsyncFnMap>(map: TMap): WrappedFnMap<TMap>;

  /**
   * Call a function immediately with network retry.
   * If network error occurs while offline, waits for reconnection and retries.
   *
   * @example
   * const data = await call(fetch, '/api/data').then(r => r.json());
   */
  call<TArgs extends any[], TReturn>(
    fn: AsyncFn<TArgs, TReturn>,
    ...args: TArgs
  ): Promise<TReturn>;

  /**
   * Get a delay function that waits for network reconnection on network errors.
   * @param strategy - The retry strategy to use. (backoff, linear, fixed, fibonacci, immediate) or a custom delay function.
   * @returns A delay function that waits for network reconnection on network errors.
   */
  delay(strategy?: RetryStrategyName | AsyncRetryDelayFn): AsyncRetryDelayFn;

  /**
   * Wait for network reconnection if the error is a network error and the network is offline.
   * @param error - The error to check.
   */
  waitIfOffline(error: unknown): Promise<void>;
}

/**
 * Service that wraps functions to wait for network reconnection on network errors.
 *
 * Does NOT handle retry count or delay strategy - that's for async() retry option.
 * This service only handles waiting for network reconnection.
 *
 * @example
 * ```ts
 * setup({ get, focus }) {
 *   const networkRetry = get(networkRetryService);
 *
 *   // Wrap API calls
 *   const api = networkRetry.wrap({
 *     getUser: (id: string) => fetch(`/api/users/${id}`).then(r => r.json()),
 *     getPosts: () => fetch('/api/posts').then(r => r.json()),
 *   });
 *
 *   // Use with async() for full retry strategy
 *   const userAsync = async(focus("user"), api.getUser, {
 *     retry: retryStrategy.backoff,
 *   });
 *
 *   // Or call directly
 *   return {
 *     quickFetch: (url: string) => networkRetry.call(fetch, url),
 *   };
 * }
 * ```
 */
export const networkRetryService: Factory<NetworkRetryService> = (resolver) => {
  const instance = resolver.get(networkStore);
  const networkState = instance.state;
  const waitForOnline = instance.actions.waitForOnline;

  function wrapSingle<TArgs extends any[], TReturn>(
    fn: AsyncFn<TArgs, TReturn>
  ): AsyncFn<TArgs, TReturn> {
    return async (...args: TArgs): Promise<TReturn> => {
      try {
        return await fn(...args);
      } catch (error) {
        // If network error and offline, wait for reconnect then retry once
        if (isNetworkError(error) && !networkState.online) {
          await waitForOnline();
          return fn(...args);
        }
        throw error;
      }
    };
  }

  function wrapMap<T extends AsyncFnMap>(fns: T): WrappedFnMap<T> {
    const wrapped = {} as WrappedFnMap<T>;
    for (const key in fns) {
      if (Object.prototype.hasOwnProperty.call(fns, key)) {
        wrapped[key] = wrapSingle(fns[key]) as T[typeof key];
      }
    }
    return wrapped;
  }

  /**
   * Wrap a single function to retry on network reconnection.
   *
   * @example
   * const fetchWithRetry = wrap((url: string) => fetch(url).then(r => r.json()));
   * const data = await fetchWithRetry('/api/data');
   */
  function wrap<TArgs extends any[], TReturn>(
    fn: AsyncFn<TArgs, TReturn>
  ): AsyncFn<TArgs, TReturn>;
  /**
   * Wrap multiple functions to retry on network reconnection.
   *
   * @example
   * const api = wrap({
   *   getUser: (id: string) => fetch(`/api/users/${id}`).then(r => r.json()),
   *   getPosts: () => fetch('/api/posts').then(r => r.json()),
   * });
   * const user = await api.getUser('123');
   */
  function wrap<TMap extends AsyncFnMap>(map: TMap): WrappedFnMap<TMap>;
  function wrap<TArgs extends any[], TReturn, T extends AsyncFnMap>(
    fnOrMap: AsyncFn<TArgs, TReturn> | T
  ): AsyncFn<TArgs, TReturn> | WrappedFnMap<T> {
    if (typeof fnOrMap === "function") {
      return wrapSingle(fnOrMap as AsyncFn<TArgs, TReturn>);
    }
    return wrapMap(fnOrMap as T);
  }

  /**
   * Wait for network reconnection if the error is a network error and the network is offline.
   * @param error - The error to check.
   * @returns
   */
  async function waitIfOffline(error: unknown) {
    if (isNetworkError(error) && !networkState.online) {
      await waitForOnline();
    }
  }

  return {
    /**
     * Wrap a single function or multiple functions to retry on network reconnection.
     *
     * @example
     * const fetchWithRetry = wrap((url: string) => fetch(url).then(r => r.json()));
     * const data = await fetchWithRetry('/api/data');
     *
     * const api = wrap({
     *   getUser: (id: string) => fetch(`/api/users/${id}`).then(r => r.json()),
     *   getPosts: () => fetch('/api/posts').then(r => r.json()),
     * });
     * const user = await api.getUser('123');
     * const posts = await api.getPosts();
     */
    wrap,
    /**
     * Call a function immediately with network retry.
     * If network error occurs while offline, waits for reconnection and retries.
     *
     * @example
     * const data = await call(fetch, '/api/data').then(r => r.json());
     */
    call<TArgs extends any[], TReturn>(
      fn: AsyncFn<TArgs, TReturn>,
      ...args: TArgs
    ): Promise<TReturn> {
      return wrapSingle(fn)(...args);
    },
    /**
     * Get a delay function that waits for network reconnection on network errors.
     * @param strategy - The retry strategy to use. (backoff, linear, fixed, fibonacci, immediate) or a custom delay function.
     * @returns A delay function that waits for network reconnection on network errors.
     */
    delay(
      strategy: RetryStrategyName | AsyncRetryDelayFn = "backoff"
    ): AsyncRetryDelayFn {
      const strategyFn =
        typeof strategy === "function" ? strategy : retryStrategy[strategy];

      return (attempt, error) => {
        if (isNetworkError(error) && !networkState.online) {
          return waitForOnline();
        }
        return strategyFn(attempt, error);
      };
    },
    waitIfOffline,
  };
};
