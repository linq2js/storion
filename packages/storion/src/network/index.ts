/**
 * Network connectivity module.
 *
 * Provides platform-agnostic network state management:
 * - `networkStore` - Reactive store with `online` state and `waitForOnline()` action
 * - `networkService` - Provides `offlineRetry()` wrapper for retry on reconnection
 * - `onlineService` - Customizable online/offline event subscription
 * - `pingService` - Customizable network reachability check
 *
 * @example
 * ```ts
 * import { networkStore, networkService } from 'storion/network';
 * import { abortable, retry } from 'storion/async';
 *
 * // Use in React
 * const { online } = useStore(({ get }) => {
 *   const [state] = get(networkStore);
 *   return { online: state.online };
 * });
 *
 * // Use with async retry
 * const network = get(networkService);
 * const fetchUsers = abortable(async ({ signal }) => {
 *   const res = await fetch('/api/users', { signal });
 *   return res.json();
 * });
 *
 * // Chain wrappers: retry 3 times, then wait for network
 * const robustFetch = fetchUsers
 *   .use(retry(3))
 *   .use(network.offlineRetry());
 *
 * // Override for React Native
 * container.set(onlineService, () => ({
 *   isOnline: () => true,
 *   subscribe: (listener) => NetInfo.addEventListener(s => listener(!!s.isConnected)),
 * }));
 *
 * // Override for real connectivity check
 * container.set(pingService, () => ({
 *   ping: async () => {
 *     try {
 *       await fetch('/api/health', { method: 'HEAD' });
 *       return true;
 *     } catch { return false; }
 *   },
 * }));
 * ```
 */

// Services
export {
  pingService,
  onlineService,
  type PingService,
  type OnlineService,
} from "./services";

// Store
export { networkStore } from "./store";

// Utils
export { isNetworkError } from "./utils";

// Network service
export { networkService, type NetworkService } from "./retry";
