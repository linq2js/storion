import type { SyncEvent, SyncEventType } from "../types";
import { getTabId } from "../types";

const STORAGE_KEY = "storion_chat_sync";
const TYPING_STORAGE_KEY = "storion_chat_typing";

type SyncEventHandler = (event: SyncEvent) => void;

const handlers: Set<SyncEventHandler> = new Set();

// Listen for storage events from other tabs
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
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
  });
}

// Subscribe to sync events
export function subscribeToCrossTabSync(handler: SyncEventHandler): () => void {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

// Broadcast an event to other tabs
export function broadcastEvent<T>(type: SyncEventType, payload: T): void {
  const event: SyncEvent<T> = {
    type,
    payload,
    timestamp: Date.now(),
    tabId: getTabId(),
  };

  // Write to localStorage to trigger storage event in other tabs
  localStorage.setItem(STORAGE_KEY, JSON.stringify(event));

  // Immediately notify handlers in the same tab (optional)
  // handlers.forEach((handler) => handler(event));
}

// ============ TYPING INDICATORS ============
// Typing uses a separate storage key for frequent updates

interface TypingState {
  [roomId: string]: {
    [userId: string]: number; // timestamp
  };
}

export function broadcastTypingStart(roomId: string, userId: string): void {
  const current = getTypingState();
  if (!current[roomId]) {
    current[roomId] = {};
  }
  current[roomId][userId] = Date.now();
  localStorage.setItem(TYPING_STORAGE_KEY, JSON.stringify(current));
}

export function broadcastTypingStop(roomId: string, userId: string): void {
  const current = getTypingState();
  if (current[roomId]) {
    delete current[roomId][userId];
    if (Object.keys(current[roomId]).length === 0) {
      delete current[roomId];
    }
    localStorage.setItem(TYPING_STORAGE_KEY, JSON.stringify(current));
  }
}

export function getTypingState(): TypingState {
  try {
    const data = localStorage.getItem(TYPING_STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

export function getTypingUsersForRoom(roomId: string, excludeUserId?: string): string[] {
  const state = getTypingState();
  const roomTyping = state[roomId] || {};
  const now = Date.now();
  const TYPING_TIMEOUT = 3000; // 3 seconds

  return Object.entries(roomTyping)
    .filter(([userId, timestamp]) => {
      if (excludeUserId && userId === excludeUserId) return false;
      return now - timestamp < TYPING_TIMEOUT;
    })
    .map(([userId]) => userId);
}

// ============ CURRENT USER SESSION ============
const CURRENT_USER_KEY = "storion_chat_current_user";

export function saveCurrentUserSession(userId: string): void {
  sessionStorage.setItem(CURRENT_USER_KEY, userId);
}

export function getCurrentUserSession(): string | null {
  return sessionStorage.getItem(CURRENT_USER_KEY);
}

export function clearCurrentUserSession(): void {
  sessionStorage.removeItem(CURRENT_USER_KEY);
}

// ============ ACTIVE USERS ACROSS TABS ============
const ACTIVE_USERS_KEY = "storion_chat_active_users";

interface ActiveUserEntry {
  tabId: string;
  userId: string;
  lastSeen: number;
}

export function registerActiveUser(userId: string): void {
  const tabId = getTabId();
  const active = getActiveUsers();
  const existing = active.findIndex((u) => u.tabId === tabId);

  if (existing >= 0) {
    active[existing] = { tabId, userId, lastSeen: Date.now() };
  } else {
    active.push({ tabId, userId, lastSeen: Date.now() });
  }

  localStorage.setItem(ACTIVE_USERS_KEY, JSON.stringify(active));
}

export function unregisterActiveUser(): void {
  const tabId = getTabId();
  const active = getActiveUsers().filter((u) => u.tabId !== tabId);
  localStorage.setItem(ACTIVE_USERS_KEY, JSON.stringify(active));
}

export function getActiveUsers(): ActiveUserEntry[] {
  try {
    const data = localStorage.getItem(ACTIVE_USERS_KEY);
    const users: ActiveUserEntry[] = data ? JSON.parse(data) : [];
    const now = Date.now();
    const TIMEOUT = 30000; // 30 seconds

    // Filter out stale entries
    return users.filter((u) => now - u.lastSeen < TIMEOUT);
  } catch {
    return [];
  }
}

export function isUserActiveInAnyTab(userId: string): boolean {
  return getActiveUsers().some((u) => u.userId === userId);
}

// Heartbeat to keep user active
let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function startHeartbeat(userId: string): void {
  registerActiveUser(userId);

  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  heartbeatInterval = setInterval(() => {
    registerActiveUser(userId);
  }, 10000); // Every 10 seconds
}

export function stopHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
  unregisterActiveUser();
}

// Handle tab close
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    stopHeartbeat();
  });

  // Handle visibility change for away status
  document.addEventListener("visibilitychange", () => {
    const userId = getCurrentUserSession();
    if (userId) {
      if (document.hidden) {
        broadcastEvent("USER_STATUS_CHANGED", { userId, status: "away" });
      } else {
        broadcastEvent("USER_STATUS_CHANGED", { userId, status: "online" });
        registerActiveUser(userId);
      }
    }
  });
}

