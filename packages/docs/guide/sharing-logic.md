# Sharing Store Logic

As your application grows, you'll find patterns that repeat across stores. Storion provides several approaches to share and reuse logic effectively.

## The Problem

When building real applications, you'll encounter these situations:

### 1. Duplicated Store Structure

You need multiple stores with the same shape but for different entity types:

```ts
// ❌ PROBLEM: Copy-pasting the same structure
const userStore = store({
  name: "users",
  state: { items: [] as User[], loading: false, selectedId: null },
  setup({ state }) {
    return {
      setItems: (items: User[]) => {
        state.items = items;
      },
      select: (id: string) => {
        state.selectedId = id;
      },
      // ... same logic repeated
    };
  },
});

const productStore = store({
  name: "products",
  state: { items: [] as Product[], loading: false, selectedId: null },
  setup({ state }) {
    return {
      setItems: (items: Product[]) => {
        state.items = items;
      },
      select: (id: string) => {
        state.selectedId = id;
      },
      // ... same logic repeated again
    };
  },
});

// And again for orders, categories, comments...
```

### 2. Repeated Cross-Cutting Concerns

Every list store needs pagination, selection, or filtering logic:

```ts
// ❌ PROBLEM: Same pagination logic in every list store
const userListStore = store({
  state: { items: [] as User[], page: 0, pageSize: 20, total: 0 },
  setup({ state }) {
    return {
      nextPage: () => {
        if ((state.page + 1) * state.pageSize < state.total) state.page++;
      },
      prevPage: () => {
        if (state.page > 0) state.page--;
      },
      setPage: (page: number) => {
        state.page = page;
      },
    };
  },
});

const productListStore = store({
  state: { items: [] as Product[], page: 0, pageSize: 20, total: 0 },
  setup({ state }) {
    return {
      nextPage: () => {
        // Same logic copy-pasted
        if ((state.page + 1) * state.pageSize < state.total) state.page++;
      },
      prevPage: () => {
        if (state.page > 0) state.page--;
      },
      setPage: (page: number) => {
        state.page = page;
      },
    };
  },
});

// Same for selection, filtering, sorting...
```

## Solutions Overview

| Problem              | Solution            | Description                      |
| -------------------- | ------------------- | -------------------------------- |
| Duplicated structure | **Store Factories** | Same shape, different types      |
| Repeated concerns    | **Mixins**          | Pagination, selection, filtering |
| Cross-store data     | **Composition**     | Access other stores via `get()`  |

## Store Factories

> **Solves:** Duplicated store structure across entity types.

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

## Mixins

> **Solves:** Repeated cross-cutting concerns (pagination, selection, filtering).

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
    // Apply mixin via ctx.mixin() - shares same state context
    const loadingActions = ctx.mixin(withLoadingState);

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

// Selection mixin - generic T is the item type
function withSelection<T extends { id: string }>(
  ctx: SetupContext<{ items: T[]; selectedIds: Set<string> }>
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
    const loading = ctx.mixin(withLoadingState);
    const pagination = ctx.mixin(withPagination);
    const selection = ctx.mixin(withSelection<Product>);

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

## Composition via get()

> **Solves:** Cross-store coordination when stores need to access each other.

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

## Comparison

| Approach        | Shared State | Use Case                        |
| --------------- | ------------ | ------------------------------- |
| **Factory**     | No           | Same structure, different types |
| **Mixin**       | Yes          | Reusable behaviors              |
| **Composition** | Read-only    | Cross-store coordination        |

## Best Practices

### 1. Prefer Mixins for Shared Behaviors

```ts
// ✅ Good: Mixin for cross-cutting concerns
const loading = withLoadingState(ctx);

// ❌ Avoid: Duplicating loading logic in every store
```

### 2. Keep Store Dependencies Shallow

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

### 3. Document Mixin Requirements

```ts
/**
 * Adds loading state management.
 * @requires state.loading - boolean
 * @requires state.error - string | null
 */
function withLoadingState<
  TState extends { loading: boolean; error: string | null }
>(ctx: SetupContext<TState>) {
  // ...
}
```

## Summary

- **Store Factories**: Create multiple stores with the same structure
- **Mixins**: Inject reusable actions into any store (same context)
- **Composition**: Cross-store access via `get()` in setup

Choose based on whether you need shared context (mixin) or separate instances (factory).
