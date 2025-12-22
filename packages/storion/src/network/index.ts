/**
 * Network connectivity module.
 *
 * Provides platform-agnostic network state management:
 * - `networkStore` - Reactive store with `online` state and `waitForOnline()` action
 * - `onlineService` - Customizable online/offline event subscription
 * - `pingService` - Customizable network reachability check
 * - `networkRetryService` - Wrap functions to wait for network reconnection on errors
 *
 * @example
 * ```ts
 * import { networkStore, networkRetryService, pingService, onlineService } from 'storion/network';
 *
 * // Use in React
 * const { online } = useStore(({ get }) => {
 *   const [state] = get(networkStore);
 *   return { online: state.online };
 * });
 *
 * // Use with async retry
 * async(focus('data'), handler, {
 *   retry: () => actions.waitForOnline(),
 * });
 *
 * // Wrap functions to retry on network reconnection
 * const networkRetry = get(networkRetryService);
 * const api = networkRetry.wrap({
 *   getUser: (id: string) => fetch(`/api/users/${id}`).then(r => r.json()),
 *   getPosts: () => fetch('/api/posts').then(r => r.json()),
 * });
 *
 * // Or call directly
 * const data = await networkRetry.call(fetch, '/api/data');
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

// Retry service
export { networkRetryService, type NetworkRetryService } from "./retry";
