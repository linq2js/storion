import { withStore } from "storion/react";
import { chatStore } from "../stores";
import type { User } from "../types";

// Format date
function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Format last active
function formatLastActive(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  return `${days}d ago`;
}

// Status badge
function StatusBadge({ status }: { status: User["status"] }) {
  const config = {
    online: { color: "bg-chat-online", label: "Online" },
    away: { color: "bg-chat-away", label: "Away" },
    offline: { color: "bg-chat-offline", label: "Offline" },
  };

  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-zinc-400">
      <span className={`w-2 h-2 rounded-full ${config[status].color}`} />
      {config[status].label}
    </span>
  );
}

export const ProfileModal = withStore(
  (ctx) => {
    const [state, actions] = ctx.get(chatStore);
    const user = state.showProfile
      ? (state.users.data ?? []).find((u) => u.id === state.showProfile)
      : null;

    return {
      user,
      isCurrentUser: user?.id === state.currentUser?.id,
      close: () => actions.setShowProfile(null),
      startDirectMessage: actions.startDirectMessage,
    };
  },
  ({ user, isCurrentUser, close, startDirectMessage }) => {
    if (!user) return null;

    const handleMessage = async () => {
      await startDirectMessage(user.id);
      close();
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-2">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={close}
        />

        {/* Modal */}
        <div className="relative bg-chat-surface border border-chat-border rounded-lg shadow-xl w-full max-w-xs animate-slide-up">
          {/* Close button */}
          <button
            onClick={close}
            className="absolute top-2 right-2 p-0.5 text-zinc-400 hover:text-white hover:bg-chat-elevated rounded transition-colors z-10"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Header with avatar */}
          <div className="pt-4 pb-3 px-3 text-center border-b border-chat-border">
            <div className="relative inline-block mb-2">
              <img
                src={user.avatar}
                alt=""
                className="w-16 h-16 rounded-full bg-chat-elevated border-2 border-chat-border"
              />
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full border-2 border-chat-surface flex items-center justify-center"
                style={{ backgroundColor: user.status === "online" ? "#22c55e" : user.status === "away" ? "#eab308" : "#6b7280" }}
              />
            </div>
            <h2 className="text-sm font-semibold text-white">{user.nickname}</h2>
            <p className="text-[10px] text-zinc-500">{user.fullName}</p>
            <div className="mt-1">
              <StatusBadge status={user.status} />
            </div>
          </div>

          {/* Info */}
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-500">Last Active</span>
              <span className="text-zinc-300">{formatLastActive(user.lastActiveAt)}</span>
            </div>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-zinc-500">Joined</span>
              <span className="text-zinc-300">{formatDate(user.createdAt)}</span>
            </div>
          </div>

          {/* Action */}
          {!isCurrentUser && (
            <div className="p-3 pt-0">
              <button
                onClick={handleMessage}
                className="w-full px-2 py-1.5 bg-chat-accent text-white text-xs font-medium rounded-md hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Send Message
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }
);

