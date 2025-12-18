/**
 * Cross-Tab Sync Service Factory
 *
 * Provides cross-tab communication via localStorage events.
 * Uses factory pattern for testability - can inject mock storage.
 *
 * @example
 * // Production usage
 * const sync = createCrossTabSyncService();
 * sync.subscribe(handler);
 * sync.broadcast("MESSAGE_SENT", message);
 *
 * // Test usage
 * const mockSync = createCrossTabSyncService({ storage: mockStorage });
 */

import type { SyncEvent, SyncEventType } from "../types";
import { getTabId } from "../types";

// =============================================================================
// Types
// =============================================================================

/** Handler for sync events */
export type SyncEventHandler = (event: SyncEvent) => void;

/** Typing indicator state */
export interface TypingState {
  [roomId: string]: {
    [userId: string]: number; // timestamp
  };
}

/** Active user entry across tabs */
export interface ActiveUserEntry {
  tabId: string;
  userId: string;
  lastSeen: number;
}

/** Cross-tab sync service interface */
export interface CrossTabSyncService {
  /** Subscribe to sync events from other tabs */
  subscribe(handler: SyncEventHandler): () => void;

  /** Broadcast an event to other tabs */
  broadcast<T>(type: SyncEventType, payload: T): void;

  /** Typing indicator operations */
  typing: {
    start(roomId: string, userId: string): void;
    stop(roomId: string, userId: string): void;
    getState(): TypingState;
    getUsersForRoom(roomId: string, excludeUserId?: string): string[];
  };

  /** Current user session operations (sessionStorage) */
  session: {
    save(userId: string): void;
    get(): string | null;
    clear(): void;
  };

  /** Active users across tabs operations */
  activeUsers: {
    register(userId: string): void;
    unregister(): void;
    getAll(): ActiveUserEntry[];
    isActive(userId: string): boolean;
    startHeartbeat(userId: string): void;
    stopHeartbeat(): void;
  };

  /** Cleanup - removes event listeners */
  dispose(): void;
}

/** Options for creating the cross-tab sync service */
export interface CrossTabSyncServiceOptions {
  /** localStorage implementation (default: window.localStorage) */
  localStorage?: Storage;
  /** sessionStorage implementation (default: window.sessionStorage) */
  sessionStorage?: Storage;
  /** Typing timeout in ms (default: 3000) */
  typingTimeout?: number;
  /** Active user timeout in ms (default: 30000) */
  activeUserTimeout?: number;
  /** Heartbeat interval in ms (default: 10000) */
  heartbeatInterval?: number;
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = "storion_chat_sync";
const TYPING_STORAGE_KEY = "storion_chat_typing";
const CURRENT_USER_KEY = "storion_chat_current_user";
const ACTIVE_USERS_KEY = "storion_chat_active_users";

const DEFAULT_TYPING_TIMEOUT = 3000;
const DEFAULT_ACTIVE_USER_TIMEOUT = 30000;
const DEFAULT_HEARTBEAT_INTERVAL = 10000;

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a cross-tab sync service instance.
 *
 * @param options - Configuration options
 * @returns Cross-tab sync service
 */
export function createCrossTabSyncService(
  options: CrossTabSyncServiceOptions = {}
): CrossTabSyncService {
  const {
    localStorage: ls = typeof window !== "undefined"
      ? window.localStorage
      : null,
    sessionStorage: ss = typeof window !== "undefined"
      ? window.sessionStorage
      : null,
    typingTimeout = DEFAULT_TYPING_TIMEOUT,
    activeUserTimeout = DEFAULT_ACTIVE_USER_TIMEOUT,
    heartbeatInterval = DEFAULT_HEARTBEAT_INTERVAL,
  } = options;

  // Private state
  const handlers = new Set<SyncEventHandler>();
  let heartbeatIntervalId: ReturnType<typeof setInterval> | null = null;
  let storageListener: ((event: StorageEvent) => void) | null = null;
  let beforeUnloadListener: (() => void) | null = null;
  let visibilityListener: (() => void) | null = null;

  // ---------------------------------------------------------------------------
  // Storage Helpers
  // ---------------------------------------------------------------------------

  function getFromLocalStorage<T>(key: string, defaultValue: T): T {
    if (!ls) return defaultValue;
    try {
      const data = ls.getItem(key);
      return data ? JSON.parse(data) : defaultValue;
    } catch {
      return defaultValue;
    }
  }

  function setToLocalStorage(key: string, value: unknown): void {
    if (!ls) return;
    ls.setItem(key, JSON.stringify(value));
  }

  // ---------------------------------------------------------------------------
  // Event Listener Setup
  // ---------------------------------------------------------------------------

  function setupEventListeners(): void {
    if (typeof window === "undefined") return;

    // Storage event listener for cross-tab sync
    storageListener = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        try {
          const syncEvent: SyncEvent = JSON.parse(event.newValue);
          // Don't process our own events
          if (syncEvent.tabId !== getTabId()) {
            handlers.forEach((handler) => handler(syncEvent));
          }
        } catch (e) {
          console.error("Failed to parse sync event:", e);
        }
      }
    };
    window.addEventListener("storage", storageListener);

    // Before unload listener
    beforeUnloadListener = () => {
      service.activeUsers.stopHeartbeat();
    };
    window.addEventListener("beforeunload", beforeUnloadListener);

    // Visibility change listener
    visibilityListener = () => {
      const userId = service.session.get();
      if (userId) {
        if (document.hidden) {
          service.broadcast("USER_STATUS_CHANGED", { userId, status: "away" });
        } else {
          service.broadcast("USER_STATUS_CHANGED", {
            userId,
            status: "online",
          });
          service.activeUsers.register(userId);
        }
      }
    };
    document.addEventListener("visibilitychange", visibilityListener);
  }

  // ---------------------------------------------------------------------------
  // Service Implementation
  // ---------------------------------------------------------------------------

  const service: CrossTabSyncService = {
    // Subscribe to sync events
    subscribe(handler: SyncEventHandler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    // Broadcast event to other tabs
    broadcast<T>(type: SyncEventType, payload: T) {
      const event: SyncEvent<T> = {
        type,
        payload,
        timestamp: Date.now(),
        tabId: getTabId(),
      };
      setToLocalStorage(STORAGE_KEY, event);
    },

    // =========================================================================
    // Typing Indicators
    // =========================================================================
    typing: {
      start(roomId: string, userId: string) {
        const current = service.typing.getState();
        if (!current[roomId]) {
          current[roomId] = {};
        }
        current[roomId][userId] = Date.now();
        setToLocalStorage(TYPING_STORAGE_KEY, current);
      },

      stop(roomId: string, userId: string) {
        const current = service.typing.getState();
        if (current[roomId]) {
          delete current[roomId][userId];
          if (Object.keys(current[roomId]).length === 0) {
            delete current[roomId];
          }
          setToLocalStorage(TYPING_STORAGE_KEY, current);
        }
      },

      getState(): TypingState {
        return getFromLocalStorage<TypingState>(TYPING_STORAGE_KEY, {});
      },

      getUsersForRoom(roomId: string, excludeUserId?: string): string[] {
        const state = service.typing.getState();
        const roomTyping = state[roomId] || {};
        const now = Date.now();

        return Object.entries(roomTyping)
          .filter(([userId, timestamp]) => {
            if (excludeUserId && userId === excludeUserId) return false;
            return now - timestamp < typingTimeout;
          })
          .map(([userId]) => userId);
      },
    },

    // =========================================================================
    // Session Storage (Current User)
    // =========================================================================
    session: {
      save(userId: string) {
        if (ss) ss.setItem(CURRENT_USER_KEY, userId);
      },

      get(): string | null {
        return ss ? ss.getItem(CURRENT_USER_KEY) : null;
      },

      clear() {
        if (ss) ss.removeItem(CURRENT_USER_KEY);
      },
    },

    // =========================================================================
    // Active Users Across Tabs
    // =========================================================================
    activeUsers: {
      register(userId: string) {
        const tabId = getTabId();
        const active = service.activeUsers.getAll();
        const existing = active.findIndex((u) => u.tabId === tabId);

        if (existing >= 0) {
          active[existing] = { tabId, userId, lastSeen: Date.now() };
        } else {
          active.push({ tabId, userId, lastSeen: Date.now() });
        }

        setToLocalStorage(ACTIVE_USERS_KEY, active);
      },

      unregister() {
        const tabId = getTabId();
        const active = service.activeUsers
          .getAll()
          .filter((u) => u.tabId !== tabId);
        setToLocalStorage(ACTIVE_USERS_KEY, active);
      },

      getAll(): ActiveUserEntry[] {
        const users = getFromLocalStorage<ActiveUserEntry[]>(
          ACTIVE_USERS_KEY,
          []
        );
        const now = Date.now();
        // Filter out stale entries
        return users.filter((u) => now - u.lastSeen < activeUserTimeout);
      },

      isActive(userId: string): boolean {
        return service.activeUsers.getAll().some((u) => u.userId === userId);
      },

      startHeartbeat(userId: string) {
        service.activeUsers.register(userId);

        if (heartbeatIntervalId) {
          clearInterval(heartbeatIntervalId);
        }

        heartbeatIntervalId = setInterval(() => {
          service.activeUsers.register(userId);
        }, heartbeatInterval);
      },

      stopHeartbeat() {
        if (heartbeatIntervalId) {
          clearInterval(heartbeatIntervalId);
          heartbeatIntervalId = null;
        }
        service.activeUsers.unregister();
      },
    },

    // =========================================================================
    // Cleanup
    // =========================================================================
    dispose() {
      if (typeof window === "undefined") return;

      if (storageListener) {
        window.removeEventListener("storage", storageListener);
        storageListener = null;
      }
      if (beforeUnloadListener) {
        window.removeEventListener("beforeunload", beforeUnloadListener);
        beforeUnloadListener = null;
      }
      if (visibilityListener) {
        document.removeEventListener("visibilitychange", visibilityListener);
        visibilityListener = null;
      }
      if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
      }
      handlers.clear();
    },
  };

  // Set up event listeners
  setupEventListeners();

  return service;
}

// =============================================================================
// Service Factory (for use with StoreContext.get())
// =============================================================================

/**
 * Cross-tab sync service factory.
 *
 * Use with StoreContext.get() to get the singleton instance:
 * ```ts
 * setup: (ctx) => {
 *   const sync = ctx.get(crossTabSyncService);
 *   // sync.broadcast("MESSAGE_SENT", msg), sync.typing.start(), etc.
 * }
 * ```
 */
export function crossTabSyncService(_resolver?: unknown): CrossTabSyncService {
  return createCrossTabSyncService();
}
