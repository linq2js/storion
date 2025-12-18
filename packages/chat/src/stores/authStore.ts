/**
 * Auth Store
 *
 * Manages user authentication state including:
 * - Current logged-in user
 * - Login/logout operations
 * - Session persistence and restoration
 *
 * This is a base store with no dependencies on other stores.
 * Other stores depend on this to get the current user.
 */

import { store, type ActionsBase } from "storion";
import type { User } from "../types";
import { generateId, getAvatarUrl } from "../types";
import * as db from "../services/indexedDB";
import {
  broadcastEvent,
  saveCurrentUserSession,
  getCurrentUserSession,
  clearCurrentUserSession,
  startHeartbeat,
  stopHeartbeat,
} from "../services/crossTabSync";

// ============================================================================
// State Interface
// ============================================================================

export interface AuthState {
  /** The currently logged-in user, or null if not authenticated */
  currentUser: User | null;
}

// ============================================================================
// Actions Interface
// ============================================================================

export interface AuthActions extends ActionsBase {
  /**
   * Log in with nickname and full name
   * Creates a new user, saves to IndexedDB, and broadcasts to other tabs
   */
  login: (nickname: string, fullName: string) => Promise<User>;

  /**
   * Log out the current user
   * Updates status to offline, clears session, and broadcasts to other tabs
   */
  logout: () => void;

  /**
   * Restore session from sessionStorage
   * Called on app initialization to restore previous login
   * @returns The restored user, or null if no valid session
   */
  restoreSession: () => Promise<User | null>;

  /**
   * Update the current user's data (used by cross-tab sync)
   */
  updateCurrentUser: (user: User) => void;
}

// ============================================================================
// Store Definition
// ============================================================================

export const authStore = store<AuthState, AuthActions>({
  name: "auth",

  // Initial state
  state: {
    currentUser: null,
  },

  // Setup function returns actions
  setup: ({ state, update }) => {
    return {
      // ========================
      // Login Action
      // ========================
      login: async (nickname: string, fullName: string) => {
        const now = Date.now();
        const id = generateId();

        // Create new user object
        const user: User = {
          id,
          nickname,
          fullName,
          avatar: getAvatarUrl(nickname), // Generate avatar from DiceBear
          createdAt: now,
          lastActiveAt: now,
          status: "online",
        };

        // Persist to IndexedDB
        await db.saveUser(user);

        // Save session to sessionStorage (tab-specific)
        saveCurrentUserSession(id);

        // Start heartbeat to update lastActiveAt periodically
        startHeartbeat(id);

        // Update local state
        update((s) => {
          s.currentUser = user;
        });

        // Notify other tabs about new user
        broadcastEvent("USER_LOGGED_IN", user);

        return user;
      },

      // ========================
      // Logout Action
      // ========================
      logout: () => {
        const userId = state.currentUser?.id;

        if (userId) {
          // Stop the heartbeat timer
          stopHeartbeat();

          // Update user status in IndexedDB
          db.updateUserStatus(userId, "offline", Date.now());

          // Notify other tabs
          broadcastEvent("USER_LOGGED_OUT", { userId });
        }

        // Clear session from sessionStorage
        clearCurrentUserSession();

        // Clear local state
        update((s) => {
          s.currentUser = null;
        });
      },

      // ========================
      // Restore Session Action
      // ========================
      restoreSession: async () => {
        // Check if we have a saved session
        const userId = getCurrentUserSession();
        if (!userId) return null;

        // Initialize IndexedDB and fetch user
        await db.initDB();
        const user = await db.getUser(userId);

        // If user doesn't exist in DB, clear invalid session
        if (!user) {
          clearCurrentUserSession();
          return null;
        }

        // Update user status to online
        user.status = "online";
        user.lastActiveAt = Date.now();
        await db.saveUser(user);

        // Start heartbeat for this session
        startHeartbeat(user.id);

        // Update local state
        update((s) => {
          s.currentUser = user;
        });

        // Notify other tabs about status change
        broadcastEvent("USER_STATUS_CHANGED", {
          userId: user.id,
          status: "online",
        });

        return user;
      },

      // ========================
      // Update Current User Action
      // ========================
      // Using update.action for simple synchronous updates
      updateCurrentUser: update.action((draft, user: User) => {
        // Only update if it's the same user
        if (draft.currentUser?.id === user.id) {
          draft.currentUser = user;
        }
      }),
    };
  },
});
