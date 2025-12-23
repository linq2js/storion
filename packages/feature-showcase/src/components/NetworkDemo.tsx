/**
 * Network Demo
 * Demonstrates network connectivity state and retry logic
 */
import { memo, useState } from "react";
import { store, useStore } from "storion/react";
import { async } from "storion/async";
import { networkRetryService, networkStore } from "storion/network";

// =============================================================================
// API Store - fetches data with network-aware retry
// =============================================================================

interface Post {
  id: number;
  title: string;
  body: string;
  userId: number;
}

const apiStore = store({
  name: "api-demo",
  state: {
    /** Current post data */
    post: async.fresh<Post>(),
  },
  setup({ focus, get }) {
    const networkRetry = get(networkRetryService);
    // Use *Query for read operations
    const postQuery = async(
      focus("post"),
      async (ctx, postId: number) => {
        const response = await fetch(
          `https://jsonplaceholder.typicode.com/posts/${postId}`,
          { signal: ctx.signal }
        );
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        return response.json();
      },
      {
        // Retry with network-aware delay
        retry: networkRetry.delay(),
        onError: (error) => {
          console.error("API Error:", error);
        },
      }
    );

    return {
      /** Fetch a post by ID */
      fetchPost: postQuery.dispatch,
      /** Retry the last fetch */
      retry: postQuery.refresh,
      /** Reset to idle state */
      reset: postQuery.reset,
    };
  },
});

// =============================================================================
// Components
// =============================================================================

export const NetworkDemo = memo(function NetworkDemo() {
  return (
    <div className="space-y-6">
      <NetworkStatus />
      <ApiTester />
    </div>
  );
});

const NetworkStatus = memo(function NetworkStatus() {
  const { online } = useStore(({ get }) => {
    const [state] = get(networkStore);
    return { online: state.online };
  });

  return (
    <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
      <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
        🌐 Network Status
      </h3>
      <div className="flex items-center gap-3">
        <div
          className={`w-3 h-3 rounded-full ${
            online ? "bg-green-500 animate-pulse" : "bg-red-500"
          }`}
        />
        <span className={online ? "text-green-400" : "text-red-400"}>
          {online ? "Online" : "Offline"}
        </span>
        <span className="text-zinc-500 text-sm">
          {online
            ? "All systems operational"
            : "Waiting for network connection..."}
        </span>
      </div>
      <p className="text-xs text-zinc-600 mt-3">
        💡 Try disabling your network to see the offline state. Requests will
        automatically retry when back online.
      </p>
    </div>
  );
});

const ApiTester = memo(function ApiTester() {
  const [postId, setPostId] = useState(1);

  const { post, online, fetchPost, retry, reset } = useStore(({ get }) => {
    const [apiState, apiActions] = get(apiStore);
    const [networkState] = get(networkStore);
    return {
      post: apiState.post,
      online: networkState.online,
      fetchPost: apiActions.fetchPost,
      retry: apiActions.retry,
      reset: apiActions.reset,
    };
  });

  const handleFetch = () => {
    fetchPost(postId);
  };

  const handleNextPost = () => {
    const nextId = postId < 100 ? postId + 1 : 1;
    setPostId(nextId);
    fetchPost(nextId);
  };

  return (
    <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
        📡 API Request Demo
      </h3>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-zinc-400">Post ID:</label>
          <input
            type="number"
            min={1}
            max={100}
            value={postId}
            onChange={(e) => setPostId(Number(e.target.value) || 1)}
            className="w-20 px-3 py-2 bg-zinc-900 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-purple-500"
          />
        </div>

        <button
          onClick={handleFetch}
          disabled={post.status === "pending"}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-700 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          {post.status === "pending" ? (
            <span className="flex items-center gap-2">
              <Spinner /> Fetching...
            </span>
          ) : (
            "Fetch Post"
          )}
        </button>

        <button
          onClick={handleNextPost}
          disabled={post.status === "pending"}
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:cursor-not-allowed rounded-lg text-sm font-medium transition-colors"
        >
          Next Post →
        </button>

        {post.status === "error" && (
          <button
            onClick={() => retry()}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded-lg text-sm font-medium transition-colors"
          >
            🔄 Retry
          </button>
        )}

        {post.status !== "idle" && (
          <button
            onClick={reset}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded-lg text-sm font-medium transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Status Badge */}
      <div className="mb-4">
        <StatusBadge status={post.status} online={online} />
      </div>

      {/* Result */}
      <div className="bg-zinc-900/50 rounded-lg p-4 min-h-[150px]">
        {post.status === "idle" && (
          <div className="text-zinc-500 text-center py-8">
            <p>👆 Click "Fetch Post" to make an API request</p>
            <p className="text-xs mt-2">
              Uses JSONPlaceholder API with network-aware retry
            </p>
          </div>
        )}

        {post.status === "pending" && (
          <div className="flex flex-col items-center justify-center py-8 text-zinc-400">
            <Spinner className="w-8 h-8 mb-2" />
            <p>Loading post #{postId}...</p>
            {!online && (
              <p className="text-xs text-orange-400 mt-2">
                ⏳ Waiting for network connection...
              </p>
            )}
          </div>
        )}

        {post.status === "error" && (
          <div className="text-red-400 py-4">
            <p className="font-semibold mb-2">❌ Error</p>
            <p className="text-sm">{String(post.error)}</p>
            {!online && (
              <p className="text-xs text-orange-400 mt-3">
                🔌 You appear to be offline. Request will retry automatically
                when back online.
              </p>
            )}
          </div>
        )}

        {post.status === "success" && post.data && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span className="px-2 py-1 bg-green-900/50 text-green-400 rounded">
                POST #{post.data.id}
              </span>
              <span>User #{post.data.userId}</span>
            </div>
            <h4 className="font-semibold text-lg">{post.data.title}</h4>
            <p className="text-zinc-400 text-sm leading-relaxed">
              {post.data.body}
            </p>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-4 text-xs text-zinc-600 space-y-1">
        <p>
          🔄 <strong>Auto-retry:</strong> Requests retry up to 3 times with
          exponential backoff
        </p>
        <p>
          📶 <strong>Network-aware:</strong> If offline, waits for connection
          before retrying
        </p>
        <p>
          🎯 <strong>Cancelable:</strong> New requests automatically cancel
          pending ones
        </p>
      </div>
    </div>
  );
});

const StatusBadge = memo(function StatusBadge({
  status,
  online,
}: {
  status: string;
  online: boolean;
}) {
  const badges: Record<string, { color: string; label: string }> = {
    idle: { color: "bg-zinc-700 text-zinc-300", label: "Idle" },
    pending: {
      color: "bg-blue-900/50 text-blue-400",
      label: online ? "Loading" : "Waiting for network",
    },
    success: { color: "bg-green-900/50 text-green-400", label: "Success" },
    error: { color: "bg-red-900/50 text-red-400", label: "Error" },
  };

  const badge = badges[status] || badges.idle;

  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-medium ${badge.color}`}
    >
      {badge.label}
    </span>
  );
});

const Spinner = memo(function Spinner({
  className = "w-4 h-4",
}: {
  className?: string;
}) {
  return (
    <svg
      className={`animate-spin ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
});
