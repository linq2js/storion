import { store, type ActionsBase } from "storion";
import { async, type AsyncState } from "storion/async";
import type {
  User,
  Room,
  Message,
  RoomInvitation,
  TypingIndicator,
} from "../types";
import { generateId, getAvatarUrl, getDMRoomId } from "../types";
import * as db from "../services/indexedDB";
import {
  broadcastEvent,
  subscribeToCrossTabSync,
  saveCurrentUserSession,
  getCurrentUserSession,
  clearCurrentUserSession,
  startHeartbeat,
  stopHeartbeat,
  broadcastTypingStart,
  broadcastTypingStop,
  getTypingUsersForRoom,
} from "../services/crossTabSync";

// Helper to create success state for stale mode
function success<T>(data: T): AsyncState<T, "stale"> {
  return {
    status: "success",
    mode: "stale",
    data,
    error: undefined,
    timestamp: Date.now(),
  } as AsyncState<T, "stale">;
}

// State
export interface ChatState {
  // Current user (from sessionStorage)
  currentUser: User | null;

  // Data
  users: AsyncState<User[], "stale">;
  rooms: AsyncState<Room[], "stale">;
  messages: Record<string, AsyncState<Message[], "stale">>; // roomId -> messages
  invitations: AsyncState<RoomInvitation[], "stale">;

  // UI state
  activeRoomId: string | null;
  typingUsers: TypingIndicator[];
  sidebarView: "rooms" | "users" | "invitations";

  // Modals
  showCreateRoom: boolean;
  showInviteUser: boolean;
  showProfile: string | null; // userId to show profile for
}

export interface ChatActions extends ActionsBase {
  // Auth
  login: (nickname: string, fullName: string) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<boolean>;

  // Data loading
  loadUsers: () => Promise<void>;
  loadRooms: () => Promise<void>;
  loadMessages: (roomId: string) => Promise<void>;
  loadInvitations: () => Promise<void>;

  // Room actions
  createRoom: (name: string, description?: string) => Promise<Room>;
  deleteRoom: (roomId: string) => Promise<void>;
  selectRoom: (roomId: string | null) => void;
  startDirectMessage: (userId: string) => Promise<void>;

  // Message actions
  sendMessage: (content: string, replyTo?: string) => Promise<void>;
  editMessage: (messageId: string, content: string) => Promise<void>;
  deleteMessage: (messageId: string) => Promise<void>;

  // Invitation actions
  inviteUserToRoom: (userId: string, roomId: string) => Promise<void>;
  acceptInvitation: (invitationId: string) => Promise<void>;
  declineInvitation: (invitationId: string) => Promise<void>;

  // Typing
  startTyping: () => void;
  stopTyping: () => void;
  updateTypingUsers: () => void;

  // UI
  setSidebarView: (view: ChatState["sidebarView"]) => void;
  setShowCreateRoom: (show: boolean) => void;
  setShowInviteUser: (show: boolean) => void;
  setShowProfile: (userId: string | null) => void;

  // Sync
  handleSyncEvent: (event: { type: string; payload: unknown }) => Promise<void>;
}

export const chatStore = store<ChatState, ChatActions>({
  name: "chat",
  state: {
    currentUser: null,
    users: async.stale<User[]>([]),
    rooms: async.stale<Room[]>([]),
    messages: {},
    invitations: async.stale<RoomInvitation[]>([]),
    activeRoomId: null,
    typingUsers: [],
    sidebarView: "rooms",
    showCreateRoom: false,
    showInviteUser: false,
    showProfile: null,
  },
  setup: ({ state, focus, update }) => {
    // Async actions
    const usersAsync = async(focus("users"), async () => {
      return db.getAllUsers();
    });

    const roomsAsync = async(focus("rooms"), async () => {
      if (!state.currentUser) return [];
      return db.getRoomsForUser(state.currentUser.id);
    });

    const invitationsAsync = async(focus("invitations"), async () => {
      if (!state.currentUser) return [];
      return db.getInvitationsForUser(state.currentUser.id);
    });

    // Typing interval
    let typingInterval: ReturnType<typeof setInterval> | null = null;

    return {
      // ============ AUTH ============
      login: async (nickname: string, fullName: string) => {
        const now = Date.now();
        const id = generateId();

        const user: User = {
          id,
          nickname,
          fullName,
          avatar: getAvatarUrl(nickname),
          createdAt: now,
          lastActiveAt: now,
          status: "online",
        };

        await db.saveUser(user);
        saveCurrentUserSession(id);
        startHeartbeat(id);

        update((s) => {
          s.currentUser = user;
        });

        broadcastEvent("USER_LOGGED_IN", user);

        // Load initial data
        await Promise.all([
          usersAsync.dispatch(),
          roomsAsync.dispatch(),
          invitationsAsync.dispatch(),
        ]);
      },

      logout: () => {
        const userId = state.currentUser?.id;
        if (userId) {
          stopHeartbeat();
          db.updateUserStatus(userId, "offline", Date.now());
          broadcastEvent("USER_LOGGED_OUT", { userId });
        }

        clearCurrentUserSession();

        // Reset async states
        usersAsync.reset();
        roomsAsync.reset();
        invitationsAsync.reset();

        update((s) => {
          s.currentUser = null;
          s.activeRoomId = null;
          s.messages = {};
        });
      },

      restoreSession: async () => {
        const userId = getCurrentUserSession();
        if (!userId) return false;

        await db.initDB();
        const user = await db.getUser(userId);

        if (!user) {
          clearCurrentUserSession();
          return false;
        }

        // Update status
        user.status = "online";
        user.lastActiveAt = Date.now();
        await db.saveUser(user);
        startHeartbeat(user.id);

        update((s) => {
          s.currentUser = user;
        });

        broadcastEvent("USER_STATUS_CHANGED", {
          userId: user.id,
          status: "online",
        });

        // Load data
        await Promise.all([
          usersAsync.dispatch(),
          roomsAsync.dispatch(),
          invitationsAsync.dispatch(),
        ]);

        return true;
      },

      // ============ DATA LOADING ============
      loadUsers: async () => {
        await usersAsync.dispatch();
      },

      loadRooms: async () => {
        await roomsAsync.dispatch();
      },

      loadMessages: async (roomId: string) => {
        const messages = await db.getMessagesForRoom(roomId);
        update((s) => {
          s.messages[roomId] = success(messages);
        });
      },

      loadInvitations: async () => {
        await invitationsAsync.dispatch();
      },

      // ============ ROOM ACTIONS ============
      createRoom: async (name: string, description?: string) => {
        if (!state.currentUser) throw new Error("Not logged in");

        const room: Room = {
          id: generateId(),
          name,
          description,
          createdBy: state.currentUser.id,
          createdAt: Date.now(),
          members: [state.currentUser.id],
          isDirectMessage: false,
          lastMessageAt: Date.now(),
        };

        await db.saveRoom(room);
        broadcastEvent("ROOM_CREATED", room);

        update((s) => {
          const rooms = s.rooms.data ?? [];
          s.rooms = success([...rooms, room]);
          s.showCreateRoom = false;
        });

        return room;
      },

      deleteRoom: async (roomId: string) => {
        await db.deleteMessagesForRoom(roomId);
        await db.deleteRoom(roomId);
        broadcastEvent("ROOM_DELETED", { roomId });

        update((s) => {
          const rooms = s.rooms.data ?? [];
          s.rooms = success(rooms.filter((r) => r.id !== roomId));
          if (s.activeRoomId === roomId) {
            s.activeRoomId = null;
          }
          delete s.messages[roomId];
        });
      },

      selectRoom: (roomId: string | null) => {
        update((s) => {
          s.activeRoomId = roomId;
        });
      },

      startDirectMessage: async (userId: string) => {
        if (!state.currentUser) return;
        if (userId === state.currentUser.id) return;

        const dmRoomId = getDMRoomId(state.currentUser.id, userId);

        // Check if DM room already exists
        let room = await db.getRoom(dmRoomId);

        if (!room) {
          const otherUser = await db.getUser(userId);
          room = {
            id: dmRoomId,
            name: otherUser?.nickname ?? "Direct Message",
            createdBy: state.currentUser.id,
            createdAt: Date.now(),
            members: [state.currentUser.id, userId],
            isDirectMessage: true,
            lastMessageAt: Date.now(),
          };

          await db.saveRoom(room);
          broadcastEvent("ROOM_CREATED", room);
        }

        // Refresh rooms and select
        await roomsAsync.dispatch();
        update((s) => {
          s.activeRoomId = room!.id;
          s.sidebarView = "rooms";
        });
      },

      // ============ MESSAGE ACTIONS ============
      sendMessage: async (content: string, replyTo?: string) => {
        if (!state.currentUser || !state.activeRoomId) return;

        const message: Message = {
          id: generateId(),
          roomId: state.activeRoomId,
          senderId: state.currentUser.id,
          content,
          createdAt: Date.now(),
          replyTo,
        };

        await db.saveMessage(message);
        broadcastEvent("MESSAGE_SENT", message);

        update((s) => {
          const roomMessages = s.messages[message.roomId]?.data ?? [];
          s.messages[message.roomId] = success([...roomMessages, message]);
        });

        // Stop typing when sending
        broadcastTypingStop(state.activeRoomId, state.currentUser.id);
      },

      editMessage: async (messageId: string, content: string) => {
        const message = await db.getMessage(messageId);
        if (!message || message.senderId !== state.currentUser?.id) return;

        message.content = content;
        message.editedAt = Date.now();

        await db.saveMessage(message);
        broadcastEvent("MESSAGE_EDITED", message);

        update((s) => {
          const roomMessages = s.messages[message.roomId]?.data ?? [];
          s.messages[message.roomId] = success(
            roomMessages.map((m) => (m.id === messageId ? message : m))
          );
        });
      },

      deleteMessage: async (messageId: string) => {
        const message = await db.getMessage(messageId);
        if (!message || message.senderId !== state.currentUser?.id) return;

        await db.deleteMessage(messageId);
        broadcastEvent("MESSAGE_DELETED", {
          messageId,
          roomId: message.roomId,
        });

        update((s) => {
          const roomMessages = s.messages[message.roomId]?.data ?? [];
          s.messages[message.roomId] = success(
            roomMessages.filter((m) => m.id !== messageId)
          );
        });
      },

      // ============ INVITATION ACTIONS ============
      inviteUserToRoom: async (userId: string, roomId: string) => {
        if (!state.currentUser) return;

        const invitation: RoomInvitation = {
          id: generateId(),
          roomId,
          inviterId: state.currentUser.id,
          inviteeId: userId,
          createdAt: Date.now(),
          status: "pending",
        };

        await db.saveInvitation(invitation);
        broadcastEvent("INVITE_SENT", invitation);

        update((s) => {
          s.showInviteUser = false;
        });
      },

      acceptInvitation: async (invitationId: string) => {
        const invitation = await db.getInvitation(invitationId);
        if (!invitation || !state.currentUser) return;

        await db.updateInvitationStatus(invitationId, "accepted");
        await db.addMemberToRoom(invitation.roomId, state.currentUser.id);

        broadcastEvent("INVITE_ACCEPTED", {
          invitationId,
          roomId: invitation.roomId,
          userId: state.currentUser.id,
        });

        // Refresh data
        await Promise.all([roomsAsync.dispatch(), invitationsAsync.dispatch()]);
      },

      declineInvitation: async (invitationId: string) => {
        await db.updateInvitationStatus(invitationId, "declined");
        broadcastEvent("INVITE_DECLINED", { invitationId });
        await invitationsAsync.dispatch();
      },

      // ============ TYPING ============
      startTyping: () => {
        if (!state.currentUser || !state.activeRoomId) return;
        broadcastTypingStart(state.activeRoomId, state.currentUser.id);

        // Auto-refresh typing users
        if (!typingInterval) {
          typingInterval = setInterval(() => {
            update((s) => {
              if (s.activeRoomId) {
                const typingUserIds = getTypingUsersForRoom(
                  s.activeRoomId,
                  s.currentUser?.id
                );
                s.typingUsers = typingUserIds.map((userId) => ({
                  roomId: s.activeRoomId!,
                  userId,
                  timestamp: Date.now(),
                }));
              }
            });
          }, 1000);
        }
      },

      stopTyping: () => {
        if (!state.currentUser || !state.activeRoomId) return;
        broadcastTypingStop(state.activeRoomId, state.currentUser.id);
      },

      updateTypingUsers: () => {
        update((s) => {
          if (s.activeRoomId) {
            const typingUserIds = getTypingUsersForRoom(
              s.activeRoomId,
              s.currentUser?.id
            );
            s.typingUsers = typingUserIds.map((userId) => ({
              roomId: s.activeRoomId!,
              userId,
              timestamp: Date.now(),
            }));
          }
        });
      },

      // ============ UI ============
      setSidebarView: update.action((draft, view: ChatState["sidebarView"]) => {
        draft.sidebarView = view;
      }),

      setShowCreateRoom: update.action((draft, show: boolean) => {
        draft.showCreateRoom = show;
      }),

      setShowInviteUser: update.action((draft, show: boolean) => {
        draft.showInviteUser = show;
      }),

      setShowProfile: update.action((draft, userId: string | null) => {
        draft.showProfile = userId;
      }),

      // ============ SYNC ============
      handleSyncEvent: async (event: { type: string; payload: unknown }) => {
        const { type, payload } = event;

        switch (type) {
          case "USER_LOGGED_IN":
          case "USER_UPDATED": {
            const user = payload as User;
            update((s) => {
              const users = s.users.data ?? [];
              const idx = users.findIndex((u) => u.id === user.id);
              if (idx >= 0) {
                users[idx] = user;
              } else {
                users.push(user);
              }
              s.users = success([...users]);
            });
            break;
          }

          case "USER_STATUS_CHANGED": {
            const { userId, status } = payload as {
              userId: string;
              status: User["status"];
            };
            update((s) => {
              const users = s.users.data ?? [];
              const user = users.find((u) => u.id === userId);
              if (user) {
                user.status = status;
                user.lastActiveAt = Date.now();
                s.users = success([...users]);
              }
            });
            break;
          }

          case "USER_LOGGED_OUT": {
            const { userId } = payload as { userId: string };
            update((s) => {
              const users = s.users.data ?? [];
              const user = users.find((u) => u.id === userId);
              if (user) {
                user.status = "offline";
                s.users = success([...users]);
              }
            });
            break;
          }

          case "ROOM_CREATED": {
            const room = payload as Room;
            if (
              state.currentUser &&
              room.members.includes(state.currentUser.id)
            ) {
              update((s) => {
                const rooms = s.rooms.data ?? [];
                if (!rooms.find((r) => r.id === room.id)) {
                  s.rooms = success([...rooms, room]);
                }
              });
            }
            break;
          }

          case "ROOM_DELETED": {
            const { roomId } = payload as { roomId: string };
            update((s) => {
              const rooms = s.rooms.data ?? [];
              s.rooms = success(rooms.filter((r) => r.id !== roomId));
              if (s.activeRoomId === roomId) {
                s.activeRoomId = null;
              }
              delete s.messages[roomId];
            });
            break;
          }

          case "MESSAGE_SENT": {
            const message = payload as Message;
            update((s) => {
              const roomMessages = s.messages[message.roomId]?.data ?? [];
              if (!roomMessages.find((m) => m.id === message.id)) {
                s.messages[message.roomId] = success([
                  ...roomMessages,
                  message,
                ]);
              }
            });
            break;
          }

          case "MESSAGE_EDITED": {
            const message = payload as Message;
            update((s) => {
              const roomMessages = s.messages[message.roomId]?.data ?? [];
              s.messages[message.roomId] = success(
                roomMessages.map((m) => (m.id === message.id ? message : m))
              );
            });
            break;
          }

          case "MESSAGE_DELETED": {
            const { messageId, roomId } = payload as {
              messageId: string;
              roomId: string;
            };
            update((s) => {
              const roomMessages = s.messages[roomId]?.data ?? [];
              s.messages[roomId] = success(
                roomMessages.filter((m) => m.id !== messageId)
              );
            });
            break;
          }

          case "INVITE_SENT": {
            const invitation = payload as RoomInvitation;
            if (invitation.inviteeId === state.currentUser?.id) {
              await invitationsAsync.dispatch();
            }
            break;
          }

          case "INVITE_ACCEPTED": {
            const { roomId, userId } = payload as {
              roomId: string;
              userId: string;
            };
            update((s) => {
              const rooms = s.rooms.data ?? [];
              const room = rooms.find((r) => r.id === roomId);
              if (room && !room.members.includes(userId)) {
                room.members.push(userId);
                s.rooms = success([...rooms]);
              }
            });
            break;
          }

          default:
            break;
        }
      },
    };
  },
});

// Toast notification options
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

// Set up cross-tab sync listener with toast notifications
export function setupCrossTabSync(
  actions: ChatActions,
  toast?: ToastNotifier,
  getUsers?: () => User[],
  getRooms?: () => Room[],
  getCurrentUserId?: () => string | null,
  getActiveRoomId?: () => string | null
): () => void {
  return subscribeToCrossTabSync((event) => {
    // Handle the sync event first
    actions.handleSyncEvent(event);

    // Show toast notifications for relevant events
    if (toast) {
      const currentUserId = getCurrentUserId?.();
      const activeRoomId = getActiveRoomId?.();
      const users = getUsers?.() ?? [];
      const rooms = getRooms?.() ?? [];

      switch (event.type) {
        case "MESSAGE_SENT": {
          const message = event.payload as Message;
          // Don't notify for own messages
          if (message.senderId === currentUserId) break;
          // Don't notify if user is viewing this room
          if (message.roomId === activeRoomId) break;

          const sender = users.find((u) => u.id === message.senderId);
          const room = rooms.find((r) => r.id === message.roomId);
          const roomName = room?.isDirectMessage
            ? sender?.nickname
            : room?.name ?? "Unknown";

          toast.show({
            type: "message",
            title: roomName ?? "New Message",
            message: `${sender?.nickname ?? "Someone"}: ${message.content.slice(
              0,
              40
            )}${message.content.length > 40 ? "..." : ""}`,
            avatar: sender?.avatar,
            roomId: message.roomId,
          });
          break;
        }

        case "INVITE_SENT": {
          const invitation = event.payload as RoomInvitation;
          if (invitation.inviteeId !== currentUserId) break;

          const inviter = users.find((u) => u.id === invitation.inviterId);
          const room = rooms.find((r) => r.id === invitation.roomId);

          toast.show({
            type: "info",
            title: "Room Invitation",
            message: `${inviter?.nickname ?? "Someone"} invited you to ${
              room?.name ?? "a room"
            }`,
            avatar: inviter?.avatar,
          });
          break;
        }

        case "ROOM_CREATED": {
          const room = event.payload as Room;
          // Notify if user is a member (was added to a new room)
          if (room.createdBy === currentUserId) break;
          if (!room.members.includes(currentUserId ?? "")) break;

          const creator = users.find((u) => u.id === room.createdBy);
          toast.show({
            type: "success",
            title: "Added to Room",
            message: `You were added to "${room.name}"`,
            avatar: creator?.avatar,
          });
          break;
        }

        case "USER_LOGGED_IN": {
          const user = event.payload as User;
          if (user.id === currentUserId) break;

          toast.show({
            type: "info",
            title: `${user.nickname} is online`,
            avatar: user.avatar,
            duration: 3000,
          });
          break;
        }

        default:
          break;
      }
    }
  });
}
