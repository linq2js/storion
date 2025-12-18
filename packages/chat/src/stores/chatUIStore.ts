/**
 * Chat UI Store
 *
 * Manages UI-related state including:
 * - Sidebar view selection (rooms, users, invitations)
 * - Modal visibility (create room, invite user, profile)
 * - Typing indicators for real-time "user is typing" feature
 *
 * Dependencies:
 * - authStore: To get current user for typing operations
 * - roomsStore: To get active room for typing operations
 */

import { store, type ActionsBase } from "storion";
import type { TypingIndicator } from "../types";
import { crossTabSyncService } from "../services/crossTabSync";
import { authStore } from "./authStore";
import { roomsStore } from "./roomsStore";

// ============================================================================
// State Interface
// ============================================================================

export interface ChatUIState {
  /** Which tab is active in the sidebar */
  sidebarView: "rooms" | "users" | "invitations";

  /** Whether the create room modal is visible */
  showCreateRoom: boolean;

  /** Whether the invite user modal is visible */
  showInviteUser: boolean;

  /** User ID to show profile modal for, or null if hidden */
  showProfile: string | null;

  /** List of users currently typing in the active room */
  typingUsers: TypingIndicator[];
}

// ============================================================================
// Actions Interface
// ============================================================================

export interface ChatUIActions extends ActionsBase {
  /** Set the active sidebar tab */
  setSidebarView: (view: ChatUIState["sidebarView"]) => void;

  /** Show/hide the create room modal */
  setShowCreateRoom: (show: boolean) => void;

  /** Show/hide the invite user modal */
  setShowInviteUser: (show: boolean) => void;

  /** Show profile modal for a user, or hide if null */
  setShowProfile: (userId: string | null) => void;

  /** Signal that current user started typing */
  startTyping: () => void;

  /** Signal that current user stopped typing */
  stopTyping: () => void;

  /** Refresh the list of typing users for the active room */
  updateTypingUsers: () => void;

  /** Reset all UI state (used on logout) */
  reset: () => void;
}

// ============================================================================
// Store Definition
// ============================================================================

export const chatUIStore = store<ChatUIState, ChatUIActions>({
  name: "chatUI",

  // Initial state
  state: {
    sidebarView: "rooms",
    showCreateRoom: false,
    showInviteUser: false,
    showProfile: null,
    typingUsers: [],
  },

  // Setup receives StoreContext for accessing other stores
  setup: (ctx) => {
    const { update, get } = ctx;

    // Get service instance via factory (cached by container)
    const sync = get(crossTabSyncService);

    // Get store references during setup phase (MUST be at top level)
    // State is reactive - reads current value when accessed later
    const [authState] = get(authStore);
    const [roomsState] = get(roomsStore);

    // Interval for periodically refreshing typing indicators
    let typingInterval: ReturnType<typeof setInterval> | null = null;

    return {
      // ========================
      // Sidebar View Action
      // ========================
      setSidebarView: update.action((draft: ChatUIState, view: ChatUIState["sidebarView"]) => {
        draft.sidebarView = view;
      }),

      // ========================
      // Modal Actions
      // ========================
      setShowCreateRoom: update.action((draft: ChatUIState, show: boolean) => {
        draft.showCreateRoom = show;
      }),

      setShowInviteUser: update.action((draft: ChatUIState, show: boolean) => {
        draft.showInviteUser = show;
      }),

      setShowProfile: update.action((draft: ChatUIState, userId: string | null) => {
        draft.showProfile = userId;
      }),

      // ========================
      // Start Typing Action
      // ========================
      startTyping: () => {
        if (!authState.currentUser || !roomsState.activeRoomId) return;

        // Broadcast typing start to localStorage (for cross-tab sync)
        sync.typing.start(roomsState.activeRoomId, authState.currentUser.id);

        // Set up interval to refresh typing users periodically
        // This is needed because typing status expires after a few seconds
        if (!typingInterval) {
          typingInterval = setInterval(() => {
            if (roomsState.activeRoomId) {
              // Get list of users currently typing (excluding self)
              const typingUserIds = sync.typing.getUsersForRoom(
                roomsState.activeRoomId,
                authState.currentUser?.id
              );

              // Update state with typing indicators
              update((s: ChatUIState) => {
                s.typingUsers = typingUserIds.map((userId) => ({
                  roomId: roomsState.activeRoomId!,
                  userId,
                  timestamp: Date.now(),
                }));
              });
            }
          }, 1000); // Refresh every second
        }
      },

      // ========================
      // Stop Typing Action
      // ========================
      stopTyping: () => {
        if (!authState.currentUser || !roomsState.activeRoomId) return;

        // Broadcast typing stop to localStorage
        sync.typing.stop(roomsState.activeRoomId, authState.currentUser.id);
      },

      // ========================
      // Update Typing Users Action
      // ========================
      updateTypingUsers: () => {
        if (roomsState.activeRoomId) {
          // Get users typing in the active room (excluding self)
          const typingUserIds = sync.typing.getUsersForRoom(
            roomsState.activeRoomId,
            authState.currentUser?.id
          );

          update((s: ChatUIState) => {
            s.typingUsers = typingUserIds.map((userId) => ({
              roomId: roomsState.activeRoomId!,
              userId,
              timestamp: Date.now(),
            }));
          });
        }
      },

      // ========================
      // Reset Action
      // ========================
      reset: update.action((draft: ChatUIState) => {
        // Reset all UI state to defaults
        draft.sidebarView = "rooms";
        draft.showCreateRoom = false;
        draft.showInviteUser = false;
        draft.showProfile = null;
        draft.typingUsers = [];

        // Clean up the typing interval
        if (typingInterval) {
          clearInterval(typingInterval);
          typingInterval = null;
        }
      }),
    };
  },
});
