/**
 * Admin Store
 *
 * Provides admin-only operations for managing the chat application:
 * - Clear all database data
 * - Delete users
 * - Delete rooms/channels
 *
 * All actions require the current user to be admin (id === "admin").
 */

import { store, type ActionsBase } from "storion";
import { isAdmin } from "../types";
import { indexedDBCoreService } from "../services/indexedDB/core";
import { indexedDBUsersService } from "../services/indexedDB/users";
import { indexedDBRoomsService } from "../services/indexedDB/rooms";
import { indexedDBMessagesService } from "../services/indexedDB/messages";
import { indexedDBInvitationsService } from "../services/indexedDB/invitations";
import { authStore } from "./authStore";
import { usersStore } from "./usersStore";
import { roomsStore } from "./roomsStore";

// ============================================================================
// State Interface
// ============================================================================

export interface AdminState {
  /** Whether an admin operation is in progress */
  isLoading: boolean;
  /** Last error message */
  error: string | null;
}

// ============================================================================
// Actions Interface
// ============================================================================

export interface AdminActions extends ActionsBase {
  /**
   * Clear all data from the database (users, rooms, messages, invitations).
   * Current user will be logged out after clearing.
   */
  clearDatabase: () => Promise<void>;

  /**
   * Delete a specific user by ID.
   * Cannot delete the admin user.
   */
  deleteUser: (userId: string) => Promise<void>;

  /**
   * Delete a specific room/channel by ID.
   */
  deleteRoom: (roomId: string) => Promise<void>;

  /**
   * Kick a user from all rooms (remove membership).
   */
  kickUser: (userId: string) => Promise<void>;
}

// ============================================================================
// Store Definition
// ============================================================================

export const adminStore = store<AdminState, AdminActions>({
  name: "admin",

  state: {
    isLoading: false,
    error: null,
  },

  setup: (ctx) => {
    const { update, get } = ctx;

    // Get dependencies
    const [authState, authActions] = get(authStore);
    const [, usersActions] = get(usersStore);
    const [, roomsActions] = get(roomsStore);

    const core = get(indexedDBCoreService);
    const usersDB = get(indexedDBUsersService);
    const roomsDB = get(indexedDBRoomsService);
    const messagesDB = get(indexedDBMessagesService);
    const invitationsDB = get(indexedDBInvitationsService);

    /**
     * Helper to check admin permission before action
     */
    function requireAdmin(): void {
      if (!isAdmin(authState.currentUser)) {
        throw new Error("Permission denied: Admin access required");
      }
    }

    /**
     * Helper to wrap async actions with loading state
     */
    async function withLoading<T>(fn: () => Promise<T>): Promise<T> {
      update((s) => {
        s.isLoading = true;
        s.error = null;
      });

      try {
        const result = await fn();
        update((s) => {
          s.isLoading = false;
        });
        return result;
      } catch (err) {
        update((s) => {
          s.isLoading = false;
          s.error = err instanceof Error ? err.message : "Unknown error";
        });
        throw err;
      }
    }

    return {
      // ========================
      // Clear Database
      // ========================
      clearDatabase: async () => {
        requireAdmin();

        await withLoading(async () => {
          // Clear all IndexedDB data
          await core.clearAll();

          // Log out current user (session will be invalid)
          authActions.logout();

          // Reload the page to reset all stores
          window.location.reload();
        });
      },

      // ========================
      // Delete User
      // ========================
      deleteUser: async (userId: string) => {
        requireAdmin();

        // Cannot delete admin
        if (userId === "admin") {
          throw new Error("Cannot delete admin user");
        }

        await withLoading(async () => {
          // Delete from IndexedDB
          await usersDB.delete(userId);

          // Remove from all rooms
          const rooms = await roomsDB.getAll();
          for (const room of rooms) {
            if (room.members.includes(userId)) {
              await roomsDB.removeMember(room.id, userId);
            }
          }

          // Delete user's invitations
          const invitations = await invitationsDB.getForUser(userId);
          for (const inv of invitations) {
            await invitationsDB.delete(inv.id);
          }

          // Refresh users list
          await usersActions.loadUsers();
        });
      },

      // ========================
      // Delete Room
      // ========================
      deleteRoom: async (roomId: string) => {
        requireAdmin();

        await withLoading(async () => {
          // Delete all messages in the room
          const messages = await messagesDB.getForRoom(roomId);
          for (const msg of messages) {
            await messagesDB.delete(msg.id);
          }

          // Delete invitations for this room
          const invitations = await invitationsDB.getForRoom(roomId);
          for (const inv of invitations) {
            await invitationsDB.delete(inv.id);
          }

          // Delete the room
          await roomsDB.delete(roomId);

          // Refresh rooms list
          await roomsActions.loadRooms();
        });
      },

      // ========================
      // Kick User
      // ========================
      kickUser: async (userId: string) => {
        requireAdmin();

        // Cannot kick admin
        if (userId === "admin") {
          throw new Error("Cannot kick admin user");
        }

        await withLoading(async () => {
          // Remove from all rooms
          const rooms = await roomsDB.getAll();
          for (const room of rooms) {
            if (room.members.includes(userId)) {
              await roomsDB.removeMember(room.id, userId);
            }
          }

          // Refresh rooms list
          await roomsActions.loadRooms();
        });
      },
    };
  },
});

