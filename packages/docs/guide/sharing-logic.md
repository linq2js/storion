# Sharing Store Logic

As your application grows, you'll find patterns that repeat across stores. Storion provides several approaches to share and reuse logic effectively.

**Time to read:** ~12 minutes

---

## Overview

| Approach | Use Case | Shared Context |
|----------|----------|----------------|
| **Store Factories** | Same structure, different instances | No (separate stores) |
| **Mixins** | Reusable actions/state chunks | Yes (same store) |
| **Store Pools** | Dynamic store creation by key | No (separate stores) |
| **Composition** | Cross-store coordination | Via `get()` |

---

## Store Factories

> **Analogy:** Like a cookie cutter — same shape, different cookies.

When multiple stores share the same structure but manage different data, create a factory function:

### The Pattern

```ts
import { store } from "storion/react";

// Factory function that creates store specs
function createEntityStore<T extends { id: string }>(name: string) {
  return store({
    name,
    state: {
      items: [] as T[],
      loading: false,
      selectedId: null as string | null,
    },
    setup({ state }) {
      return {
        setItems: (items: T[]) => {
          state.items = items;
        },
        select: (id: string) => {
          state.selectedId = id;
        },
        getSelected: () => {
          return state.items.find((item) => item.id === state.selectedId);
        },
      };
    },
  });
}

// Create specific stores from the factory
const userStore = createEntityStore<User>("users");
const productStore = createEntityStore<Product>("products");
const orderStore = createEntityStore<Order>("orders");
```

### Using Factory Stores

```tsx
function UserList() {
  const { users, select } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    return {
      users: state.items,
      select: actions.select,
    };
  });

  return (
    <ul>
      {users.map((user) => (
        <li key={user.id} onClick={() => select(user.id)}>
          {user.name}
        </li>
      ))}
    </ul>
  );
}
```

### When to Use

- CRUD stores for different entity types
- Feature stores with identical structure
- Stores that differ only in their data type

---

## Mixins

> **Analogy:** Like ingredients you can add to any recipe.

Mixins let you inject reusable state and actions into any store. They share the store's context.

### Creating a Mixin

```ts
import { store, type SetupContext } from "storion/react";

// Mixin: adds loading/error state and helpers
function withLoadingState<TState extends object>(
  ctx: SetupContext<TState & { loading: boolean; error: string | null }>
) {
  const { state } = ctx;

  return {
    /** Start loading, clear previous error */
    startLoading: () => {
      state.loading = true;
      state.error = null;
    },
    /** Stop loading */
    stopLoading: () => {
      state.loading = false;
    },
    /** Set error and stop loading */
    setError: (error: string) => {
      state.error = error;
      state.loading = false;
    },
    /** Wrap async operation with loading state */
    withLoading: async <T>(operation: () => Promise<T>): Promise<T | null> => {
      state.loading = true;
      state.error = null;
      try {
        const result = await operation();
        state.loading = false;
        return result;
      } catch (e) {
        state.error = e instanceof Error ? e.message : "Unknown error";
        state.loading = false;
        return null;
      }
    },
  };
}
```

### Using Mixins in Stores

```ts
const userStore = store({
  name: "user",
  state: {
    user: null as User | null,
    // Mixin requires these fields
    loading: false,
    error: null as string | null,
  },
  setup(ctx) {
    const { state } = ctx;
    // Apply mixin - shares same state context
    const loadingActions = withLoadingState(ctx);

    return {
      ...loadingActions,

      fetchUser: async (id: string) => {
        const user = await loadingActions.withLoading(async () => {
          const res = await fetch(`/api/users/${id}`);
          return res.json();
        });
        if (user) state.user = user;
      },
    };
  },
});
```

### Composing Multiple Mixins

```ts
// Pagination mixin
function withPagination<TState extends object>(
  ctx: SetupContext<TState & { page: number; pageSize: number; total: number }>
) {
  const { state } = ctx;
  return {
    nextPage: () => {
      if ((state.page + 1) * state.pageSize < state.total) {
        state.page++;
      }
    },
    prevPage: () => {
      if (state.page > 0) state.page--;
    },
    setPage: (page: number) => {
      state.page = page;
    },
  };
}

// Selection mixin
function withSelection<TState extends object, T extends { id: string }>(
  ctx: SetupContext<TState & { items: T[]; selectedIds: Set<string> }>
) {
  const { state, update } = ctx;
  return {
    select: (id: string) => {
      update((draft) => {
        draft.selectedIds.add(id);
      });
    },
    deselect: (id: string) => {
      update((draft) => {
        draft.selectedIds.delete(id);
      });
    },
    toggleSelection: (id: string) => {
      update((draft) => {
        if (draft.selectedIds.has(id)) {
          draft.selectedIds.delete(id);
        } else {
          draft.selectedIds.add(id);
        }
      });
    },
    selectAll: () => {
      update((draft) => {
        state.items.forEach((item) => draft.selectedIds.add(item.id));
      });
    },
    clearSelection: () => {
      update((draft) => {
        draft.selectedIds.clear();
      });
    },
    getSelected: () => {
      return state.items.filter((item) => state.selectedIds.has(item.id));
    },
  };
}

// Combine all mixins
const productListStore = store({
  name: "productList",
  state: {
    items: [] as Product[],
    // Loading mixin
    loading: false,
    error: null as string | null,
    // Pagination mixin
    page: 0,
    pageSize: 20,
    total: 0,
    // Selection mixin
    selectedIds: new Set<string>(),
  },
  setup(ctx) {
    const { state } = ctx;
    const loading = withLoadingState(ctx);
    const pagination = withPagination(ctx);
    const selection = withSelection<typeof ctx.state, Product>(ctx);

    return {
      ...loading,
      ...pagination,
      ...selection,

      fetchProducts: async () => {
        const data = await loading.withLoading(async () => {
          const res = await fetch(
            `/api/products?page=${state.page}&size=${state.pageSize}`
          );
          return res.json();
        });
        if (data) {
          state.items = data.items;
          state.total = data.total;
        }
      },
    };
  },
});
```

### When to Use Mixins

- Cross-cutting concerns (loading, error handling, pagination)
- Shared behavior that needs access to store context
- Building blocks that combine to form complete stores

---

## Store Pools

> **Analogy:** Like a vending machine — select a key, get a store.

Use [`pool()`](/api/pool) for dynamic store creation when you don't know all stores at compile time.

### The Pattern

```ts
import { store, pool } from "storion/react";

// Define a store factory
const createChatRoomStore = (roomId: string) =>
  store({
    name: `chatRoom:${roomId}`,
    state: {
      messages: [] as Message[],
      participants: [] as User[],
      typing: [] as string[],
    },
    setup({ state }) {
      return {
        addMessage: (msg: Message) => {
          state.messages = [...state.messages, msg];
        },
        setTyping: (userId: string, isTyping: boolean) => {
          if (isTyping && !state.typing.includes(userId)) {
            state.typing = [...state.typing, userId];
          } else if (!isTyping) {
            state.typing = state.typing.filter((id) => id !== userId);
          }
        },
      };
    },
  });

// Create a pool of chat room stores
const chatRoomPool = pool(createChatRoomStore);
```

### Using Pool Stores in Components

```tsx
function ChatRoom({ roomId }: { roomId: string }) {
  const { messages, addMessage } = useStore(({ get }) => {
    // Get or create the store for this room
    const roomStore = chatRoomPool.get(roomId);
    const [state, actions] = get(roomStore);

    return {
      messages: state.messages,
      addMessage: actions.addMessage,
    };
  });

  return (
    <div>
      <MessageList messages={messages} />
      <MessageInput onSend={addMessage} />
    </div>
  );
}
```

### Pool with Complex Keys

```ts
import { pool } from "storion/react";

// Store per user-channel combination
type ChannelKey = { userId: string; channelId: string };

const channelStorePool = pool(
  (key: ChannelKey) =>
    store({
      name: `channel:${key.userId}:${key.channelId}`,
      state: { unreadCount: 0, lastRead: null as Date | null },
      setup({ state }) {
        return {
          markRead: () => {
            state.unreadCount = 0;
            state.lastRead = new Date();
          },
        };
      },
    }),
  {
    // Use keyOf for O(1) lookup with object keys
    keyOf: (key) => `${key.userId}:${key.channelId}`,
  }
);

// Usage
function ChannelBadge({ userId, channelId }: ChannelKey) {
  const { unreadCount } = useStore(({ get }) => {
    const channelStore = channelStorePool.get({ userId, channelId });
    const [state] = get(channelStore);
    return { unreadCount: state.unreadCount };
  });

  return unreadCount > 0 ? <Badge count={unreadCount} /> : null;
}
```

### Pool with Auto-Dispose

```ts
const formStorePool = pool(
  (formId: string) =>
    store({
      name: `form:${formId}`,
      state: { values: {}, errors: {}, dirty: false },
      setup({ state }) {
        return {
          setValue: (field: string, value: unknown) => {
            state.values[field] = value;
            state.dirty = true;
          },
          dispose: () => {
            // Cleanup when form is removed from pool
            console.log(`Form ${formId} disposed`);
          },
        };
      },
    }),
  {
    // Auto-call dispose() when items are removed
    autoDispose: true,
  }
);

// Later: cleanup unused forms
formStorePool.delete("checkout-form"); // Calls store's dispose()
```

### When to Use Pools

- Entity-specific stores (chat rooms, user profiles, documents)
- Dynamic forms with independent state
- Multi-tenant scenarios
- Any case where store identity is determined at runtime

---

## Composition via get()

> **Analogy:** Like departments in a company — independent but coordinating.

Stores can access other stores via `get()` in setup for cross-store coordination.

### The Pattern

```ts
const authStore = store({
  name: "auth",
  state: {
    token: null as string | null,
    user: null as User | null,
  },
  setup({ state }) {
    return {
      setAuth: (token: string, user: User) => {
        state.token = token;
        state.user = user;
      },
      logout: () => {
        state.token = null;
        state.user = null;
      },
    };
  },
});

const apiStore = store({
  name: "api",
  state: {},
  setup({ get }) {
    // Access auth store
    const [authState] = get(authStore);

    return {
      fetch: async (url: string, options?: RequestInit) => {
        const headers = new Headers(options?.headers);

        // Use auth token from auth store
        if (authState.token) {
          headers.set("Authorization", `Bearer ${authState.token}`);
        }

        return fetch(url, { ...options, headers });
      },
    };
  },
});

const userProfileStore = store({
  name: "userProfile",
  state: {
    profile: null as UserProfile | null,
    loading: false,
  },
  setup({ state, get }) {
    const [, apiActions] = get(apiStore);
    const [authState, authActions] = get(authStore);

    return {
      fetchProfile: async () => {
        if (!authState.user) return;

        state.loading = true;
        try {
          const res = await apiActions.fetch(
            `/api/users/${authState.user.id}/profile`
          );
          state.profile = await res.json();
        } finally {
          state.loading = false;
        }
      },

      updateProfile: async (updates: Partial<UserProfile>) => {
        if (!authState.user) return;

        const res = await apiActions.fetch(
          `/api/users/${authState.user.id}/profile`,
          {
            method: "PATCH",
            body: JSON.stringify(updates),
          }
        );
        state.profile = await res.json();
      },
    };
  },
});
```

### Dependency Direction

::: warning Important
Store dependencies flow in one direction. A `keepAlive` store cannot depend on an `autoDispose` store.
:::

```ts
// ✅ CORRECT: autoDispose can depend on keepAlive
const sessionStore = store({ lifetime: "keepAlive", ... });
const pageStore = store({
  lifetime: "autoDispose",
  setup({ get }) {
    get(sessionStore); // OK
  }
});

// ❌ WRONG: keepAlive cannot depend on autoDispose
const tempStore = store({ lifetime: "autoDispose", ... });
const globalStore = store({
  lifetime: "keepAlive",
  setup({ get }) {
    get(tempStore); // THROWS!
  }
});
```

---

## Comparison

| Approach | Shared State | Dynamic | Use Case |
|----------|-------------|---------|----------|
| **Factory** | No | Compile-time | Same structure, different types |
| **Mixin** | Yes | No | Reusable behaviors |
| **Pool** | No | Runtime | Key-based store instances |
| **Composition** | Read-only | No | Cross-store coordination |

---

## Best Practices

### 1. Prefer Mixins for Shared Behaviors

```ts
// ✅ Good: Mixin for cross-cutting concerns
const loading = withLoadingState(ctx);

// ❌ Avoid: Duplicating loading logic in every store
```

### 2. Use Pools for Runtime-Determined Stores

```ts
// ✅ Good: Pool when store identity is dynamic
const chatStore = chatRoomPool.get(roomId);

// ❌ Avoid: Creating stores inline in components
const [store] = useState(() => store({ ... }));
```

### 3. Keep Store Dependencies Shallow

```ts
// ✅ Good: Direct dependencies
setup({ get }) {
  const [authState] = get(authStore);
}

// ❌ Avoid: Deep dependency chains
setup({ get }) {
  const [a] = get(storeA); // depends on B
  const [b] = get(storeB); // depends on C
  const [c] = get(storeC); // depends on D...
}
```

### 4. Document Mixin Requirements

```ts
/**
 * Adds loading state management.
 * @requires state.loading - boolean
 * @requires state.error - string | null
 */
function withLoadingState<TState extends { loading: boolean; error: string | null }>(
  ctx: SetupContext<TState>
) {
  // ...
}
```

---

## Summary

- **Store Factories**: Create multiple stores with the same structure
- **Mixins**: Inject reusable actions into any store (same context)
- **Store Pools**: Dynamic store creation by key (separate contexts)
- **Composition**: Cross-store access via `get()` in setup

Choose based on whether you need shared context (mixin) or separate instances (factory/pool), and whether store identity is known at compile-time (factory) or runtime (pool).

