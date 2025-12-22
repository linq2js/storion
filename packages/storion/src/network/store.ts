/**
 * Reactive network state store.
 */

import { store } from "../core/store";
import { pingService, onlineService } from "./services";

/**
 * Reactive network state store.
 *
 * Consumes `onlineService` and `pingService` to provide:
 * - `state.online`: reactive boolean for current connectivity
 * - `actions.waitForOnline()`: promise that resolves when online
 *
 * @example
 * ```ts
 * // Check current status
 * const [network] = get(networkStore);
 * if (network.online) { ... }
 *
 * // Wait for connectivity in retry
 * async(focus('data'), handler, {
 *   retry: () => actions.waitForOnline(),
 * });
 *
 * // React component
 * function NetworkIndicator() {
 *   const { online } = useStore(({ get }) => {
 *     const [state] = get(networkStore);
 *     return { online: state.online };
 *   });
 *   return online ? '🟢 Online' : '🔴 Offline';
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
    // Get services (factories return instance directly, not tuple)
    const online = get(onlineService);
    const pingSvc = get(pingService);

    // Promise for waitForOnline
    let currentPromise: Promise<void> | undefined;
    let currentResolve: (() => void) | undefined;

    // Initialize with current status
    state.online = online.isOnline();

    // Subscribe to online/offline events
    onDispose(
      online.subscribe(async (browserOnline: boolean) => {
        if (browserOnline) {
          // Verify with ping when browser says online
          state.online = await pingSvc.ping();
        } else {
          state.online = false;
        }

        // Resolve waiting promise when online
        if (state.online && currentResolve) {
          currentResolve();
          currentPromise = undefined;
          currentResolve = undefined;
        }
      })
    );

    /**
     * Returns a promise that resolves when online.
     * If already online, resolves immediately.
     *
     * Useful with async retry:
     * ```ts
     * async(focus('data'), handler, {
     *   retry: () => actions.waitForOnline(),
     * });
     * ```
     */
    const waitForOnline = (): Promise<void> => {
      if (state.online) return Promise.resolve();

      if (!currentPromise) {
        currentPromise = new Promise((resolve) => {
          currentResolve = resolve;
        });
      }

      return currentPromise;
    };

    return {
      waitForOnline,
    };
  },
});

