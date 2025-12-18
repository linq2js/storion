/**
 * Rooms Store
 *
 * Manages chat rooms including:
 * - Loading rooms the user is a member of
 * - Creating and deleting rooms
 * - Selecting the active room
 * - Starting direct message conversations
 *
 * Dependencies:
 * - authStore: To get current user for room operations
 */

import { store, type ActionsBase } from "storion";
import { async, type AsyncState } from "storion/async";
import type { Room } from "../types";
import { generateId, getDMRoomId } from "../types";
import {
  indexedDBRoomsService,
  indexedDBUsersService,
  indexedDBMessagesService,
} from "../services/indexedDB";
import { crossTabSyncService } from "../services/crossTabSync";
import { authStore } from "./authStore";

// ============================================================================
// Helpers
// ============================================================================

/**
 * Helper to create a success AsyncState for stale mode
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

export interface RoomsState {
  /** List of rooms the current user is a member of */
  rooms: AsyncState<Room[], "stale">;

  /** Currently selected/active room ID */
  activeRoomId: string | null;
}

// ============================================================================
// Actions Interface
// ============================================================================

export interface RoomsActions extends ActionsBase {
  /** Load all rooms for the current user from IndexedDB */
  loadRooms: () => Promise<void>;

  /** Reset the store to initial state */
  reset: () => void;

  /** Create a new group chat room */
  createRoom: (name: string, description?: string) => Promise<Room>;

  /** Delete a room and all its messages */
  deleteRoom: (roomId: string) => Promise<void>;

  /** Select a room as the active room for chatting */
  selectRoom: (roomId: string | null) => void;

  /**
   * Start a direct message conversation with another user
   * Creates a DM room if it doesn't exist
   */
  startDirectMessage: (userId: string) => Promise<void>;

  /** Add a room to local state (used by cross-tab sync) */
  addRoom: (room: Room) => void;

  /** Remove a room from local state (used by cross-tab sync) */
  removeRoom: (roomId: string) => void;

  /** Add a member to a room (used by cross-tab sync) */
  addMemberToRoom: (roomId: string, userId: string) => void;
}

// ============================================================================
// Store Definition
// ============================================================================

export const roomsStore = store<RoomsState, RoomsActions>({
  name: "rooms",

  // Initial state
  state: {
    rooms: async.stale<Room[]>([]),
    activeRoomId: null,
  },

  // Setup receives StoreContext for accessing other stores
  setup: (ctx) => {
    const { focus, update, get } = ctx;

    // Get service instances via factory (cached by container)
    const rooms = get(indexedDBRoomsService);
    const users = get(indexedDBUsersService);
    const messages = get(indexedDBMessagesService);
    const sync = get(crossTabSyncService);

    // Get store references during setup phase (MUST be at top level)
    // State is reactive - reads current value when accessed later
    const [authState] = get(authStore);

    // Async action for loading rooms
    const roomsAsync = async(focus("rooms"), async () => {
      // Access reactive state (NOT calling get() here)
      if (!authState.currentUser) return [];

      // Load rooms where user is a member
      return rooms.getForUser(authState.currentUser.id);
    });

    return {
      // ========================
      // Load Rooms Action
      // ========================
      loadRooms: async () => {
        await roomsAsync.dispatch();
      },

      // ========================
      // Reset Action
      // ========================
      reset: () => {
        roomsAsync.reset();
        update((s: RoomsState) => {
          s.activeRoomId = null;
        });
      },

      // ========================
      // Create Room Action
      // ========================
      createRoom: async (name: string, description?: string) => {
        // Access reactive state obtained during setup
        if (!authState.currentUser) throw new Error("Not logged in");

        // Create room object
        const room: Room = {
          id: generateId(),
          name,
          description,
          createdBy: authState.currentUser.id,
          createdAt: Date.now(),
          members: [authState.currentUser.id], // Creator is first member
          isDirectMessage: false,
          lastMessageAt: Date.now(),
        };

        // Persist to IndexedDB
        await rooms.save(room);

        // Broadcast to other tabs
        sync.broadcast("ROOM_CREATED", room);

        // Optimistically update local state
        update((s: RoomsState) => {
          const rooms = s.rooms.data ?? [];
          s.rooms = success([...rooms, room]);
        });

        return room;
      },

      // ========================
      // Delete Room Action
      // ========================
      deleteRoom: async (roomId: string) => {
        // Delete messages first (foreign key constraint)
        await messages.deleteForRoom(roomId);

        // Delete the room
        await rooms.delete(roomId);

        // Broadcast to other tabs
        sync.broadcast("ROOM_DELETED", { roomId });

        // Update local state
        update((s: RoomsState) => {
          const rooms = s.rooms.data ?? [];
          s.rooms = success(rooms.filter((r: Room) => r.id !== roomId));

          // Clear active room if it was deleted
          if (s.activeRoomId === roomId) {
            s.activeRoomId = null;
          }
        });
      },

      // ========================
      // Select Room Action
      // ========================
      // Simple synchronous action using update.action
      selectRoom: update.action((draft: RoomsState, roomId: string | null) => {
        draft.activeRoomId = roomId;
      }),

      // ========================
      // Start Direct Message Action
      // ========================
      startDirectMessage: async (userId: string) => {
        if (!authState.currentUser) return;

        // Can't DM yourself
        if (userId === authState.currentUser.id) return;

        // Generate deterministic DM room ID (sorted user IDs)
        const dmRoomId = getDMRoomId(authState.currentUser.id, userId);

        // Check if DM room already exists
        let room = await rooms.get(dmRoomId);

        if (!room) {
          // Create new DM room
          const otherUser = await users.get(userId);
          room = {
            id: dmRoomId,
            name: otherUser?.nickname ?? "Direct Message",
            createdBy: authState.currentUser.id,
            createdAt: Date.now(),
            members: [authState.currentUser.id, userId],
            isDirectMessage: true,
            lastMessageAt: Date.now(),
          };

          await rooms.save(room);
          sync.broadcast("ROOM_CREATED", room);
        }

        // Refresh rooms list and select the DM room
        await roomsAsync.dispatch();
        update((s: RoomsState) => {
          s.activeRoomId = room!.id;
        });
      },

      // ========================
      // Add Room Action (for cross-tab sync)
      // ========================
      addRoom: (room: Room) => {
        if (!authState.currentUser) return;

        // Only add if user is a member
        if (!room.members.includes(authState.currentUser.id)) return;

        update((s: RoomsState) => {
          const rooms = s.rooms.data ?? [];
          // Prevent duplicates
          if (!rooms.find((r: Room) => r.id === room.id)) {
            s.rooms = success([...rooms, room]);
          }
        });
      },

      // ========================
      // Remove Room Action (for cross-tab sync)
      // ========================
      removeRoom: (roomId: string) => {
        update((s: RoomsState) => {
          const rooms = s.rooms.data ?? [];
          s.rooms = success(rooms.filter((r: Room) => r.id !== roomId));

          // Clear active room if removed
          if (s.activeRoomId === roomId) {
            s.activeRoomId = null;
          }
        });
      },

      // ========================
      // Add Member to Room Action (for cross-tab sync)
      // ========================
      addMemberToRoom: (roomId: string, userId: string) => {
        update((s: RoomsState) => {
          const rooms = s.rooms.data ?? [];
          const room = rooms.find((r: Room) => r.id === roomId);

          if (room && !room.members.includes(userId)) {
            room.members.push(userId);
            s.rooms = success([...rooms]);
          }
        });
      },
    };
  },
});
