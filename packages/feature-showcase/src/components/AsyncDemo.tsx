/**
 * Async Demo Component
 * Demonstrates async actions with storion/async and withStore pattern
 */
import { memo } from "react";
import { withStore } from "storion/react";
import { asyncStore } from "../stores";

const LoadingSpinner = memo(function LoadingSpinner() {
  return (
    <div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full" />
  );
});

const UserCard = memo(function UserCard({
  user,
  isLoading,
  onRefresh,
}: {
  user?: { id: string; name: string; email: string; avatar: string };
  isLoading: boolean;
  onRefresh: () => void;
}) {
  if (!user && !isLoading) {
    return (
      <div className="bg-zinc-800/50 rounded-xl p-6 border border-zinc-700/50 text-center text-zinc-500">
        No user selected
      </div>
    );
  }

  return (
    <div className="bg-zinc-800/50 rounded-xl p-6 border border-zinc-700/50 relative">
      {isLoading && (
        <div className="absolute inset-0 bg-zinc-900/50 rounded-xl flex items-center justify-center">
          <LoadingSpinner />
        </div>
      )}
      {user && (
        <div className="flex items-center gap-4">
          <img
            src={user.avatar}
            alt={user.name}
            className="w-16 h-16 rounded-full bg-zinc-700"
          />
          <div className="flex-1">
            <h4 className="font-semibold text-lg">{user.name}</h4>
            <p className="text-zinc-400 text-sm">{user.email}</p>
          </div>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg hover:bg-zinc-700 transition-colors disabled:opacity-50"
            title="Refresh"
          >
            🔄
          </button>
        </div>
      )}
    </div>
  );
});

export const AsyncDemo = withStore(
  (ctx) => {
    const [state, actions] = ctx.get(asyncStore);
    return {
      selectedUserId: state.selectedUserId,
      user: state.user,
      posts: state.posts,
      actions,
    };
  },
  ({ selectedUserId, user, posts, actions }) => {
    const userIds = ["1", "2", "3", "4", "5"];

    return (
    <div className="space-y-6">
      {/* User Selection */}
      <div className="flex flex-wrap gap-2">
        {userIds.map((id) => (
          <button
            key={id}
            onClick={() => actions.selectUser(id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedUserId === id
                ? "bg-purple-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            User {id}
          </button>
        ))}
      </div>

      {/* User Card (Fresh Mode) */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-sm font-medium text-zinc-400">
            User (Fresh Mode)
          </h4>
          <span
            className={`px-2 py-0.5 rounded text-xs ${
              user.status === "pending"
                ? "bg-yellow-500/20 text-yellow-400"
                : user.status === "success"
                ? "bg-green-500/20 text-green-400"
                : user.status === "error"
                ? "bg-red-500/20 text-red-400"
                : "bg-zinc-500/20 text-zinc-400"
            }`}
          >
            {user.status}
          </span>
        </div>
        <UserCard
          user={user.data}
          isLoading={user.status === "pending"}
          onRefresh={actions.refreshUser}
        />
        {user.status === "error" && (
          <p className="text-red-400 text-sm mt-2">
            Error: {user.error?.message}
          </p>
        )}
      </div>

      {/* Posts (Stale Mode) */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h4 className="text-sm font-medium text-zinc-400">
            Posts (Stale Mode - keeps previous data)
          </h4>
          <span
            className={`px-2 py-0.5 rounded text-xs ${
              posts.status === "pending"
                ? "bg-yellow-500/20 text-yellow-400"
                : posts.status === "success"
                ? "bg-green-500/20 text-green-400"
                : "bg-zinc-500/20 text-zinc-400"
            }`}
          >
            {posts.status}
          </span>
          {posts.status === "pending" && <LoadingSpinner />}
        </div>
        <div className="space-y-2">
          {posts.data?.map((post) => (
            <div
              key={post.id}
              className={`bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50 transition-opacity ${
                posts.status === "pending" ? "opacity-50" : ""
              }`}
            >
              <h5 className="font-medium">{post.title}</h5>
              <p className="text-zinc-500 text-sm mt-1">{post.body}</p>
              <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
                <span>❤️ {post.likes}</span>
              </div>
            </div>
          ))}
          {posts.data?.length === 0 && posts.status !== "pending" && (
            <p className="text-zinc-500 text-center py-4">No posts yet</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={actions.cancelUser}
          className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 text-sm"
        >
          Cancel User Fetch
        </button>
        <button
          onClick={actions.resetUser}
          className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 text-sm"
        >
          Reset User State
        </button>
        <button
          onClick={actions.refreshPosts}
          className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 text-sm"
        >
          Refresh Posts
        </button>
      </div>
    </div>
    );
  }
);
