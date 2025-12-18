import { useState, useRef, useEffect, useCallback } from "react";
import { withStore } from "storion/react";
import { chatStore } from "../stores";
import type { Message, User, Room } from "../types";

// Format timestamp
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Message bubble
function MessageBubble({
  message,
  sender,
  isOwnMessage,
  replyToMessage,
  replyToSender,
  onDelete,
}: {
  message: Message;
  sender?: User;
  isOwnMessage: boolean;
  replyToMessage?: Message;
  replyToSender?: User;
  onDelete: () => void;
}) {
  const [showActions, setShowActions] = useState(false);

  return (
    <div
      className={`group flex gap-1.5 animate-slide-up ${isOwnMessage ? "flex-row-reverse" : ""}`}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      {!isOwnMessage && (
        <img
          src={sender?.avatar}
          alt=""
          className="w-6 h-6 rounded-full bg-chat-elevated flex-shrink-0 mt-0.5"
        />
      )}

      <div className={`flex flex-col ${isOwnMessage ? "items-end" : "items-start"} max-w-[70%]`}>
        {!isOwnMessage && (
          <span className="text-[10px] font-medium text-zinc-400 mb-0.5 px-0.5">
            {sender?.nickname ?? "Unknown"}
          </span>
        )}

        {replyToMessage && (
          <div
            className={`px-1.5 py-1 mb-0.5 text-[10px] rounded ${
              isOwnMessage
                ? "bg-chat-accent/10 border-l-2 border-chat-accent/50"
                : "bg-chat-elevated border-l-2 border-zinc-600"
            }`}
          >
            <span className="text-zinc-500">
              Replying to {replyToSender?.nickname ?? "..."}
            </span>
            <p className="text-zinc-400 truncate">{replyToMessage.content}</p>
          </div>
        )}

        <div className="relative">
          <div
            className={`px-2 py-1.5 rounded-lg text-xs ${
              isOwnMessage
                ? "bg-chat-accent text-white rounded-br-[2px]"
                : "bg-chat-elevated text-zinc-100 rounded-bl-[2px]"
            }`}
          >
            <p className="whitespace-pre-wrap break-words">{message.content}</p>
          </div>

          {/* Actions */}
          {isOwnMessage && showActions && (
            <div className="absolute -left-6 top-1/2 -translate-y-1/2">
              <button
                onClick={onDelete}
                className="p-1 text-zinc-500 hover:text-red-400 hover:bg-chat-elevated rounded transition-colors"
                title="Delete message"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>

        <span className="text-[9px] text-zinc-600 mt-0.5 px-0.5">
          {formatTime(message.createdAt)}
          {message.editedAt && " (edited)"}
        </span>
      </div>
    </div>
  );
}

// Typing indicator
function TypingIndicator({ users }: { users: User[] }) {
  if (users.length === 0) return null;

  const names = users.map((u) => u.nickname);
  const text =
    names.length === 1
      ? `${names[0]} is typing`
      : names.length === 2
      ? `${names[0]} and ${names[1]} are typing`
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} are typing`;

  return (
    <div className="flex items-center gap-1 px-2 py-1 text-[10px] text-zinc-500">
      <div className="flex gap-0.5">
        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-typing" style={{ animationDelay: "0ms" }} />
        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-typing" style={{ animationDelay: "200ms" }} />
        <span className="w-1.5 h-1.5 bg-zinc-500 rounded-full animate-typing" style={{ animationDelay: "400ms" }} />
      </div>
      <span>{text}</span>
    </div>
  );
}

// Empty state
function EmptyChat() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-4">
      <div className="w-12 h-12 bg-chat-elevated rounded-lg flex items-center justify-center mb-2">
        <svg className="w-6 h-6 text-zinc-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-zinc-300 mb-0.5">No messages yet</h3>
      <p className="text-[10px] text-zinc-500">Start the conversation!</p>
    </div>
  );
}

// Room header
function RoomHeader({
  room,
  users,
  currentUserId,
  onInvite,
  onDelete,
  onShowProfile,
}: {
  room: Room;
  users: User[];
  currentUserId: string;
  onInvite: () => void;
  onDelete: () => void;
  onShowProfile: (userId: string) => void;
}) {
  const isOwner = room.createdBy === currentUserId;
  const otherUserId = room.isDirectMessage
    ? room.members.find((id) => id !== currentUserId)
    : null;
  const otherUser = otherUserId ? users.find((u) => u.id === otherUserId) : null;

  return (
    <div className="h-10 px-2 flex items-center justify-between border-b border-chat-border bg-chat-surface">
      {room.isDirectMessage && otherUser ? (
        <button
          onClick={() => onShowProfile(otherUser.id)}
          className="flex items-center gap-1.5 hover:bg-chat-elevated rounded-md px-1.5 py-1 -ml-1.5 transition-colors"
        >
          <img src={otherUser.avatar} alt="" className="w-7 h-7 rounded-full bg-chat-elevated" />
          <div className="text-left">
            <h2 className="text-xs font-semibold text-white">{otherUser.nickname}</h2>
            <p className="text-[9px] text-zinc-500">{otherUser.fullName}</p>
          </div>
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <div className="w-7 h-7 rounded-full bg-chat-elevated flex items-center justify-center">
            <span className="text-sm text-zinc-400">#</span>
          </div>
          <div>
            <h2 className="text-xs font-semibold text-white">{room.name}</h2>
            <p className="text-[9px] text-zinc-500">{room.members.length} members</p>
          </div>
        </div>
      )}

      {!room.isDirectMessage && (
        <div className="flex items-center gap-1">
          <button
            onClick={onInvite}
            className="p-1 text-zinc-400 hover:text-white hover:bg-chat-elevated rounded transition-colors"
            title="Invite user"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
              />
            </svg>
          </button>
          {isOwner && (
            <button
              onClick={onDelete}
              className="p-1 text-zinc-400 hover:text-red-400 hover:bg-chat-elevated rounded transition-colors"
              title="Delete room"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export const ChatRoom = withStore(
  (ctx) => {
    const [state, actions] = ctx.get(chatStore);
    const activeRoom = (state.rooms.data ?? []).find((r) => r.id === state.activeRoomId);
    const messages = state.activeRoomId ? state.messages[state.activeRoomId]?.data ?? [] : [];
    const typingUserIds = state.typingUsers
      .filter((t) => t.roomId === state.activeRoomId)
      .map((t) => t.userId);
    const typingUsers = (state.users.data ?? []).filter((u) => typingUserIds.includes(u.id));

    return {
      currentUser: state.currentUser,
      activeRoom,
      messages,
      users: state.users.data ?? [],
      typingUsers,
      sendMessage: actions.sendMessage,
      deleteMessage: actions.deleteMessage,
      loadMessages: actions.loadMessages,
      deleteRoom: actions.deleteRoom,
      setShowInviteUser: actions.setShowInviteUser,
      setShowProfile: actions.setShowProfile,
      startTyping: actions.startTyping,
      stopTyping: actions.stopTyping,
    };
  },
  ({
    currentUser,
    activeRoom,
    messages,
    users,
    typingUsers,
    sendMessage,
    deleteMessage,
    loadMessages,
    deleteRoom,
    setShowInviteUser,
    setShowProfile,
    startTyping,
    stopTyping,
  }) => {
    const [input, setInput] = useState("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Load messages when room changes
    useEffect(() => {
      if (activeRoom) {
        loadMessages(activeRoom.id);
      }
    }, [activeRoom?.id, loadMessages]);

    // Auto-scroll to bottom
    useEffect(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Handle typing
    const handleInputChange = useCallback(
      (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        startTyping();

        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        typingTimeoutRef.current = setTimeout(() => {
          stopTyping();
        }, 2000);
      },
      [startTyping, stopTyping]
    );

    // Send message
    const handleSend = useCallback(() => {
      if (!input.trim()) return;

      sendMessage(input.trim());
      setInput("");
      stopTyping();

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    }, [input, sendMessage, stopTyping]);

    // Handle key press
    const handleKeyDown = useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSend();
        }
      },
      [handleSend]
    );

    if (!currentUser) return null;

    // No room selected
    if (!activeRoom) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center bg-chat-bg text-center p-4">
          <div className="w-16 h-16 bg-chat-surface rounded-lg flex items-center justify-center mb-3 border border-chat-border">
            <svg
              className="w-8 h-8 text-chat-accent"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-white mb-1">Welcome to Storion Chat</h2>
          <p className="text-xs text-zinc-500 max-w-xs">
            Select a room from the sidebar or start a direct message with another user.
          </p>
          <p className="text-zinc-600 text-[10px] mt-2">
            💡 Open multiple browser tabs to test cross-tab sync!
          </p>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col bg-chat-bg">
        {/* Header */}
        <RoomHeader
          room={activeRoom}
          users={users}
          currentUserId={currentUser.id}
          onInvite={() => setShowInviteUser(true)}
          onDelete={() => {
            if (confirm("Are you sure you want to delete this room?")) {
              deleteRoom(activeRoom.id);
            }
          }}
          onShowProfile={setShowProfile}
        />

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {messages.length === 0 ? (
            <EmptyChat />
          ) : (
            messages.map((message) => {
              const sender = users.find((u) => u.id === message.senderId);
              const isOwnMessage = message.senderId === currentUser.id;
              const replyToMessage = message.replyTo
                ? messages.find((m) => m.id === message.replyTo)
                : undefined;
              const replyToSender = replyToMessage
                ? users.find((u) => u.id === replyToMessage.senderId)
                : undefined;

              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  sender={sender}
                  isOwnMessage={isOwnMessage}
                  replyToMessage={replyToMessage}
                  replyToSender={replyToSender}
                  onDelete={() => deleteMessage(message.id)}
                />
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        <TypingIndicator users={typingUsers} />

        {/* Input */}
        <div className="p-2 border-t border-chat-border bg-chat-surface">
          <div className="flex items-stretch gap-1.5">
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 px-2 py-1.5 bg-chat-elevated border border-chat-border rounded-md text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-chat-accent/50 focus:border-chat-accent resize-none transition-all"
              style={{
                minHeight: "32px",
                maxHeight: "80px",
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="px-2.5 bg-chat-accent text-white rounded-md hover:opacity-90 focus:outline-none focus:ring-1 focus:ring-chat-accent/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14M12 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    );
  }
);
