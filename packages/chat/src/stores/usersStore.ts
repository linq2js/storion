/**
 * Users Store
 *
 * Manages the list of all users in the chat application:
 * - Loading users from IndexedDB
 * - Real-time updates for user status changes
 * - Optimistic updates for cross-tab sync
 *
 * This store has no dependencies on other stores.
 * It provides user data that other stores and components can consume.
 */

import { store, type ActionsBase } from "storion";
import { async, type AsyncState } from "storion/async";
import type { User } from "../types";
import * as db from "../services/indexedDB";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Helper to create a success AsyncState for stale mode
 * This allows us to update the state optimistically while maintaining
 * the async state structure
 */
function success<T>(data: T): AsyncState<T, "stale"> {
  return {
    status: "success",
    mode: "stale",
    data,
    error: undefined,
    timestamp: Date.now(),
  } as AsyncState<T, "stale">;
}

// ============================================================================
// State Interface
// ============================================================================

export interface UsersState {
  /**
   * List of all users wrapped in AsyncState
   * Uses "stale" mode to allow showing cached data while fetching
   */
  users: AsyncState<User[], "stale">;
}

// ============================================================================
// Actions Interface
// ============================================================================

export interface UsersActions extends ActionsBase {
  /** Load all users from IndexedDB */
  loadUsers: () => Promise<void>;

  /** Reset the store to initial state */
  reset: () => void;

  /**
   * Update or add a user in the local state
   * Used by cross-tab sync when a user logs in or updates
   */
  updateUser: (user: User) => void;

  /**
   * Update a user's online status
   * Used by cross-tab sync for status changes
   */
  updateUserStatus: (userId: string, status: User["status"]) => void;

  /**
   * Mark a user as offline
   * Used by cross-tab sync when a user logs out
   */
  setUserOffline: (userId: string) => void;
}

// ============================================================================
// Store Definition
// ============================================================================

export const usersStore = store<UsersState, UsersActions>({
  name: "users",

  // Initial state with empty users array in stale async state
  state: {
    users: async.stale<User[]>([]),
  },

  setup: ({ focus, update }) => {
    // Create async action for loading users
    // focus("users") creates a lens to the users field for the async helper
    const usersAsync = async(focus("users"), async () => {
      return db.getAllUsers();
    });

    return {
      // ========================
      // Load Users Action
      // ========================
      loadUsers: async () => {
        // dispatch() triggers the async action and updates state automatically
        await usersAsync.dispatch();
      },

      // ========================
      // Reset Action
      // ========================
      reset: () => {
        // reset() clears the async state back to initial
        usersAsync.reset();
      },

      // ========================
      // Update User Action
      // ========================
      updateUser: (user: User) => {
        update((s) => {
          const users = s.users.data ?? [];

          // Find existing user index
          const idx = users.findIndex((u) => u.id === user.id);

          if (idx >= 0) {
            // Update existing user
            users[idx] = user;
          } else {
            // Add new user
            users.push(user);
          }

          // Create new success state with updated array
          s.users = success([...users]);
        });
      },

      // ========================
      // Update User Status Action
      // ========================
      updateUserStatus: (userId: string, status: User["status"]) => {
        update((s) => {
          const users = s.users.data ?? [];
          const user = users.find((u) => u.id === userId);

          if (user) {
            // Update status and lastActiveAt
            user.status = status;
            user.lastActiveAt = Date.now();

            // Trigger re-render with new array reference
            s.users = success([...users]);
          }
        });
      },

      // ========================
      // Set User Offline Action
      // ========================
      setUserOffline: (userId: string) => {
        update((s) => {
          const users = s.users.data ?? [];
          const user = users.find((u) => u.id === userId);

          if (user) {
            user.status = "offline";
            s.users = success([...users]);
          }
        });
      },
    };
  },
});
