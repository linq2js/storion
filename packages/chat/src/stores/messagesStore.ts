/**
 * Messages Store
 *
 * Manages chat messages including:
 * - Loading messages for a specific room
 * - Sending, editing, and deleting messages
 * - Real-time message updates via cross-tab sync
 *
 * Dependencies:
 * - authStore: To get current user for message operations
 * - roomsStore: To get active room for sending messages
 */

import { store, type ActionsBase } from "storion";
import type { AsyncState } from "storion/async";
import type { Message } from "../types";
import { generateId } from "../types";
import { indexedDBMessagesService } from "../services/indexedDB";
import { crossTabSyncService } from "../services/crossTabSync";
import { authStore } from "./authStore";
import { roomsStore } from "./roomsStore";

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

export interface MessagesState {
  /**
   * Messages organized by room ID
   * Each room has its own async state for independent loading
   */
  messages: Record<string, AsyncState<Message[], "stale">>;
}

// ============================================================================
// Actions Interface
// ============================================================================

export interface MessagesActions extends ActionsBase {
  /** Load messages for a specific room from IndexedDB */
  loadMessages: (roomId: string) => Promise<void>;

  /** Reset the store to initial state */
  reset: () => void;

  /** Send a new message to the active room */
  sendMessage: (content: string, replyTo?: string) => Promise<void>;

  /** Edit an existing message (only sender can edit) */
  editMessage: (messageId: string, content: string) => Promise<void>;

  /** Delete a message (only sender can delete) */
  deleteMessage: (messageId: string) => Promise<void>;

  /** Add a message to local state (used by cross-tab sync) */
  addMessage: (message: Message) => void;

  /** Update a message in local state (used by cross-tab sync) */
  updateMessage: (message: Message) => void;

  /** Remove a message from local state (used by cross-tab sync) */
  removeMessage: (messageId: string, roomId: string) => void;

  /** Clear all messages for a room (used when room is deleted) */
  clearRoomMessages: (roomId: string) => void;
}

// ============================================================================
// Store Definition
// ============================================================================

export const messagesStore = store<MessagesState, MessagesActions>({
  name: "messages",

  // Initial state with empty messages map
  state: {
    messages: {},
  },

  // Setup receives StoreContext for accessing other stores
  setup: (ctx) => {
    const { update, get } = ctx;

    // Get service instances via factory (cached by container)
    const messages = get(indexedDBMessagesService);
    const sync = get(crossTabSyncService);

    // Get store references during setup phase (MUST be at top level)
    // State is reactive - reads current value when accessed later
    const [authState] = get(authStore);
    const [roomsState] = get(roomsStore);

    return {
      // ========================
      // Load Messages Action
      // ========================
      loadMessages: async (roomId: string) => {
        // Fetch messages from IndexedDB
        const roomMessages = await messages.getForRoom(roomId);

        // Update state for this specific room
        update((s: MessagesState) => {
          s.messages[roomId] = success(roomMessages);
        });
      },

      // ========================
      // Reset Action
      // ========================
      reset: update.action((draft: MessagesState) => {
        // Clear all messages
        draft.messages = {};
      }),

      // ========================
      // Send Message Action
      // ========================
      sendMessage: async (content: string, replyTo?: string) => {
        // Access reactive state obtained during setup
        if (!authState.currentUser || !roomsState.activeRoomId) return;

        // Create message object
        const message: Message = {
          id: generateId(),
          roomId: roomsState.activeRoomId,
          senderId: authState.currentUser.id,
          content,
          createdAt: Date.now(),
          replyTo, // Optional reply to another message
        };

        // Persist to IndexedDB
        await messages.save(message);

        // Broadcast to other tabs
        sync.broadcast("MESSAGE_SENT", message);

        // Optimistically update local state
        update((s: MessagesState) => {
          const roomMessages = s.messages[message.roomId]?.data ?? [];
          s.messages[message.roomId] = success([...roomMessages, message]);
        });

        // Stop typing indicator when message is sent
        sync.typing.stop(roomsState.activeRoomId, authState.currentUser.id);
      },

      // ========================
      // Edit Message Action
      // ========================
      editMessage: async (messageId: string, content: string) => {
        // Fetch the message to edit
        const msg = await messages.get(messageId);

        // Only the sender can edit their message
        if (!msg || msg.senderId !== authState.currentUser?.id) return;

        // Update message content and mark as edited
        msg.content = content;
        msg.editedAt = Date.now();

        // Persist changes
        await messages.save(msg);

        // Broadcast to other tabs
        sync.broadcast("MESSAGE_EDITED", msg);

        // Update local state
        update((s: MessagesState) => {
          const roomMessages = s.messages[msg.roomId]?.data ?? [];
          s.messages[msg.roomId] = success(
            roomMessages.map((m: Message) => (m.id === messageId ? msg : m))
          );
        });
      },

      // ========================
      // Delete Message Action
      // ========================
      deleteMessage: async (messageId: string) => {
        // Fetch the message to delete
        const msg = await messages.get(messageId);

        // Only the sender can delete their message
        if (!msg || msg.senderId !== authState.currentUser?.id) return;

        // Delete from IndexedDB
        await messages.delete(messageId);

        // Broadcast to other tabs
        sync.broadcast("MESSAGE_DELETED", {
          messageId,
          roomId: msg.roomId,
        });

        // Update local state
        update((s: MessagesState) => {
          const roomMessages = s.messages[msg.roomId]?.data ?? [];
          s.messages[msg.roomId] = success(
            roomMessages.filter((m: Message) => m.id !== messageId)
          );
        });
      },

      // ========================
      // Add Message Action (for cross-tab sync)
      // ========================
      addMessage: (message: Message) => {
        update((s: MessagesState) => {
          const roomMessages = s.messages[message.roomId]?.data ?? [];

          // Prevent duplicate messages
          if (!roomMessages.find((m: Message) => m.id === message.id)) {
            s.messages[message.roomId] = success([...roomMessages, message]);
          }
        });
      },

      // ========================
      // Update Message Action (for cross-tab sync)
      // ========================
      updateMessage: (message: Message) => {
        update((s: MessagesState) => {
          const roomMessages = s.messages[message.roomId]?.data ?? [];
          s.messages[message.roomId] = success(
            roomMessages.map((m: Message) => (m.id === message.id ? message : m))
          );
        });
      },

      // ========================
      // Remove Message Action (for cross-tab sync)
      // ========================
      removeMessage: (messageId: string, roomId: string) => {
        update((s: MessagesState) => {
          const roomMessages = s.messages[roomId]?.data ?? [];
          s.messages[roomId] = success(
            roomMessages.filter((m: Message) => m.id !== messageId)
          );
        });
      },

      // ========================
      // Clear Room Messages Action
      // ========================
      clearRoomMessages: (roomId: string) => {
        update((s: MessagesState) => {
          delete s.messages[roomId];
        });
      },
    };
  },
});
