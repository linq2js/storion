import { useState } from "react";
import { useContainer, withStore } from "storion/react";
import { authStore, loadInitialData } from "../stores";
import { getAvatarUrl } from "../types";

export const LoginScreen = withStore(
  (ctx) => {
    const [, actions] = ctx.get(authStore);
    return { login: actions.login };
  },
  ({ login }) => {
    const app = useContainer();
    const [nickname, setNickname] = useState("");
    const [fullName, setFullName] = useState("");
    const [isLoading, setIsLoading] = useState(false);

    const previewAvatar = nickname.trim() ? getAvatarUrl(nickname.trim()) : null;

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!nickname.trim() || !fullName.trim()) return;

      setIsLoading(true);
      try {
        await login(nickname.trim(), fullName.trim());
        await loadInitialData(app);
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <div className="bg-chat-bg flex items-center justify-center p-2" style={{ minHeight: "var(--vh, 100vh)" }}>
        {/* Background decoration */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 -left-24 w-64 h-64 bg-chat-accent/10 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 -right-24 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative w-full max-w-xs">
          {/* Header */}
          <div className="text-center mb-4">
            <div className="inline-flex items-center justify-center w-10 h-10 bg-gradient-to-br from-chat-accent to-purple-600 rounded-lg mb-2 shadow-lg shadow-chat-accent/20">
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-white mb-1">Storion Chat</h1>
            <p className="text-xs text-zinc-400">
              Real-time messaging with cross-tab sync
            </p>
          </div>

          {/* Login form */}
          <form
            onSubmit={handleSubmit}
            className="bg-chat-surface border border-chat-border rounded-lg p-3 shadow-xl"
          >
            {/* Avatar preview */}
            {previewAvatar && (
              <div className="flex justify-center mb-3">
                <div className="relative">
                  <img
                    src={previewAvatar}
                    alt="Avatar preview"
                    className="w-16 h-16 rounded-full bg-chat-elevated border-2 border-chat-accent/30 shadow-lg"
                  />
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-chat-online rounded-full border-2 border-chat-surface" />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div>
                <label
                  htmlFor="nickname"
                  className="block text-[10px] font-medium text-zinc-300 mb-1"
                >
                  Nickname
                </label>
                <input
                  id="nickname"
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Choose a unique nickname"
                  className="w-full px-2 py-1.5 bg-chat-elevated border border-chat-border rounded-md text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-chat-accent/50 focus:border-chat-accent transition-all"
                  required
                  autoFocus
                />
                <p className="mt-1 text-[9px] text-zinc-500">
                  This will be used to generate your avatar
                </p>
              </div>

              <div>
                <label
                  htmlFor="fullName"
                  className="block text-[10px] font-medium text-zinc-300 mb-1"
                >
                  Full Name
                </label>
                <input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Enter your display name"
                  className="w-full px-2 py-1.5 bg-chat-elevated border border-chat-border rounded-md text-xs text-white placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-chat-accent/50 focus:border-chat-accent transition-all"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading || !nickname.trim() || !fullName.trim()}
                className="w-full mt-1 px-2 py-1.5 bg-gradient-to-r from-chat-accent to-purple-600 text-white text-xs font-semibold rounded-md hover:opacity-90 focus:outline-none focus:ring-1 focus:ring-chat-accent/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-chat-accent/20"
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="none"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Joining...
                  </span>
                ) : (
                  "Join Chat"
                )}
              </button>
            </div>
          </form>

          {/* Footer */}
          <p className="text-center mt-3 text-[10px] text-zinc-500">
            Open multiple tabs to test real-time sync
          </p>
        </div>
      </div>
    );
  }
);
