import { useState } from "react";
import { withStore } from "storion/react";
import { authStore, usersStore, roomsStore, invitationsStore, chatUIStore } from "../stores";
import type { User } from "../types";

export const InviteUserModal = withStore(
  (ctx) => {
    const [authState] = ctx.get(authStore);
    const [usersState] = ctx.get(usersStore);
    const [roomsState] = ctx.get(roomsStore);
    const [, invitationsActions] = ctx.get(invitationsStore);
    const [chatUIState, chatUIActions] = ctx.get(chatUIStore);

    const activeRoom = (roomsState.rooms.data ?? []).find((r) => r.id === roomsState.activeRoomId);
    const usersNotInRoom = (usersState.users.data ?? []).filter(
      (u) =>
        u.id !== authState.currentUser?.id && !activeRoom?.members.includes(u.id)
    );

    return {
      show: chatUIState.showInviteUser,
      setShow: chatUIActions.setShowInviteUser,
      activeRoom,
      usersNotInRoom,
      inviteUser: invitationsActions.inviteUserToRoom,
    };
  },
  ({ show, setShow, activeRoom, usersNotInRoom, inviteUser }) => {
    const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    if (!show || !activeRoom) return null;

    const handleInvite = async () => {
      if (!selectedUserId) return;

      setIsLoading(true);
      try {
        await inviteUser(selectedUserId, activeRoom.id);
        setSelectedUserId(null);
      } finally {
        setIsLoading(false);
      }
    };

    const handleClose = () => {
      setShow(false);
      setSelectedUserId(null);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleClose}
        />

        {/* Modal */}
        <div className="relative bg-chat-surface border border-chat-border rounded-lg shadow-xl w-full max-w-sm animate-slide-up">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-chat-border">
            <div>
              <h2 className="text-sm font-semibold text-white">Invite to Room</h2>
              <p className="text-[10px] text-zinc-500">{activeRoom.name}</p>
            </div>
            <button
              onClick={handleClose}
              className="p-0.5 text-zinc-400 hover:text-white hover:bg-chat-elevated rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-3">
            {usersNotInRoom.length === 0 ? (
              <div className="text-center py-4">
                <div className="w-10 h-10 bg-chat-elevated rounded-full flex items-center justify-center mx-auto mb-2">
                  <svg
                    className="w-5 h-5 text-zinc-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <p className="text-xs text-zinc-400">No users available to invite</p>
                <p className="text-[10px] text-zinc-600 mt-0.5">
                  All users are already in this room
                </p>
              </div>
            ) : (
              <>
                <p className="text-[10px] text-zinc-400 mb-2">
                  Select a user to invite to this room:
                </p>

                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {usersNotInRoom.map((user: User) => (
                    <button
                      key={user.id}
                      onClick={() => setSelectedUserId(user.id)}
                      className={`w-full flex items-center gap-2 p-1.5 rounded-md transition-all ${
                        selectedUserId === user.id
                          ? "bg-chat-accent/20 border border-chat-accent"
                          : "bg-chat-elevated border border-transparent hover:border-chat-border"
                      }`}
                    >
                      <img
                        src={user.avatar}
                        alt=""
                        className="w-6 h-6 rounded-full bg-chat-bg"
                      />
                      <div className="flex-1 text-left">
                        <p className="text-xs font-medium text-white">{user.nickname}</p>
                        <p className="text-[10px] text-zinc-500">{user.fullName}</p>
                      </div>
                      {selectedUserId === user.id && (
                        <svg
                          className="w-4 h-4 text-chat-accent"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="flex-1 px-2 py-1.5 bg-chat-elevated text-zinc-300 text-xs font-medium rounded-md hover:bg-chat-border transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleInvite}
                    disabled={isLoading || !selectedUserId}
                    className="flex-1 px-2 py-1.5 bg-chat-accent text-white text-xs font-medium rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  >
                    {isLoading ? "Sending..." : "Send Invite"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
);
