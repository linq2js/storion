import { useState } from "react";
import { withStore } from "storion/react";
import { authStore, usersStore, roomsStore, adminStore, routeStore, isDashboard } from "../stores";
import { isAdmin, ADMIN_USER_ID } from "../types";
import type { User, Room } from "../types";

// Confirmation dialog
function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  isDestructive = true,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDestructive?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />
      <div className="relative bg-chat-surface border border-chat-border rounded-lg shadow-xl w-full max-w-xs p-4 animate-slide-up">
        <h3 className="text-sm font-semibold text-white mb-2">{title}</h3>
        <p className="text-xs text-zinc-400 mb-4">{message}</p>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 px-2 py-1.5 bg-chat-elevated border border-chat-border text-zinc-300 text-xs font-semibold rounded-md hover:bg-chat-border transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-2 py-1.5 text-white text-xs font-semibold rounded-md transition-colors ${
              isDestructive
                ? "bg-red-600 hover:bg-red-700"
                : "bg-gradient-to-r from-chat-accent to-purple-600 hover:opacity-90"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// User row in admin panel
function UserRow({
  user,
  onDelete,
  onKick,
}: {
  user: User;
  onDelete: () => void;
  onKick: () => void;
}) {
  const isAdminUser = user.id === ADMIN_USER_ID;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-chat-elevated hover:bg-chat-border/50 transition-colors">
      <img src={user.avatar} alt="" className="w-10 h-10 rounded-full bg-chat-surface" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">
          {user.nickname}
          {isAdminUser && (
            <span className="ml-2 px-2 py-0.5 text-[10px] bg-chat-accent/20 text-chat-accent rounded-full">
              Admin
            </span>
          )}
        </p>
        <p className="text-xs text-zinc-500 truncate">ID: {user.id} · {user.fullName}</p>
      </div>
      <div className="text-[10px] text-zinc-500 text-right mr-2">
        {user.status === "online" ? (
          <span className="text-green-400">● Online</span>
        ) : (
          <span>● Offline</span>
        )}
      </div>
      {!isAdminUser && (
        <div className="flex gap-2">
          <button
            onClick={onKick}
            className="px-2 py-1.5 text-xs text-yellow-400 bg-yellow-500/10 border border-yellow-500/20 font-semibold rounded-md hover:bg-yellow-500/20 transition-colors"
          >
            Kick
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 font-semibold rounded-md hover:bg-red-500/20 transition-colors"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

// Room row in admin panel
function RoomRow({ room, onDelete }: { room: Room; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-chat-elevated hover:bg-chat-border/50 transition-colors">
      <div className="w-10 h-10 rounded-full bg-chat-surface flex items-center justify-center flex-shrink-0">
        <span className="text-lg text-zinc-400">#</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{room.name}</p>
        <p className="text-xs text-zinc-500 truncate">
          {room.members.length} members · {room.isDirectMessage ? "Direct Message" : "Channel"}
        </p>
      </div>
      <button
        onClick={onDelete}
        className="px-2 py-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 font-semibold rounded-md hover:bg-red-500/20 transition-colors"
      >
        Delete
      </button>
    </div>
  );
}

// Stats card
function StatCard({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="bg-chat-elevated rounded-lg p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-chat-accent/20 flex items-center justify-center text-chat-accent">
          {icon}
        </div>
        <div>
          <p className="text-2xl font-bold text-white">{value}</p>
          <p className="text-xs text-zinc-500">{label}</p>
        </div>
      </div>
    </div>
  );
}

export const AdminPanel = withStore(
  (ctx) => {
    const [authState] = ctx.get(authStore);
    const [usersState] = ctx.get(usersStore);
    const [roomsState] = ctx.get(roomsStore);
    const [routeState] = ctx.get(routeStore);
    const [adminState, adminActions] = ctx.get(adminStore);

    return {
      isVisible: isDashboard(routeState.route) && isAdmin(authState.currentUser),
      users: usersState.users.data ?? [],
      rooms: roomsState.rooms.data ?? [],
      isLoading: adminState.isLoading,
      error: adminState.error,
      clearDatabase: adminActions.clearDatabase,
      deleteUser: adminActions.deleteUser,
      deleteRoom: adminActions.deleteRoom,
      kickUser: adminActions.kickUser,
    };
  },
  ({
    isVisible,
    users,
    rooms,
    isLoading,
    error,
    clearDatabase,
    deleteUser,
    deleteRoom,
    kickUser,
  }) => {
    const [activeTab, setActiveTab] = useState<"overview" | "users" | "rooms">("overview");
    const [confirm, setConfirm] = useState<{
      title: string;
      message: string;
      confirmLabel: string;
      action: () => void;
    } | null>(null);

    if (!isVisible) return null;

    const handleClearDatabase = () => {
      setConfirm({
        title: "Clear All Data",
        message:
          "This will permanently delete ALL users, rooms, messages, and invitations. You will be logged out. This action cannot be undone!",
        confirmLabel: "Clear Everything",
        action: async () => {
          setConfirm(null);
          await clearDatabase();
        },
      });
    };

    const handleDeleteUser = (user: User) => {
      setConfirm({
        title: `Delete ${user.nickname}?`,
        message: `This will permanently delete the user "${user.nickname}" and remove them from all rooms. Their messages will remain.`,
        confirmLabel: "Delete User",
        action: async () => {
          setConfirm(null);
          await deleteUser(user.id);
        },
      });
    };

    const handleKickUser = (user: User) => {
      setConfirm({
        title: `Kick ${user.nickname}?`,
        message: `This will remove "${user.nickname}" from all rooms. They can still rejoin if invited.`,
        confirmLabel: "Kick User",
        action: async () => {
          setConfirm(null);
          await kickUser(user.id);
        },
      });
    };

    const handleDeleteRoom = (room: Room) => {
      setConfirm({
        title: `Delete ${room.name}?`,
        message: `This will permanently delete the room "${room.name}" and all its messages. This action cannot be undone!`,
        confirmLabel: "Delete Room",
        action: async () => {
          setConfirm(null);
          await deleteRoom(room.id);
        },
      });
    };

    const tabs = [
      { id: "overview" as const, label: "Overview" },
      { id: "users" as const, label: "Users", count: users.length },
      { id: "rooms" as const, label: "Rooms", count: rooms.length },
    ];

    const onlineUsers = users.filter((u) => u.status === "online").length;
    const channels = rooms.filter((r) => !r.isDirectMessage).length;
    const dms = rooms.filter((r) => r.isDirectMessage).length;

    return (
      <>
        <div className="flex-1 flex flex-col bg-chat-bg overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-chat-border bg-chat-surface">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-chat-accent/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-chat-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-semibold text-white">Admin Dashboard</h1>
                <p className="text-xs text-zinc-500">Manage users, rooms & data</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-6 py-2 border-b border-chat-border bg-chat-surface">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-2 text-xs font-medium rounded-lg transition-colors ${
                  activeTab === tab.id
                    ? "bg-chat-accent text-white"
                    : "text-zinc-400 hover:text-white hover:bg-chat-elevated"
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`ml-1.5 px-1.5 py-0.5 text-[10px] rounded-full ${
                    activeTab === tab.id
                      ? "bg-white/20"
                      : "bg-chat-elevated"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Error message */}
          {error && (
            <div className="mx-6 mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-chat-bg/80 flex items-center justify-center z-10">
              <div className="flex items-center gap-3 text-zinc-400">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm">Processing...</span>
              </div>
            </div>
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === "overview" && (
              <div className="space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <StatCard
                    label="Total Users"
                    value={users.length}
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    }
                  />
                  <StatCard
                    label="Online Now"
                    value={onlineUsers}
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
                      </svg>
                    }
                  />
                  <StatCard
                    label="Channels"
                    value={channels}
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                      </svg>
                    }
                  />
                  <StatCard
                    label="Direct Messages"
                    value={dms}
                    icon={
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                    }
                  />
                </div>

                {/* Danger Zone */}
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-6">
                  <h2 className="text-sm font-semibold text-red-400 mb-2">Danger Zone</h2>
                  <p className="text-xs text-zinc-500 mb-4">
                    These actions are permanent and cannot be undone.
                  </p>
                  <button
                    onClick={handleClearDatabase}
                    className="px-2 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-md hover:bg-red-700 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Clear Entire Database
                  </button>
                </div>
              </div>
            )}

            {activeTab === "users" && (
              <div className="space-y-2">
                {users.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <p className="text-sm">No users found</p>
                  </div>
                ) : (
                  users.map((user) => (
                    <UserRow
                      key={user.id}
                      user={user}
                      onDelete={() => handleDeleteUser(user)}
                      onKick={() => handleKickUser(user)}
                    />
                  ))
                )}
              </div>
            )}

            {activeTab === "rooms" && (
              <div className="space-y-2">
                {rooms.length === 0 ? (
                  <div className="text-center py-12 text-zinc-500">
                    <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                    </svg>
                    <p className="text-sm">No rooms found</p>
                  </div>
                ) : (
                  rooms.map((room) => (
                    <RoomRow
                      key={room.id}
                      room={room}
                      onDelete={() => handleDeleteRoom(room)}
                    />
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        {/* Confirmation dialog */}
        {confirm && (
          <ConfirmDialog
            title={confirm.title}
            message={confirm.message}
            confirmLabel={confirm.confirmLabel}
            onConfirm={confirm.action}
            onCancel={() => setConfirm(null)}
          />
        )}
      </>
    );
  }
);
