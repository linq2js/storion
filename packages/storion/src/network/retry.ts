/**
 * Network service for handling offline retry logic.
 */

import type { Factory } from "../types";
import type { IdentityWrapper } from "../async";
import { networkStore } from "./store";
import { isNetworkError } from "./utils";

// =============================================================================
// Network Service
// =============================================================================

export interface NetworkService {
  /**
   * AbortableWrapper that retries on network reconnection.
   * If a network error occurs while offline, waits for reconnection and retries once.
   *
   * @example
   * ```ts
   * const network = get(networkService);
   *
   * const robustFetch = fetchUsers.use(network.offlineRetry());
   * ```
   */
  offlineRetry(): IdentityWrapper;
}

/**
 * Service for handling network-aware retry logic.
 *
 * Use `offlineRetry()` to automatically retry operations when network reconnects.
 *
 * @example
 * ```ts
 * import { abortable, retry } from "storion/async";
 * import { networkService } from "storion/network";
 *
 * setup({ get, focus }) {
 *   const network = get(networkService);
 *
 *   const fetchUsers = abortable(async ({ signal }) => {
 *     const res = await fetch("/api/users", { signal });
 *     return res.json();
 *   });
 *
 *   // Chain wrappers: retry 3 times, then wait for network
 *   const robustFetch = fetchUsers
 *     .use(retry(3))
 *     .use(network.offlineRetry());
 *
 *   const usersQuery = async(focus("users"), robustFetch);
 *
 *   return { fetchUsers: usersQuery.dispatch };
 * }
 * ```
 */
export const networkService: Factory<NetworkService> = (resolver) => {
  const instance = resolver.get(networkStore);
  const networkState = instance.state;
  const waitForOnline = instance.actions.waitForOnline;

  return {
    offlineRetry(): IdentityWrapper {
      return (next) =>
        async (ctx, ...args) => {
          try {
            return await next(ctx, ...args);
          } catch (error) {
            // If network error and offline, wait for reconnect then retry once
            if (isNetworkError(error) && !networkState.online) {
              await waitForOnline();
              return next(ctx, ...args);
            }
            throw error;
          }
        };
    },
  };
};
