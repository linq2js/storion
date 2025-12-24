/**
 * Async Store - Demonstrates async actions with storion/async
 *
 * Demonstrates:
 * - async.action() for store-bound async state
 * - abortable() for creating signal-aware functions
 * - retry() and catchError() wrappers
 * - dispatch, ensure, refresh, cancel, reset
 * - fresh vs stale modes
 * - Loading states
 */
import { store } from "storion";
import {
  async,
  abortable,
  retry,
  catchError,
  type AsyncState,
} from "storion/async";

// Simulated API with abortable functions
const fakeApi = {
  fetchUser: abortable(async ({}, id: string): Promise<User> => {
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 500));
    if (Math.random() < 0.1) throw new Error("Network error");
    return {
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${id}`,
    };
  }),
  fetchPosts: abortable(async ({}, userId: string): Promise<Post[]> => {
    await new Promise((r) => setTimeout(r, 800 + Math.random() * 400));
    return Array.from({ length: 5 }, (_, i) => ({
      id: `${userId}-${i}`,
      title: `Post ${i + 1} by User ${userId}`,
      body: `This is the content of post ${i + 1}...`,
      likes: Math.floor(Math.random() * 100),
    }));
  }),
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
    // Create async action for fetching user (fresh mode) with retry and error handling
    const [, setUser] = focus("user");
    const robustFetchUser = fakeApi.fetchUser
      .use(retry({ retries: 2, delay: 500 }))
      .use(catchError((error) => console.error("User fetch failed:", error)));

    const userQuery = async.action(focus("user"), robustFetchUser);

    // Create async action for fetching posts (stale mode - keeps previous data)
    const postsQuery = async.action(focus("posts"), fakeApi.fetchPosts);

    return {
      fetchUser: (userId: string) => {
        state.selectedUserId = userId;
        return userQuery.dispatch(userId);
      },
      refreshUser: () => userQuery.refresh(),
      cancelUser: () => userQuery.cancel(),
      resetUser: () => {
        setUser(async.fresh<User>());
      },

      fetchPosts: (userId: string) => postsQuery.dispatch(userId),
      refreshPosts: () => postsQuery.refresh(),

      selectUser: (userId: string) => {
        state.selectedUserId = userId;
        userQuery.dispatch(userId);
        postsQuery.dispatch(userId);
      },
    };
  },
});
