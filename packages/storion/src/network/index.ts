/**
 * Network connectivity module.
 *
 * Provides platform-agnostic network state management:
 * - `networkStore` - Reactive store with `online` state for React components
 * - `networkService` - Provides `isOnline()`, `waitForOnline()`, and `offlineRetry()` wrapper
 * - `onlineService` - Customizable online/offline event subscription
 * - `pingService` - Customizable network reachability check
 *
 * @example
 * ```ts
 * import { networkStore, networkService } from 'storion/network';
 * import { abortable, retry } from 'storion/async';
 *
 * // React component - use store for reactive state
 * function NetworkBanner() {
 *   const { online } = useStore(({ get }) => {
 *     const [state] = get(networkStore);
 *     return { online: state.online };
 *   });
 *   return online ? null : <div>You are offline</div>;
 * }
 *
 * // In store setup - use service for logic
 * setup({ get, focus }) {
 *   const network = get(networkService);
 *
 *   const fetchUsers = abortable(async ({ signal }) => {
 *     const res = await fetch('/api/users', { signal });
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
 *
 * // Wait for connectivity
 * const network = get(networkService);
 * await network.waitForOnline();
 * await uploadData();
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
