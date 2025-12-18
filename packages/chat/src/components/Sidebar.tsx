import { useContainer, withStore } from "storion/react";
import {
  authStore,
  usersStore,
  roomsStore,
  invitationsStore,
  chatUIStore,
  resetAllStores,
} from "../stores";
import { crossTabSyncService } from "../services/crossTabSync";
import type { Room, User, RoomInvitation } from "../types";

// Status indicator component
// isOnline overrides the stored status with real-time heartbeat check
function StatusDot({
  status,
  isOnline,
}: {
  status: User["status"];
  isOnline?: boolean;
}) {
  // If isOnline is provided, use it; otherwise fall back to stored status
  const effectiveStatus =
    isOnline !== undefined ? (isOnline ? "online" : "offline") : status;

  const colors = {
    online: "bg-chat-online",
    away: "bg-chat-away",
    offline: "bg-chat-offline",
  };
  return (
    <div
      className={`w-2.5 h-2.5 rounded-full ${colors[effectiveStatus]} border-[1.5px] border-chat-surface`}
    />
  );
}

// Room list item
function RoomItem({
  room,
  isActive,
  users,
  currentUserId,
  isUserActive,
  onClick,
}: {
  room: Room;
  isActive: boolean;
  users: User[];
  currentUserId: string;
  isUserActive: (userId: string) => boolean;
  onClick: () => void;
}) {
  const otherUserId = room.isDirectMessage
    ? room.members.find((id) => id !== currentUserId)
    : null;
  const otherUser = otherUserId
    ? users.find((u) => u.id === otherUserId)
    : null;

  const displayName = room.isDirectMessage
    ? otherUser?.nickname ?? "User"
    : room.name;
  const avatar = room.isDirectMessage ? otherUser?.avatar : null;

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left transition-all ${
        isActive
          ? "bg-chat-accent/20 text-white"
          : "text-zinc-400 hover:bg-chat-elevated hover:text-zinc-200"
      }`}
    >
      {avatar ? (
        <div className="relative flex-shrink-0">
          <img
            src={avatar}
            alt=""
            className="w-7 h-7 rounded-full bg-chat-elevated"
          />
          {otherUser && (
            <div className="absolute -bottom-0.5 -right-0.5">
              <StatusDot
                status={otherUser.status}
                isOnline={isUserActive(otherUser.id)}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="w-7 h-7 rounded-full bg-chat-elevated flex items-center justify-center flex-shrink-0">
          <span className="text-xs">#</span>
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate">{displayName}</p>
        {room.isDirectMessage && otherUser && (
          <p className="text-[10px] text-zinc-500 truncate">
            {otherUser.fullName}
          </p>
        )}
        {!room.isDirectMessage && room.description && (
          <p className="text-[10px] text-zinc-500 truncate">
            {room.description}
          </p>
        )}
      </div>
    </button>
  );
}

// User list item
function UserItem({
  user,
  isCurrentUser,
  isOnline,
  onClick,
  onShowProfile,
}: {
  user: User;
  isCurrentUser: boolean;
  isOnline: boolean;
  onClick: () => void;
  onShowProfile: () => void;
}) {
  return (
    <div
      className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-left transition-all ${
        isCurrentUser
          ? "opacity-50"
          : "text-zinc-400 hover:bg-chat-elevated hover:text-zinc-200"
      }`}
    >
      <button
        onClick={onShowProfile}
        className="relative flex-shrink-0 hover:opacity-80 transition-opacity"
        title="View profile"
      >
        <img
          src={user.avatar}
          alt=""
          className="w-7 h-7 rounded-full bg-chat-elevated"
        />
        <div className="absolute -bottom-0.5 -right-0.5">
          <StatusDot status={user.status} isOnline={isOnline} />
        </div>
      </button>
      <button
        onClick={onClick}
        disabled={isCurrentUser}
        className={`flex-1 min-w-0 text-left ${
          isCurrentUser ? "cursor-not-allowed" : ""
        }`}
      >
        <p className="text-xs font-medium text-white truncate">
          {user.nickname}
          {isCurrentUser && <span className="text-zinc-500 ml-1">(you)</span>}
        </p>
        <p className="text-[10px] text-zinc-500 truncate">{user.fullName}</p>
      </button>
    </div>
  );
}

// Invitation item
function InvitationItem({
  invitation: _invitation,
  room,
  inviter,
  onAccept,
  onDecline,
}: {
  invitation: RoomInvitation;
  room?: Room;
  inviter?: User;
  onAccept: () => void;
  onDecline: () => void;
}) {
  void _invitation; // Used for prop type definition
  return (
    <div className="p-1.5 bg-chat-elevated rounded-md">
      <div className="flex items-center gap-1.5 mb-1.5">
        {inviter && (
          <img src={inviter.avatar} alt="" className="w-6 h-6 rounded-full" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] text-white">
            <span className="font-medium">
              {inviter?.nickname ?? "Someone"}
            </span>{" "}
            invited you to
          </p>
          <p className="text-[10px] font-medium text-chat-accent truncate">
            {room?.name ?? "a room"}
          </p>
        </div>
      </div>
      <div className="flex gap-1">
        <button
          onClick={onAccept}
          className="flex-1 px-2 py-1 bg-chat-accent text-white text-[10px] font-medium rounded-sm hover:opacity-90 transition-opacity"
        >
          Accept
        </button>
        <button
          onClick={onDecline}
          className="flex-1 px-2 py-1 bg-chat-border text-zinc-300 text-[10px] font-medium rounded-sm hover:bg-zinc-600 transition-colors"
        >
          Decline
        </button>
      </div>
    </div>
  );
}

export const Sidebar = withStore(
  (ctx) => {
    const [authState, authActions] = ctx.get(authStore);
    const [usersState] = ctx.get(usersStore);
    const [roomsState, roomsActions] = ctx.get(roomsStore);
    const [invitationsState, invitationsActions] = ctx.get(invitationsStore);
    const [chatUIState, chatUIActions] = ctx.get(chatUIStore);
    const sync = ctx.get(crossTabSyncService);

    return {
      currentUser: authState.currentUser,
      rooms: roomsState.rooms.data ?? [],
      users: usersState.users.data ?? [],
      invitations: invitationsState.invitations.data ?? [],
      activeRoomId: roomsState.activeRoomId,
      sidebarView: chatUIState.sidebarView,
      setSidebarView: chatUIActions.setSidebarView,
      selectRoom: roomsActions.selectRoom,
      startDirectMessage: roomsActions.startDirectMessage,
      setShowCreateRoom: chatUIActions.setShowCreateRoom,
      acceptInvitation: invitationsActions.acceptInvitation,
      declineInvitation: invitationsActions.declineInvitation,
      setShowProfile: chatUIActions.setShowProfile,
      logout: authActions.logout,
      // Use heartbeat-based check for real-time online status
      isUserActive: (userId: string) => sync.activeUsers.isActive(userId),
    };
  },
  ({
    currentUser,
    rooms,
    users,
    invitations,
    activeRoomId,
    sidebarView,
    setSidebarView,
    selectRoom,
    startDirectMessage,
    setShowCreateRoom,
    acceptInvitation,
    declineInvitation,
    setShowProfile,
    logout,
    isUserActive,
  }) => {
    const app = useContainer();
    if (!currentUser) return null;

    const groupRooms = rooms.filter((r) => !r.isDirectMessage);
    const dmRooms = rooms.filter((r) => r.isDirectMessage);
    const otherUsers = users.filter((u) => u.id !== currentUser.id);

    const tabs = [
      { id: "rooms" as const, label: "Rooms", count: rooms.length },
      { id: "users" as const, label: "Users", count: otherUsers.length },
      {
        id: "invitations" as const,
        label: "Invites",
        count: invitations.length,
      },
    ];

    return (
      <div className="w-56 bg-chat-surface border-r border-chat-border flex flex-col h-full">
        {/* Header with user info */}
        <div className="p-2 border-b border-chat-border">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowProfile(currentUser.id)}
              className="relative flex items-center gap-1.5 flex-1 min-w-0 hover:bg-chat-elevated rounded-md px-1 py-0.5 -ml-1 transition-colors"
            >
              <div className="relative flex-shrink-0">
                <img
                  src={currentUser.avatar}
                  alt=""
                  className="w-8 h-8 rounded-full bg-chat-elevated"
                />
                <div className="absolute -bottom-0.5 -right-0.5">
                  <StatusDot status={currentUser.status} />
                </div>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-semibold text-white truncate">
                  {currentUser.nickname}
                </p>
                <p className="text-[10px] text-zinc-500 truncate">
                  {currentUser.fullName}
                </p>
              </div>
            </button>
            <button
              onClick={() => {
                logout();
                resetAllStores(app);
              }}
              className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-chat-elevated rounded transition-colors flex-shrink-0"
              title="Logout"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-chat-border">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSidebarView(tab.id)}
              className={`flex-1 px-1 py-1.5 text-[10px] font-medium transition-colors relative ${
                sidebarView === tab.id
                  ? "text-chat-accent"
                  : "text-zinc-500 hover:text-zinc-300"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`ml-1 px-1 py-0.5 text-[9px] rounded-full ${
                    sidebarView === tab.id
                      ? "bg-chat-accent/20 text-chat-accent"
                      : "bg-chat-elevated text-zinc-400"
                  }`}
                >
                  {tab.count}
                </span>
              )}
              {sidebarView === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-chat-accent" />
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-1.5 space-y-2">
          {sidebarView === "rooms" && (
            <>
              {/* Group Rooms */}
              <div>
                <div className="flex items-center justify-between px-1 mb-1">
                  <h3 className="text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">
                    Channels
                  </h3>
                  <button
                    onClick={() => setShowCreateRoom(true)}
                    className="p-0.5 text-zinc-500 hover:text-chat-accent transition-colors"
                    title="Create room"
                  >
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </button>
                </div>
                <div className="space-y-0.5">
                  {groupRooms.length === 0 ? (
                    <p className="px-1.5 py-1 text-[10px] text-zinc-500">
                      No channels yet
                    </p>
                  ) : (
                    groupRooms.map((room) => (
                      <RoomItem
                        key={room.id}
                        room={room}
                        isActive={activeRoomId === room.id}
                        users={users}
                        currentUserId={currentUser.id}
                        isUserActive={isUserActive}
                        onClick={() => selectRoom(room.id)}
                      />
                    ))
                  )}
                </div>
              </div>

              {/* Direct Messages */}
              <div>
                <h3 className="px-1 mb-1 text-[9px] font-semibold text-zinc-500 uppercase tracking-wider">
                  Direct Messages
                </h3>
                <div className="space-y-0.5">
                  {dmRooms.length === 0 ? (
                    <p className="px-1.5 py-1 text-[10px] text-zinc-500">
                      No conversations yet
                    </p>
                  ) : (
                    dmRooms.map((room) => (
                      <RoomItem
                        key={room.id}
                        room={room}
                        isActive={activeRoomId === room.id}
                        users={users}
                        currentUserId={currentUser.id}
                        isUserActive={isUserActive}
                        onClick={() => selectRoom(room.id)}
                      />
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {sidebarView === "users" && (
            <div className="space-y-0.5">
              {otherUsers.length === 0 ? (
                <p className="px-1.5 py-3 text-[10px] text-zinc-500 text-center">
                  No other users online.
                  <br />
                  <span className="text-[9px]">Open another tab to test!</span>
                </p>
              ) : (
                otherUsers.map((user) => (
                  <UserItem
                    key={user.id}
                    user={user}
                    isCurrentUser={user.id === currentUser.id}
                    isOnline={isUserActive(user.id)}
                    onClick={() => startDirectMessage(user.id)}
                    onShowProfile={() => setShowProfile(user.id)}
                  />
                ))
              )}
            </div>
          )}

          {sidebarView === "invitations" && (
            <div className="space-y-1.5">
              {invitations.length === 0 ? (
                <p className="px-1.5 py-3 text-[10px] text-zinc-500 text-center">
                  No pending invitations
                </p>
              ) : (
                invitations.map((inv) => (
                  <InvitationItem
                    key={inv.id}
                    invitation={inv}
                    room={rooms.find((r) => r.id === inv.roomId)}
                    inviter={users.find((u) => u.id === inv.inviterId)}
                    onAccept={() => acceptInvitation(inv.id)}
                    onDecline={() => declineInvitation(inv.id)}
                  />
                ))
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);
