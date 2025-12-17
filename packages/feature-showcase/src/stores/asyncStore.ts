/**
 * Async Store - Demonstrates async actions with storion/async
 *
 * Demonstrates:
 * - async() for creating async state
 * - dispatch, ensure, refresh, cancel, reset
 * - fresh vs stale modes
 * - Error handling and retry
 * - Loading states
 */
import { store } from "storion";
import { async, type AsyncState } from "storion/async";

// Simulated API
const fakeApi = {
  fetchUser: async (id: string): Promise<User> => {
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 500));
    if (Math.random() < 0.1) throw new Error("Network error");
    return {
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`,
    };
  },
  fetchPosts: async (userId: string): Promise<Post[]> => {
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
    return Array.from({ length: 5 }, (_, i) => ({
      id: `${userId}-${i}`,
      title: `Post ${i + 1} by User ${userId}`,
      body: `This is the content of post ${i + 1}...`,
      likes: Math.floor(Math.random() * 100),
    }));
  },
};

interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

interface Post {
  id: string;
  title: string;
  body: string;
  likes: number;
}

interface AsyncDemoState {
  user: AsyncState<User, "fresh">;
  posts: AsyncState<Post[], "stale">;
  selectedUserId: string;
}

export const asyncStore = store({
  name: "async-demo",
  state: {
    user: async.fresh<User>(),
    posts: async.stale<Post[]>([]),
    selectedUserId: "1",
  } satisfies AsyncDemoState,
  setup: ({ state, focus }) => {
    // Create async action for fetching user (fresh mode)
    const [, setUser] = focus("user");
    const userActions = async<User, "fresh", [string]>(
      focus("user"),
      async (_ctx, userId) => fakeApi.fetchUser(userId),
      {
        retry: { count: 2, delay: 500 },
        onError: (error) => console.error("User fetch failed:", error),
      }
    );

    // Create async action for fetching posts (stale mode - keeps previous data)
    const postsActions = async<Post[], "stale", [string]>(
      focus("posts"),
      async (_ctx, userId) => fakeApi.fetchPosts(userId)
    );

    return {
      fetchUser: (userId: string) => {
        state.selectedUserId = userId;
        return userActions.dispatch(userId);
      },
      refreshUser: () => userActions.refresh(),
      cancelUser: () => userActions.cancel(),
      resetUser: () => {
        setUser(async.fresh<User>());
      },

      fetchPosts: (userId: string) => postsActions.dispatch(userId),
      refreshPosts: () => postsActions.refresh(),

      selectUser: (userId: string) => {
        state.selectedUserId = userId;
        userActions.dispatch(userId);
        postsActions.dispatch(userId);
      },
    };
  },
});
