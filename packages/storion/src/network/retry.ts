/**
 * Network service for handling online detection and retry logic.
 *
 * This service owns all network-related logic:
 * - Online state detection
 * - Ping verification
 * - Wait for online utility
 * - Offline retry wrapper
 *
 * The networkStore consumes this service to provide reactive state for UI.
 */

import type { Resolver } from "../types";
import type { IdentityWrapper } from "../async";
import { isNetworkError } from "./utils";
import { onlineService, pingService } from "./services";
import { emitter } from "../emitter";

// =============================================================================
// Network Service
// =============================================================================

/**
 * Service for handling network detection and retry logic.
 *
 * Provides:
 * - `isOnline()` - Check current connectivity
 * - `subscribe()` - Listen to online/offline changes
 * - `waitForOnline()` - Promise that resolves when online
 * - `offlineRetry()` - Wrapper for automatic retry on reconnection
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
 *   const usersQuery = async.action(focus("users"), robustFetch);
 *
 *   return { fetchUsers: usersQuery.dispatch };
 * }
 * ```
 */
export const networkService = ({ get }: Resolver) => {
  const { ping } = get(pingService);
  const { isOnline: browserIsOnline, subscribe: browserSubscribe } =
    get(onlineService);

  const onDispose = emitter();
  const onOnlineChange = emitter<boolean>();

  let online = browserIsOnline();

  // Promise for waitForOnline
  let waitPromise: Promise<void> | undefined;
  let waitResolve: (() => void) | undefined;

  // Subscribe to browser online/offline events
  onDispose.on(
    browserSubscribe(async (browserOnline) => {
      if (browserOnline) {
        // Browser says online - verify with ping
        online = await ping();
      } else {
        online = false;
      }

      // Notify subscribers
      onOnlineChange.emit(online);

      // Resolve waiting promise when online
      if (online && waitResolve) {
        waitResolve();
        waitPromise = undefined;
        waitResolve = undefined;
      }
    })
  );

  /**
   * Check if currently online.
   */
  const isOnline = (): boolean => online;

  /**
   * Subscribe to online/offline state changes.
   *
   * @param listener - Called with `true` when online, `false` when offline
   * @returns Unsubscribe function
   *
   * @example
   * ```ts
   * const network = get(networkService);
   * const unsubscribe = network.subscribe((online) => {
   *   console.log(online ? 'Connected' : 'Disconnected');
   * });
   * ```
   */
  const subscribe = onOnlineChange.on;

  /**
   * Returns a promise that resolves when online.
   * If already online, resolves immediately.
   *
   * @example
   * ```ts
   * const network = get(networkService);
   *
   * // Wait before making request
   * await network.waitForOnline();
   * await fetch('/api/data');
   *
   * // Use with async retry
   * async.action(focus('data'), handler, {
   *   retry: () => network.waitForOnline(),
   * });
   * ```
   */
  const waitForOnline = (): Promise<void> => {
    if (online) return Promise.resolve();

    if (!waitPromise) {
      waitPromise = new Promise((resolve) => {
        waitResolve = resolve;
      });
    }

    return waitPromise;
  };

  /**
   * AbortableWrapper that retries on network reconnection.
   *
   * When a network error occurs while offline:
   * 1. Waits for network to reconnect
   * 2. Retries the operation once
   *
   * If the error is not a network error, or device is online, throws immediately.
   *
   * @example
   * ```ts
   * const network = get(networkService);
   *
   * // Basic usage
   * const robustFetch = fetchUsers.use(network.offlineRetry());
   *
   * // Combined with retry (recommended order)
   * const robustFetch = fetchUsers
   *   .use(retry(3))              // Retry transient errors
   *   .use(network.offlineRetry()); // Wait for network on network errors
   * ```
   */
  const offlineRetry = (): IdentityWrapper => {
    return (next) =>
      async (ctx, ...args) => {
        try {
          return await next(ctx, ...args);
        } catch (error) {
          // Only handle network errors when offline
          if (isNetworkError(error) && !online) {
            await waitForOnline();
            return next(ctx, ...args);
          }
          throw error;
        }
      };
  };

  /**
   * Cleanup subscriptions.
   */
  const dispose = (): void => {
    onDispose.emitAndClear();
  };

  return {
    isOnline,
    subscribe,
    waitForOnline,
    offlineRetry,
    dispose,
  };
};

/**
 * Type of the network service instance.
 */
export type NetworkService = ReturnType<typeof networkService>;
