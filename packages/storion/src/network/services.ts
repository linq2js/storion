/**
 * Network services for platform-agnostic online detection.
 */

import type { Factory } from "../types";
import { async } from "../async";

// =============================================================================
// Types
// =============================================================================

export interface PingService {
  /**
   * Check if the network is reachable.
   * Default: 300ms delay, returns true (optimistic).
   */
  ping(): Promise<boolean>;
}

export interface OnlineService {
  /**
   * Get current online status.
   * Default: uses navigator.onLine if available.
   */
  isOnline(): boolean;

  /**
   * Subscribe to online/offline events.
   * Default: uses window 'online'/'offline' events.
   *
   * @returns Unsubscribe function
   */
  subscribe(listener: (online: boolean) => void): VoidFunction;
}

// =============================================================================
// Services
// =============================================================================

/**
 * Service for checking network reachability.
 *
 * Default implementation: 300ms delay, always returns true (optimistic).
 *
 * Override for real connectivity check:
 * ```ts
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
export const pingService: Factory<PingService> = () => {
  return {
    ping: async () => {
      await async.delay(300);
      return true;
    },
  };
};

/**
 * Service for online/offline event subscription.
 *
 * Default implementation: uses browser's navigator.onLine and window events.
 *
 * Override for React Native:
 * ```ts
 * import NetInfo from '@react-native-community/netinfo';
 *
 * container.set(onlineService, () => ({
 *   isOnline: () => true,
 *   subscribe: (listener) => NetInfo.addEventListener(s => listener(!!s.isConnected)),
 * }));
 * ```
 */
export const onlineService: Factory<OnlineService> = () => {
  const isBrowser = typeof window !== "undefined";

  return {
    isOnline: () => (isBrowser ? navigator.onLine : true),

    subscribe: (listener) => {
      if (!isBrowser) {
        // SSR/non-browser: no-op
        return () => {};
      }

      const onOnline = () => listener(true);
      const onOffline = () => listener(false);

      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);

      return () => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      };
    },
  };
};
