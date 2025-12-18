/**
 * Chat Stores Index
 *
 * This file exports all stores and provides helper functions for:
 * - Cross-tab synchronization
 * - Initial data loading
 * - Store reset on logout
 *
 * Store Architecture:
 * ==================
 *
 * The chat application uses multiple focused stores instead of a single
 * monolithic store. This provides better separation of concerns and makes
 * the code easier to maintain.
 *
 * Store Dependencies:
 * ------------------
 * authStore (no deps)        <- Base store for authentication
 *     ↑
 * usersStore (no deps)       <- User list management
 *     ↑
 * roomsStore (authStore)     <- Room management
 *     ↑
 * messagesStore (authStore, roomsStore)  <- Message management
 *     ↑
 * invitationsStore (authStore, roomsStore)  <- Invitation management
 *     ↑
 * chatUIStore (authStore, roomsStore)  <- UI state management
 *
 * Cross-Store Communication:
 * -------------------------
 * Stores get references to other stores during setup phase using get().
 * The returned state is reactive - reads return current values when accessed.
 *
 * Example:
 * ```ts
 * setup: (ctx) => {
 *   const { update, get } = ctx;
 *   // Get store references at top of setup (MUST be here, not in actions)
 *   const [authState] = get(authStore);
 *   
 *   return {
 *     someAction: () => {
 *       // authState is reactive - reads current value
 *       if (authState.currentUser) { ... }
 *     }
 *   };
 * }
 * ```
 */

// ============================================================================
// Store Exports
// ============================================================================

/** Authentication store - manages current user and login/logout */
export { authStore, type AuthState, type AuthActions } from "./authStore";

/** Users store - manages list of all users */
export { usersStore, type UsersState, type UsersActions } from "./usersStore";

/** Rooms store - manages chat rooms and active room selection */
export { roomsStore, type RoomsState, type RoomsActions } from "./roomsStore";

/** Messages store - manages messages per room */
export { messagesStore, type MessagesState, type MessagesActions } from "./messagesStore";

/** Invitations store - manages room invitations */
export { invitationsStore, type InvitationsState, type InvitationsActions } from "./invitationsStore";

/** Chat UI store - manages UI state (modals, sidebar, typing) */
export { chatUIStore, type ChatUIState, type ChatUIActions } from "./chatUIStore";

/** Toast store - manages toast notifications */
export { toastStore, type Toast, type ToastType, type ToastState, type ToastActions } from "./toastStore";

// ============================================================================
// Cross-Tab Sync Setup
// ============================================================================

import type { StoreContainer } from "storion";
import type { User, Room, Message, RoomInvitation } from "../types";
import { subscribeToCrossTabSync } from "../services/crossTabSync";
import { authStore } from "./authStore";
import { usersStore } from "./usersStore";
import { roomsStore } from "./roomsStore";
import { messagesStore } from "./messagesStore";
import { invitationsStore } from "./invitationsStore";
import { chatUIStore } from "./chatUIStore";

/**
 * Interface for the toast notification system
 * Allows showing toast messages to the user
 */
export interface ToastNotifier {
  show: (toast: {
    type: "info" | "success" | "warning" | "error" | "message";
    title: string;
    message?: string;
    avatar?: string;
    duration?: number;
    roomId?: string;
  }) => void;
}

/**
 * Set up cross-tab synchronization
 *
 * This function subscribes to localStorage events from other tabs and
 * updates the local stores accordingly. It also shows toast notifications
 * for relevant events.
 *
 * @param app - The Storion container instance
 * @param toast - Optional toast notifier for showing notifications
 * @returns Cleanup function to unsubscribe from events
 *
 * @example
 * ```ts
 * // In main.tsx
 * const app = container();
 * setTimeout(() => {
 *   const [, toastActions] = app.get(toastStore);
 *   setupCrossTabSync(app, { show: toastActions.show });
 * }, 0);
 * ```
 */
export function setupCrossTabSync(
  app: StoreContainer,
  toast?: ToastNotifier
): () => void {
  // Get actions from all stores we need to update
  const { actions: usersActions } = app.get(usersStore);
  const { actions: roomsActions } = app.get(roomsStore);
  const { actions: messagesActions } = app.get(messagesStore);
  const { actions: invitationsActions } = app.get(invitationsStore);

  // Subscribe to cross-tab events via localStorage
  return subscribeToCrossTabSync((event) => {
    const { type, payload } = event;

    // Get current state for making decisions (e.g., should we show toast?)
    const { state: authState } = app.get(authStore);
    const { state: usersState } = app.get(usersStore);
    const { state: roomsState } = app.get(roomsStore);

    const currentUserId = authState.currentUser?.id ?? null;
    const activeRoomId = roomsState.activeRoomId;
    const users = usersState.users.data ?? [];
    const rooms = roomsState.rooms.data ?? [];

    // ========================
    // Handle Sync Events
    // ========================
    // These update local store state based on events from other tabs

    switch (type) {
      // User logged in or updated their profile
      case "USER_LOGGED_IN":
      case "USER_UPDATED": {
        const user = payload as User;
        usersActions.updateUser(user);
        break;
      }

      // User status changed (online/away/offline)
      case "USER_STATUS_CHANGED": {
        const { userId, status } = payload as { userId: string; status: User["status"] };
        usersActions.updateUserStatus(userId, status);
        break;
      }

      // User logged out
      case "USER_LOGGED_OUT": {
        const { userId } = payload as { userId: string };
        usersActions.setUserOffline(userId);
        break;
      }

      // New room created
      case "ROOM_CREATED": {
        const room = payload as Room;
        roomsActions.addRoom(room);
        break;
      }

      // Room deleted
      case "ROOM_DELETED": {
        const { roomId } = payload as { roomId: string };
        roomsActions.removeRoom(roomId);
        messagesActions.clearRoomMessages(roomId); // Also clear messages
        break;
      }

      // New message sent
      case "MESSAGE_SENT": {
        const message = payload as Message;
        messagesActions.addMessage(message);
        break;
      }

      // Message edited
      case "MESSAGE_EDITED": {
        const message = payload as Message;
        messagesActions.updateMessage(message);
        break;
      }

      // Message deleted
      case "MESSAGE_DELETED": {
        const { messageId, roomId } = payload as { messageId: string; roomId: string };
        messagesActions.removeMessage(messageId, roomId);
        break;
      }

      // Room invitation sent
      case "INVITE_SENT": {
        const invitation = payload as RoomInvitation;
        // Only reload if we're the invitee
        if (invitation.inviteeId === currentUserId) {
          invitationsActions.loadInvitations();
        }
        break;
      }

      // Invitation accepted - add member to room
      case "INVITE_ACCEPTED": {
        const { roomId, userId } = payload as { roomId: string; userId: string };
        roomsActions.addMemberToRoom(roomId, userId);
        break;
      }

      default:
        break;
    }

    // ========================
    // Show Toast Notifications
    // ========================
    // Display user-friendly notifications for relevant events

    if (toast) {
      switch (type) {
        // New message notification
        case "MESSAGE_SENT": {
          const message = payload as Message;

          // Don't notify for own messages
          if (message.senderId === currentUserId) break;

          // Don't notify if user is viewing this room
          if (message.roomId === activeRoomId) break;

          const sender = users.find((u: User) => u.id === message.senderId);
          const room = rooms.find((r: Room) => r.id === message.roomId);
          const roomName = room?.isDirectMessage ? sender?.nickname : room?.name ?? "Unknown";

          toast.show({
            type: "message",
            title: roomName ?? "New Message",
            message: `${sender?.nickname ?? "Someone"}: ${message.content.slice(0, 40)}${message.content.length > 40 ? "..." : ""}`,
            avatar: sender?.avatar,
            roomId: message.roomId, // Allow clicking to navigate
          });
          break;
        }

        // Invitation received notification
        case "INVITE_SENT": {
          const invitation = payload as RoomInvitation;

          // Only show if we're the invitee
          if (invitation.inviteeId !== currentUserId) break;

          const inviter = users.find((u: User) => u.id === invitation.inviterId);
          const room = rooms.find((r: Room) => r.id === invitation.roomId);

          toast.show({
            type: "info",
            title: "Room Invitation",
            message: `${inviter?.nickname ?? "Someone"} invited you to ${room?.name ?? "a room"}`,
            avatar: inviter?.avatar,
          });
          break;
        }

        // Added to room notification
        case "ROOM_CREATED": {
          const room = payload as Room;

          // Don't notify if we created it
          if (room.createdBy === currentUserId) break;

          // Only notify if we're a member
          if (!room.members.includes(currentUserId ?? "")) break;

          const creator = users.find((u: User) => u.id === room.createdBy);
          toast.show({
            type: "success",
            title: "Added to Room",
            message: `You were added to "${room.name}"`,
            avatar: creator?.avatar,
          });
          break;
        }

        // User came online notification
        case "USER_LOGGED_IN": {
          const user = payload as User;

          // Don't notify about ourselves
          if (user.id === currentUserId) break;

          toast.show({
            type: "info",
            title: `${user.nickname} is online`,
            avatar: user.avatar,
            duration: 3000, // Shorter duration for online notifications
          });
          break;
        }

        default:
          break;
      }
    }
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load initial data after login or session restore
 *
 * This loads users, rooms, and invitations in parallel for better performance.
 *
 * @param app - The Storion container instance
 *
 * @example
 * ```ts
 * // After successful login
 * await login(nickname, fullName);
 * await loadInitialData(app);
 * ```
 */
export async function loadInitialData(app: StoreContainer): Promise<void> {
  const { actions: usersActions } = app.get(usersStore);
  const { actions: roomsActions } = app.get(roomsStore);
  const { actions: invitationsActions } = app.get(invitationsStore);

  // Load all data in parallel for faster initialization
  await Promise.all([
    usersActions.loadUsers(),
    roomsActions.loadRooms(),
    invitationsActions.loadInvitations(),
  ]);
}

/**
 * Reset all stores on logout
 *
 * This clears all store data and resets UI state to defaults.
 *
 * @param app - The Storion container instance
 *
 * @example
 * ```ts
 * // On logout button click
 * logout();
 * resetAllStores(app);
 * ```
 */
export function resetAllStores(app: StoreContainer): void {
  const { actions: usersActions } = app.get(usersStore);
  const { actions: roomsActions } = app.get(roomsStore);
  const { actions: messagesActions } = app.get(messagesStore);
  const { actions: invitationsActions } = app.get(invitationsStore);
  const { actions: chatUIActions } = app.get(chatUIStore);

  // Reset all stores to their initial state
  usersActions.reset();
  roomsActions.reset();
  messagesActions.reset();
  invitationsActions.reset();
  chatUIActions.reset();
}
