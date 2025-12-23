/**
 * Reactive network state store.
 *
 * This store consumes `networkService` to provide reactive state for React components.
 * The actual logic lives in `networkService` - this store only syncs the state.
 */

import { store } from "../core/store";
import { networkService } from "./retry";

/**
 * Reactive network state store.
 *
 * Provides reactive `state.online` for UI components.
 * For logic (waitForOnline, offlineRetry), use `networkService` directly.
 *
 * @example
 * ```ts
 * // React component - use store for reactive state
 * function NetworkIndicator() {
 *   const { online } = useStore(({ get }) => {
 *     const [state] = get(networkStore);
 *     return { online: state.online };
 *   });
 *   return online ? '🟢 Online' : '🔴 Offline';
 * }
 *
 * // In store setup - use service for logic
 * setup({ get, focus }) {
 *   const network = get(networkService);
 *   await network.waitForOnline();
 *   const robustFetch = fetchUsers.use(network.offlineRetry());
 * }
 * ```
 */
export const networkStore = store({
  name: "network",
  state: {
    /** Whether the network is currently online */
    online: true,
  },
  setup({ state, get, onDispose }) {
    // Get the network service (owns the logic)
    const network = get(networkService);

    // Initialize with current status from service
    state.online = network.isOnline();

    // Sync state when service detects changes
    onDispose(
      network.subscribe((online: boolean) => {
        state.online = online;
      })
    );

    // No actions needed - use networkService directly for logic
    return {};
  },
});
