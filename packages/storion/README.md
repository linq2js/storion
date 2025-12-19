<p align="center">
  <img src="https://raw.githubusercontent.com/linq2js/storion/main/.github/logo.svg" alt="Storion Logo" width="120" height="120" />
</p>

<h1 align="center">Storion</h1>

<p align="center">
  <strong>Reactive stores for modern apps. Type-safe. Auto-tracked. Effortlessly composable.</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/storion"><img src="https://img.shields.io/npm/v/storion?style=flat-square&color=blue" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/storion"><img src="https://img.shields.io/bundlephobia/minzip/storion?style=flat-square&color=green" alt="bundle size"></a>
  <a href="https://github.com/linq2js/storion/actions"><img src="https://img.shields.io/github/actions/workflow/status/linq2js/storion/ci.yml?style=flat-square&label=tests" alt="tests"></a>
  <a href="https://github.com/linq2js/storion/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/storion?style=flat-square" alt="license"></a>
  <a href="https://github.com/linq2js/storion"><img src="https://img.shields.io/github/stars/linq2js/storion?style=flat-square" alt="stars"></a>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#usage">Usage</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## What is Storion?

Storion is a lightweight state management library with **automatic dependency tracking**:

- **You read state** → Storion tracks the read
- **That read changes** → only then your effect/component updates

No manual selectors to "optimize", no accidental over-subscription to large objects. Just write natural code and let Storion handle the reactivity.

```tsx
// Component only re-renders when `count` actually changes
function Counter() {
  const { count, inc } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    return { count: state.count, inc: actions.inc };
  });

  return <button onClick={inc}>{count}</button>;
}
```

---

## Features

- 🎯 **Auto-tracking** — Dependencies tracked automatically when you read state
- 🔒 **Type-safe** — Full TypeScript support with excellent inference
- ⚡ **Fine-grained updates** — Only re-render what actually changed
- 🧩 **Composable** — Mix stores, use DI, create derived values
- 🔄 **Reactive effects** — Side effects that automatically respond to state changes
- 📦 **Tiny footprint** — ~4KB minified + gzipped
- 🛠️ **DevTools** — Built-in devtools panel for debugging
- 🔌 **Middleware** — Extensible with conditional middleware patterns
- ⏳ **Async helpers** — First-class async state management with cancellation

---

## Installation

```bash
# npm
npm install storion

# pnpm
pnpm add storion

# yarn
yarn add storion
```

**Peer dependency:** React is optional, required only if using `storion/react`.

```bash
# If using React integration
npm install storion react
```

---

## Quick Start

### Option 1: Single Store with `create()` (Simplest)

Perfect for small apps or isolated features:

```tsx
import { create } from "storion/react";

const [counter, useCounter] = create({
  name: "counter",
  state: { count: 0 },
  setup({ state }) {
    return {
      inc: () => state.count++,
      dec: () => state.count--,
    };
  },
});

// Use in React
function Counter() {
  const { count, inc, dec } = useCounter((state, actions) => ({
    count: state.count,
    inc: actions.inc,
    dec: actions.dec,
  }));

  return (
    <div>
      <button onClick={dec}>-</button>
      <span>{count}</span>
      <button onClick={inc}>+</button>
    </div>
  );
}

// Use outside React
counter.actions.inc();
console.log(counter.state.count);
```

### Option 2: Multi-Store with Container (Scalable)

Best for larger apps with multiple stores:

```tsx
import { store, container } from "storion";
import { StoreProvider, useStore } from "storion/react";

// Define stores
const authStore = store({
  name: "auth",
  state: { userId: null as string | null },
  setup({ state }) {
    return {
      login: (id: string) => {
        state.userId = id;
      },
      logout: () => {
        state.userId = null;
      },
    };
  },
});

const todosStore = store({
  name: "todos",
  state: { items: [] as string[] },
  setup({ state, update }) {
    return {
      add: (text: string) => {
        update((draft) => {
          draft.items.push(text);
        });
      },
      remove: (index: number) => {
        update((draft) => {
          draft.items.splice(index, 1);
        });
      },
    };
  },
});

// Create container
const app = container();

// Provide to React
function App() {
  return (
    <StoreProvider container={app}>
      <Screen />
    </StoreProvider>
  );
}

// Consume multiple stores
function Screen() {
  const { userId, items, add, login } = useStore(({ get }) => {
    const [auth, authActions] = get(authStore);
    const [todos, todosActions] = get(todosStore);
    return {
      userId: auth.userId,
      items: todos.items,
      add: todosActions.add,
      login: authActions.login,
    };
  });

  return (
    <div>
      <p>User: {userId ?? "Not logged in"}</p>
      <button onClick={() => login("user-1")}>Login</button>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
      <button onClick={() => add("New todo")}>Add Todo</button>
    </div>
  );
}
```

---

## Usage

### Defining a Store

**The problem:** You have related pieces of state and operations that belong together, but managing them with `useState` leads to scattered logic and prop drilling.

**With Storion:** Group state and actions in a single store. Actions have direct access to state, and the store can be shared across your app.

```ts
import { store } from "storion";

export const userStore = store({
  name: "user",
  state: {
    profile: { name: "", email: "" },
    theme: "light" as "light" | "dark",
  },
  setup({ state, update }) {
    return {
      // Direct mutation - only works for first-level properties
      setTheme: (theme: "light" | "dark") => {
        state.theme = theme;
      },

      // For nested state, use update() with immer-style draft
      setName: (name: string) => {
        update((draft) => {
          draft.profile.name = name;
        });
      },

      // Batch update multiple nested properties
      updateProfile: (profile: Partial<typeof state.profile>) => {
        update((draft) => {
          Object.assign(draft.profile, profile);
        });
      },
    };
  },
});
```

> **Important:** Direct mutation (`state.prop = value`) only works for **first-level properties**. For nested state or array mutations, always use `update()` which provides an immer-powered draft.

### Using Focus (Lens-like State Access)

**The problem:** Updating deeply nested state is verbose. You end up writing `update(draft => { draft.a.b.c = value })` repeatedly, or creating many small `update()` calls.

**With Storion:** `focus()` gives you a getter/setter pair for any path. The setter supports direct values, reducers, and immer-style mutations.

```ts
import { store } from "storion";

export const settingsStore = store({
  name: "settings",
  state: {
    user: { name: "", email: "" },
    preferences: {
      theme: "light" as "light" | "dark",
      notifications: true,
    },
  },
  setup({ focus }) {
    // Focus on nested paths - returns [getter, setter]
    const [getTheme, setTheme] = focus("preferences.theme");
    const [getUser, setUser] = focus("user");

    return {
      // Direct value
      setTheme,

      // Reducer - returns new value
      toggleTheme: () => {
        setTheme((prev) => (prev === "light" ? "dark" : "light"));
      },

      // Produce - immer-style mutation (no return)
      updateUserName: (name: string) => {
        setUser((draft) => {
          draft.name = name;
        });
      },

      // Getter is reactive - can be used in effects
      getTheme,
    };
  },
});
```

**Focus setter supports three patterns:**

| Pattern      | Example                         | Use when                      |
| ------------ | ------------------------------- | ----------------------------- |
| Direct value | `set(newValue)`                 | Replacing entire value        |
| Reducer      | `set(prev => newValue)`         | Computing from previous       |
| Produce      | `set(draft => { draft.x = y })` | Partial updates (immer-style) |

### Reactive Effects

**The problem:** You need to sync with external systems (WebSocket, localStorage) or compute derived state when dependencies change, and properly clean up when needed.

**With Storion:** Effects automatically track which state properties you read and re-run only when those change. Use them for side effects or computed state.

**Example 1: Computed/Derived State**

```ts
import { store, effect } from "storion";

export const userStore = store({
  name: "user",
  state: {
    firstName: "",
    lastName: "",
    fullName: "", // Computed from firstName + lastName
  },
  setup({ state }) {
    // Auto-updates fullName when firstName or lastName changes
    effect(() => {
      state.fullName = `${state.firstName} ${state.lastName}`.trim();
    });

    return {
      setFirstName: (name: string) => {
        state.firstName = name;
      },
      setLastName: (name: string) => {
        state.lastName = name;
      },
    };
  },
});
```

**Example 2: External System Sync**

```ts
import { store, effect } from "storion";

export const syncStore = store({
  name: "sync",
  state: {
    userId: null as string | null,
    syncStatus: "idle" as "idle" | "syncing" | "synced",
  },
  setup({ state }) {
    effect((ctx) => {
      if (!state.userId) return;

      const ws = new WebSocket(`/ws?user=${state.userId}`);
      state.syncStatus = "syncing";

      ws.onopen = () => {
        state.syncStatus = "synced";
      };

      // Cleanup when effect re-runs or store disposes
      ctx.onCleanup(() => ws.close());
    });

    return {
      login: (id: string) => {
        state.userId = id;
      },
      logout: () => {
        state.userId = null;
      },
    };
  },
});
```

### Effect with Safe Async

**The problem:** When an effect re-runs before an async operation completes, you get stale data or "state update on unmounted component" warnings. Managing this manually is error-prone.

**With Storion:** Use `ctx.safe()` to wrap promises that should be ignored if stale, or `ctx.signal` for fetch cancellation.

```ts
effect((ctx) => {
  const userId = state.userId;
  if (!userId) return;

  // ctx.safe() wraps promises to never resolve if stale
  ctx.safe(fetchUserData(userId)).then((data) => {
    // Only runs if effect hasn't re-run
    state.userData = data;
  });

  // Or use abort signal for fetch
  fetch(`/api/user/${userId}`, { signal: ctx.signal })
    .then((res) => res.json())
    .then((data) => {
      state.userData = data;
    });
});
```

### Fine-Grained Updates with `pick()`

**The problem:** Your component re-renders when _any_ property of a nested object changes, even though you only use one field. For example, reading `state.profile.name` triggers re-renders when `profile.email` changes too.

**With Storion:** Wrap computed values in `pick()` to track the _result_ instead of the _path_. Re-renders only happen when the picked value actually changes.

```tsx
import { pick } from "storion";

function UserProfile() {
  // Without pick: re-renders when ANY profile property changes
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore);
    return { name: state.profile.name };
  });

  // With pick: re-renders ONLY when the picked value changes
  // Multiple picks can be used in one selector
  const { name, fullName, coords, settings, nested } = useStore(({ get }) => {
    const [state] = get(userStore);
    return {
      // Simple pick - uses default equality (===)
      name: pick(() => state.profile.name),

      // Computed value - only re-renders when result changes
      fullName: pick(() => `${state.profile.first} ${state.profile.last}`),

      // 'shallow' - compares object properties one level deep
      coords: pick(
        () => ({ x: state.position.x, y: state.position.y }),
        "shallow"
      ),

      // 'deep' - recursively compares nested objects/arrays
      settings: pick(() => state.userSettings, "deep"),

      // Custom equality function - full control
      nested: pick(
        () => state.data.items.map((i) => i.id),
        (a, b) => a.length === b.length && a.every((id, i) => id === b[i])
      ),
    };
  });

  return <h1>{name}</h1>;
}
```

### Understanding Equality: Store vs Component Level

Storion provides two layers of equality control, each solving different problems:

| Layer                | API               | When it runs          | Purpose                                          |
| -------------------- | ----------------- | --------------------- | ------------------------------------------------ |
| **Store (write)**    | `equality` option | When state is mutated | Prevent unnecessary notifications to subscribers |
| **Component (read)** | `pick(fn, eq)`    | When selector runs    | Prevent unnecessary re-renders                   |

```
┌─────────────────────────────────────────────────────────────────────┐
│  Store                                                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  state.coords = { x: 1, y: 2 }                               │   │
│  │         │                                                    │   │
│  │         ▼                                                    │   │
│  │  equality: { coords: "shallow" }  ──► Same x,y? Skip notify  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                      │
│                    notify if changed                                │
│                              ▼                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Component A              │            Component B           │   │
│  │  pick(() => coords.x)     │     pick(() => coords, "shallow")│   │
│  │         │                 │                   │              │   │
│  │         ▼                 │                   ▼              │   │
│  │  Re-render if x changed   │    Re-render if x OR y changed   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**Example: Coordinates update**

```ts
// Store level - controls when subscribers get notified
const mapStore = store({
  state: { coords: { x: 0, y: 0 }, zoom: 1 },
  equality: {
    coords: "shallow", // Don't notify if same { x, y } values
  },
  setup({ state }) {
    return {
      setCoords: (x: number, y: number) => {
        state.coords = { x, y }; // New object, but shallow-equal = no notify
      },
    };
  },
});

// Component level - controls when THIS component re-renders
function XCoordinate() {
  const { x } = useStore(({ get }) => {
    const [state] = get(mapStore);
    return {
      // Even if coords changed, only re-render if x specifically changed
      x: pick(() => state.coords.x),
    };
  });
  return <span>X: {x}</span>;
}
```

### Comparison with Other Libraries

| Feature            | Storion               | Redux                    | Zustand          | Jotai             | MobX            |
| ------------------ | --------------------- | ------------------------ | ---------------- | ----------------- | --------------- |
| **Tracking**       | Automatic             | Manual selectors         | Manual selectors | Automatic (atoms) | Automatic       |
| **Write equality** | Per-property config   | Reducer-based            | Built-in shallow | Per-atom          | Deep by default |
| **Read equality**  | `pick()` with options | `useSelector` + equality | `shallow` helper | Atom-level        | Computed        |
| **Granularity**    | Property + component  | Selector-based           | Selector-based   | Atom-based        | Property-based  |
| **Bundle size**    | ~4KB                  | ~2KB + toolkit           | ~1KB             | ~2KB              | ~15KB           |
| **DI / Lifecycle** | Built-in container    | External (thunk/saga)    | External         | Provider-based    | External        |

**Key differences:**

- **Redux/Zustand**: You write selectors manually and pass equality functions to `useSelector`. Easy to forget and over-subscribe.

  ```ts
  // Zustand - must remember to add shallow
  const coords = useStore((s) => s.coords, shallow);
  ```

- **Jotai**: Fine-grained via atoms, but requires splitting state into many atoms upfront.

  ```ts
  // Jotai - must create separate atoms
  const xAtom = atom((get) => get(coordsAtom).x);
  ```

- **Storion**: Auto-tracking by default, `pick()` for opt-in fine-grained control, store-level equality for write optimization.

  ```ts
  // Storion - automatic tracking, pick() when you need precision
  const x = pick(() => state.coords.x);
  ```

### Async State Management

**The problem:** Every async operation needs loading, error, and success states. You write the same boilerplate: `isLoading`, `error`, `data`, plus handling race conditions, retries, and cancellation.

**With Storion:** The `async()` helper manages all async states automatically. Choose "fresh" mode (clear data while loading) or "stale" mode (keep previous data like SWR).

```ts
import { store } from "storion";
import { async, type AsyncState } from "storion/async";

interface Product {
  id: string;
  name: string;
  price: number;
}

export const productStore = store({
  name: "products",
  state: {
    // Fresh mode: data is undefined during loading
    featured: async.fresh<Product>(),
    // Stale mode: preserves previous data during loading (SWR pattern)
    list: async.stale<Product[]>([]),
  },
  setup({ focus }) {
    const featuredActions = async<Product, "fresh", [string]>(
      focus("featured"),
      async (ctx, productId) => {
        const res = await fetch(`/api/products/${productId}`, {
          signal: ctx.signal,
        });
        return res.json();
      },
      {
        retry: { count: 3, delay: (attempt) => attempt * 1000 },
        onError: (err) => console.error("Failed to fetch product:", err),
      }
    );

    const listActions = async<Product[], "stale", []>(
      focus("list"),
      async () => {
        const res = await fetch("/api/products");
        return res.json();
      }
    );

    return {
      fetchFeatured: featuredActions.dispatch,
      fetchList: listActions.dispatch,
      refreshList: listActions.refresh,
      cancelFeatured: featuredActions.cancel,
    };
  },
});

// In React - handle async states
function ProductList() {
  const { list, fetchList } = useStore(({ get }) => {
    const [state, actions] = get(productStore);
    return { list: state.list, fetchList: actions.fetchList };
  });

  useEffect(() => {
    fetchList();
  }, []);

  if (list.status === "pending" && !list.data?.length) {
    return <Spinner />;
  }

  if (list.status === "error") {
    return <Error message={list.error.message} />;
  }

  return (
    <ul>
      {list.data?.map((p) => (
        <li key={p.id}>{p.name}</li>
      ))}
      {list.status === "pending" && <li>Loading more...</li>}
    </ul>
  );
}
```

### When to Fetch Data

Storion provides multiple patterns for data fetching. Choose based on your use case:

| Pattern                 | When to use                                    | Example                            |
| ----------------------- | ---------------------------------------------- | ---------------------------------- |
| **Setup time**          | Data needed immediately when store initializes | App config, user session           |
| **Trigger (no deps)**   | One-time fetch when component mounts           | Initial page data                  |
| **Trigger (with deps)** | Refetch when component visits or deps change   | Dashboard refresh                  |
| **useEffect**           | Standard React pattern, explicit control       | Compatibility with existing code   |
| **User interaction**    | On-demand fetching                             | Search, pagination, refresh button |

```tsx
import { store } from "storion";
import { async, type AsyncState } from "storion/async";
import { useStore } from "storion/react";
import { useEffect } from "react";

interface User {
  id: string;
  name: string;
}

export const userStore = store({
  name: "users",
  state: {
    currentUser: async.fresh<User>(),
    searchResults: async.stale<User[]>([]),
  },
  setup({ focus, effect }) {
    // ═══════════════════════════════════════════════════════════════════
    // Pattern 1: Fetch at SETUP TIME
    // Data is fetched immediately when store is created
    // Good for: App config, auth state, critical data
    // ═══════════════════════════════════════════════════════════════════
    const currentUserAsync = async(focus("currentUser"), async (ctx) => {
      const res = await fetch("/api/me", { signal: ctx.signal });
      return res.json();
    });

    // Fetch immediately during setup
    currentUserAsync.dispatch();

    // ═══════════════════════════════════════════════════════════════════
    // Pattern 2: Expose DISPATCH for UI control
    // Store provides action, UI decides when to call
    // Good for: Search, pagination, user-triggered refresh
    // ═══════════════════════════════════════════════════════════════════
    const searchAsync = async(
      focus("searchResults"),
      async (ctx, query: string) => {
        const res = await fetch(`/api/users/search?q=${query}`, {
          signal: ctx.signal,
        });
        return res.json();
      }
    );

    return {
      currentUser: currentUserAsync,
      search: searchAsync.dispatch,
      cancelSearch: searchAsync.cancel,
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════
// Pattern 3: TRIGGER with dependencies
// Uses useStore's `trigger` for declarative data fetching
// ═══════════════════════════════════════════════════════════════════════════

// 3a. No deps - fetch ONCE when component mounts
function UserProfile() {
  const { user } = useStore(({ get, trigger }) => {
    const [state, actions] = get(userStore);

    // No deps array = fetch once, never refetch
    trigger(actions.currentUser.dispatch, []);

    return { user: state.currentUser };
  });

  if (user.status === "pending") return <Spinner />;
  return <div>{user.data?.name}</div>;
}

// 3b. With context.id - refetch EVERY TIME component visits
function Dashboard() {
  const { user } = useStore(({ get, trigger, id }) => {
    const [state, actions] = get(userStore);

    // `id` changes each time component mounts = refetch on every visit
    trigger(actions.currentUser.dispatch, [id]);

    return { user: state.currentUser };
  });

  return <div>Welcome back, {user.data?.name}</div>;
}

// 3c. With custom deps - refetch when deps change
function UserById({ userId }: { userId: string }) {
  const { user } = useStore(
    ({ get, trigger }) => {
      const [state, actions] = get(userStore);

      // Refetch when userId prop changes
      trigger(() => actions.currentUser.dispatch(), [userId]);

      return { user: state.currentUser };
    },
    [userId] // selector deps for proper tracking
  );

  return <div>{user.data?.name}</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pattern 4: useEffect - standard React pattern
// For compatibility or when you need more control
// ═══════════════════════════════════════════════════════════════════════════
function UserListWithEffect() {
  const { search } = useStore(({ get }) => {
    const [, actions] = get(userStore);
    return { search: actions.search };
  });

  useEffect(() => {
    search("initial");
  }, []);

  return <div>...</div>;
}

// ═══════════════════════════════════════════════════════════════════════════
// Pattern 5: USER INTERACTION - on-demand fetching
// ═══════════════════════════════════════════════════════════════════════════
function SearchBox() {
  const [query, setQuery] = useState("");
  const { results, search, cancel } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    return {
      results: state.searchResults,
      search: actions.search,
      cancel: actions.cancelSearch,
    };
  });

  const handleSearch = () => {
    cancel(); // Cancel previous search
    search(query);
  };

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      <button onClick={handleSearch}>Search</button>
      <button onClick={cancel}>Cancel</button>

      {results.status === "pending" && <Spinner />}
      {results.data?.map((user) => (
        <div key={user.id}>{user.name}</div>
      ))}
    </div>
  );
}
```

**Summary: Choosing the right pattern**

```
┌─────────────────────────────────────────────────────────────────────────┐
│  When should data be fetched?                                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  App starts?  ──────────►  Setup time (dispatch in setup)               │
│                                                                         │
│  Component mounts?                                                      │
│       │                                                                 │
│       ├── Once ever? ────►  trigger(fn, [])                             │
│       │                                                                 │
│       ├── Every visit? ──►  trigger(fn, [id])                           │
│       │                                                                 │
│       └── When deps change? ► trigger(fn, [dep1, dep2])                 │
│                                                                         │
│  User clicks? ──────────►  onClick handler calls action                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Suspense Pattern with `async.wait()`

**The problem:** You want to use React Suspense for loading states, but managing the "throw promise" pattern manually is complex and error-prone.

**With Storion:** Use `async.wait()` to extract data from async state — it throws a promise if pending (triggering Suspense) or throws the error if failed.

```tsx
import { Suspense } from "react";
import { async } from "storion/async";
import { useStore } from "storion/react";

// Component that uses Suspense - no loading/error handling needed!
function UserProfile() {
  const { user } = useStore(({ get, trigger }) => {
    const [state, actions] = get(userStore);

    // Trigger fetch on mount
    trigger(actions.fetchUser, []);

    return {
      // async.wait() throws if pending/error, returns data if success
      user: async.wait(state.currentUser),
    };
  });

  // This only renders when data is ready
  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  );
}

// Parent wraps with Suspense and ErrorBoundary
function App() {
  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <Suspense fallback={<Spinner />}>
        <UserProfile />
      </Suspense>
    </ErrorBoundary>
  );
}
```

**Multiple async states with `async.all()`:**

```tsx
function Dashboard() {
  const { user, posts, comments } = useStore(({ get, trigger }) => {
    const [userState, userActions] = get(userStore);
    const [postState, postActions] = get(postStore);
    const [commentState, commentActions] = get(commentStore);

    trigger(userActions.fetch, []);
    trigger(postActions.fetch, []);
    trigger(commentActions.fetch, []);

    // Wait for ALL async states - suspends until all are ready
    const [user, posts, comments] = async.all(
      userState.current,
      postState.list,
      commentState.recent
    );

    return { user, posts, comments };
  });

  return (
    <div>
      <h1>Welcome, {user.name}</h1>
      <PostList posts={posts} />
      <CommentList comments={comments} />
    </div>
  );
}
```

**Race pattern with `async.race()`:**

```tsx
function FastestResult() {
  const { result } = useStore(({ get, trigger }) => {
    const [state, actions] = get(searchStore);

    trigger(() => {
      actions.searchAPI1(query);
      actions.searchAPI2(query);
    }, [query]);

    // Returns whichever finishes first
    return {
      result: async.race(state.api1Results, state.api2Results),
    };
  });

  return <ResultList items={result} />;
}
```

**Async helpers summary:**

| Helper                   | Behavior                              | Use case                  |
| ------------------------ | ------------------------------------- | ------------------------- |
| `async.wait(state)`      | Throws if pending/error, returns data | Single Suspense resource  |
| `async.all(...states)`   | Waits for all, returns tuple          | Multiple parallel fetches |
| `async.any(...states)`   | Returns first successful              | Fallback sources          |
| `async.race(states)`     | Returns fastest                       | Competitive fetching      |
| `async.hasData(state)`   | `boolean`                             | Check without suspending  |
| `async.isLoading(state)` | `boolean`                             | Loading indicator         |
| `async.isError(state)`   | `boolean`                             | Error check               |

### Dependency Injection

**The problem:** Your stores need shared services (API clients, loggers, config) but importing singletons directly causes issues:

- **No lifecycle management** — ES imports are forever; you can't dispose or recreate instances
- **Testing is painful** — Mocking ES modules requires awkward workarounds
- **No cleanup** — Resources like connections, intervals, or subscriptions leak between tests

**With Storion:** The container is a full DI system that manages the complete lifecycle:

- **Automatic caching** — Services are singletons by default, created on first use
- **Dispose & cleanup** — Call `dispose()` to clean up resources, `delete()` to remove and recreate
- **Override for testing** — Swap implementations with `set()` without touching module imports
- **Hierarchical containers** — Create child containers for scoped dependencies

```ts
import { container, type Resolver } from "storion";

// Define service factory
interface ApiService {
  get<T>(url: string): Promise<T>;
  post<T>(url: string, data: unknown): Promise<T>;
}

function createApiService(resolver: Resolver): ApiService {
  const baseUrl = resolver.get(configFactory).apiUrl;

  return {
    async get(url) {
      const res = await fetch(`${baseUrl}${url}`);
      return res.json();
    },
    async post(url, data) {
      const res = await fetch(`${baseUrl}${url}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return res.json();
    },
  };
}

function configFactory(): { apiUrl: string } {
  return { apiUrl: process.env.API_URL ?? "http://localhost:3000" };
}

// Use in store
const userStore = store({
  name: "user",
  state: { user: null },
  setup({ get }) {
    const api = get(createApiService); // Singleton, cached

    return {
      fetchUser: async (id: string) => {
        return api.get(`/users/${id}`);
      },
    };
  },
});

// Testing - easy to mock without module mocking
const mockApi: ApiService = {
  get: async () => ({ id: "1", name: "Test User" }),
  post: async () => ({}),
};

const testApp = container();
testApp.set(createApiService, () => mockApi); // Override with mock

// Now userStore will use mockApi instead of real API
const { actions } = testApp.get(userStore);
await actions.fetchUser("1"); // Uses mockApi.get()

// Lifecycle management
testApp.delete(createApiService); // Remove cached instance
testApp.clear(); // Clear all cached instances
testApp.dispose(); // Dispose container and all instances
```

### Parameterized Factories with `create()`

**The problem:** Some services need configuration at creation time (database connections, loggers with namespaces, API clients with different endpoints). But `get()` only works with parameterless factories since it caches instances.

**With Storion:** Use `create()` for parameterized factories. Unlike `get()`, `create()` always returns fresh instances and supports additional arguments.

```ts
import { store, container, type Resolver } from "storion";

// Parameterized factory - receives resolver + custom args
function createLogger(resolver: Resolver, namespace: string) {
  return {
    info: (msg: string) => console.log(`[${namespace}] INFO: ${msg}`),
    error: (msg: string) => console.error(`[${namespace}] ERROR: ${msg}`),
  };
}

function createDatabase(
  resolver: Resolver,
  config: { host: string; port: number }
) {
  return {
    query: (sql: string) =>
      fetch(`http://${config.host}:${config.port}/query`, {
        method: "POST",
        body: sql,
      }),
    close: () => {
      /* cleanup */
    },
  };
}

// Use in store setup
const userStore = store({
  name: "user",
  state: { users: [] as User[] },
  setup({ create }) {
    // Each call creates a fresh instance with specific config
    const logger = create(createLogger, "user-store");
    const db = create(createDatabase, { host: "localhost", port: 5432 });

    return {
      fetchUsers: async () => {
        logger.info("Fetching users...");
        await db.query("SELECT * FROM users");
      },
    };
  },
});

// Also works with container directly
const app = container();
const authLogger = app.create(createLogger, "auth");
const adminDb = app.create(createDatabase, { host: "admin.db", port: 5433 });
```

**Key differences between `get()` and `create()`:**

| Feature    | `get()`                     | `create()`                                    |
| ---------- | --------------------------- | --------------------------------------------- |
| Caching    | Yes (singleton per factory) | No (always fresh)                             |
| Arguments  | None (parameterless only)   | Supports additional arguments                 |
| Use case   | Shared services             | Configured instances, child stores            |
| Middleware | Applied                     | Applied (without args) / Bypassed (with args) |

### Middleware

**The problem:** You need cross-cutting behavior (logging, persistence, devtools) applied to some or all stores, without modifying each store individually.

**With Storion:** Compose middleware and apply it conditionally using patterns like `"user*"` (startsWith), `"*Store"` (endsWith), or custom predicates.

```ts
import { container, compose, applyFor, applyExcept } from "storion";
import type { StoreMiddleware } from "storion";

// Logging middleware - ctx.spec is always available
const loggingMiddleware: StoreMiddleware = (ctx) => {
  console.log(`Creating store: ${ctx.displayName}`);
  const instance = ctx.next();
  console.log(`Created: ${instance.id}`);
  return instance;
};

// Persistence middleware
const persistMiddleware: StoreMiddleware = (ctx) => {
  const instance = ctx.next();
  // Access store-specific options directly
  const isPersistent = ctx.spec.options.meta?.persist === true;
  if (isPersistent) {
    // Add persistence logic...
  }
  return instance;
};

const app = container({
  middleware: compose(
    // Apply logging to all stores starting with "user"
    applyFor("user*", loggingMiddleware),

    // Apply persistence except for cache stores
    applyExcept("*Cache", persistMiddleware),

    // Apply to specific stores
    applyFor(["authStore", "settingsStore"], loggingMiddleware),

    // Apply based on custom condition
    applyFor(
      (ctx) => ctx.spec.options.meta?.persist === true,
      persistMiddleware
    )
  ),
});
```

---

## API Reference

### Core (`storion`)

| Export                 | Description                                    |
| ---------------------- | ---------------------------------------------- |
| `store(options)`       | Create a store specification                   |
| `container(options?)`  | Create a container for store instances and DI  |
| `effect(fn, options?)` | Create reactive side effects with cleanup      |
| `pick(fn, equality?)`  | Fine-grained derived value tracking            |
| `batch(fn)`            | Batch multiple mutations into one notification |
| `untrack(fn)`          | Read state without tracking dependencies       |

#### Store Options

```ts
interface StoreOptions<TState, TActions> {
  name?: string; // Store display name for debugging (becomes spec.displayName)
  state: TState; // Initial state
  setup: (ctx: StoreContext) => TActions; // Setup function
  lifetime?: "singleton" | "autoDispose"; // Instance lifetime
  equality?: Equality | EqualityMap; // Custom equality for state
  onDispatch?: (event: DispatchEvent) => void; // Action dispatch callback
  onError?: (error: unknown) => void; // Error callback
}
```

**Per-property equality** — Configure different equality checks for each state property:

```ts
const myStore = store({
  name: "settings",
  state: {
    theme: "light",
    coords: { x: 0, y: 0 },
    items: [] as string[],
    config: { nested: { deep: true } },
  },
  // Per-property equality configuration
  equality: {
    theme: "strict", // Default (===)
    coords: "shallow", // Compare { x, y } properties
    items: "shallow", // Compare array elements
    config: "deep", // Deep recursive comparison
  },
  setup({ state }) {
    return {
      setCoords: (x: number, y: number) => {
        // Only triggers subscribers if x or y actually changed (shallow compare)
        state.coords = { x, y };
      },
    };
  },
});
```

| Equality            | Description                                     |
| ------------------- | ----------------------------------------------- |
| `"strict"`          | Default `===` comparison                        |
| `"shallow"`         | Compares object/array properties one level deep |
| `"deep"`            | Recursively compares nested structures          |
| `(a, b) => boolean` | Custom comparison function                      |

#### StoreContext (in setup)

```ts
interface StoreContext<TState, TActions> {
  state: TState; // First-level props only (state.x = y)
  get<T>(spec: StoreSpec<T>): StoreTuple; // Get dependency store (cached)
  get<T>(factory: Factory<T>): T; // Get DI service (cached)
  create<T>(spec: StoreSpec<T>): StoreInstance<T>; // Create child store (fresh)
  create<T>(factory: Factory<T>): T; // Create service (fresh)
  create<R, A>(factory: (r, ...a: A) => R, ...a: A): R; // Parameterized factory
  focus<P extends Path>(path: P): Focus; // Lens-like accessor
  update(fn: (draft: TState) => void): void; // For nested/array mutations
  dirty(prop?: keyof TState): boolean; // Check if state changed
  reset(): void; // Reset to initial state
  onDispose(fn: VoidFunction): void; // Register cleanup
}
```

> **Note:** `state` allows direct assignment only for first-level properties. Use `update()` for nested objects, arrays, or batch updates.

**`get()` vs `create()` — When to use each:**

| Method     | Caching  | Use case                                               |
| ---------- | -------- | ------------------------------------------------------ |
| `get()`    | Cached   | Shared dependencies, singleton services                |
| `create()` | No cache | Child stores, parameterized factories, fresh instances |

```ts
setup({ get, create }) {
  // get() - cached, same instance every time
  const api = get(apiService); // Singleton

  // create() - fresh instance each call
  const childStore = create(childSpec); // New store instance

  // create() with arguments - parameterized factory
  const db = create(createDatabase, { host: 'localhost', port: 5432 });
  const logger = create(createLogger, 'auth-store');

  return { /* ... */ };
}
```

### React (`storion/react`)

| Export                     | Description                               |
| -------------------------- | ----------------------------------------- |
| `StoreProvider`            | Provides container to React tree          |
| `useStore(selector)`       | Hook to consume stores with selector      |
| `useStore(spec)`           | Hook for component-local store            |
| `useContainer()`           | Access container from context             |
| `create(options)`          | Create store + hook for single-store apps |
| `withStore(hook, render?)` | HOC pattern for store consumption         |

#### useStore Selector

```ts
// Selector receives context with get(), create(), mixin(), once()
const result = useStore(({ get, create, mixin, once }) => {
  const [state, actions] = get(myStore);
  const service = get(myFactory); // Cached

  // create() for parameterized factories (fresh instance each render)
  const logger = create(createLogger, "my-component");

  // Run once on mount
  once(() => actions.init());

  return { value: state.value, action: actions.doSomething };
});
```

### Async (`storion/async`)

| Export                            | Description                                 |
| --------------------------------- | ------------------------------------------- |
| `async(focus, handler, options?)` | Create async action                         |
| `async.fresh<T>()`                | Create fresh mode initial state             |
| `async.stale<T>(initial)`         | Create stale mode initial state             |
| `async.wait(state)`               | Extract data or throw (Suspense-compatible) |
| `async.all(...states)`            | Wait for all states to be ready             |
| `async.any(...states)`            | Get first ready state                       |
| `async.race(states)`              | Race between states                         |
| `async.hasData(state)`            | Check if state has data                     |
| `async.isLoading(state)`          | Check if state is loading                   |
| `async.isError(state)`            | Check if state has error                    |

#### AsyncState Types

```ts
interface AsyncState<T, M extends "fresh" | "stale"> {
  status: "idle" | "pending" | "success" | "error";
  mode: M;
  data: M extends "stale" ? T : T | undefined;
  error: Error | undefined;
  timestamp: number | undefined;
}
```

### Middleware

| Export        | Description                                        |
| ------------- | -------------------------------------------------- |
| `compose`     | Compose multiple StoreMiddleware into one          |
| `applyFor`    | Apply middleware conditionally (pattern/predicate) |
| `applyExcept` | Apply middleware except for matching patterns      |

#### Middleware Context (Discriminated Union)

Middleware context uses a discriminated union with `type` field:

```ts
// For stores (container middleware)
interface StoreMiddlewareContext {
  type: "store"; // Discriminant
  spec: StoreSpec; // Always present for stores
  factory: Factory;
  resolver: Resolver;
  next: () => unknown;
  displayName: string; // Always present for stores
}

// For plain factories (resolver middleware)
interface FactoryMiddlewareContext {
  type: "factory"; // Discriminant
  factory: Factory;
  resolver: Resolver;
  next: () => unknown;
  displayName: string | undefined;
}

type MiddlewareContext = FactoryMiddlewareContext | StoreMiddlewareContext;
```

**Store-specific middleware** (for containers):

```ts
// No generics needed - simple and clean
type StoreMiddleware = (ctx: StoreMiddlewareContext) => StoreInstance;

const loggingMiddleware: StoreMiddleware = (ctx) => {
  console.log(`Creating: ${ctx.displayName}`);
  const instance = ctx.next();
  console.log(`Created: ${instance.id}`);
  return instance as StoreInstance;
};
```

**Generic middleware** (for resolver, works with both stores and factories):

```ts
type Middleware = (ctx: MiddlewareContext) => unknown;

const loggingMiddleware: Middleware = (ctx) => {
  // Use type narrowing
  if (ctx.type === "store") {
    console.log(`Store: ${ctx.spec.displayName}`);
  } else {
    console.log(`Factory: ${ctx.displayName ?? "anonymous"}`);
  }
  return ctx.next();
};
```

### Devtools (`storion/devtools`)

```ts
import { devtools } from "storion/devtools";

const app = container({
  middleware: devtools({
    name: "My App",
    // Enable in development only
    enabled: process.env.NODE_ENV === "development",
  }),
});
```

### Devtools Panel (`storion/devtools-panel`)

```tsx
import { DevtoolsPanel } from "storion/devtools-panel";

// Mount anywhere in your app (dev only)
function App() {
  return (
    <>
      <MyApp />
      {process.env.NODE_ENV === "development" && <DevtoolsPanel />}
    </>
  );
}
```

---

## Edge Cases & Best Practices

### ❌ Don't directly mutate nested state or arrays

Direct mutation only works for first-level properties. Use `update()` for nested objects and arrays:

```ts
// ❌ Wrong - nested mutation won't trigger reactivity
setup({ state }) {
  return {
    setName: (name: string) => {
      state.profile.name = name; // Won't work!
    },
    addItem: (item: string) => {
      state.items.push(item); // Won't work!
    },
  };
}

// ✅ Correct - use update() for nested/array mutations
setup({ state, update }) {
  return {
    setName: (name: string) => {
      update((draft) => {
        draft.profile.name = name;
      });
    },
    addItem: (item: string) => {
      update((draft) => {
        draft.items.push(item);
      });
    },
    // First-level props can be assigned directly
    setCount: (n: number) => {
      state.count = n; // This works!
    },
  };
}
```

### ❌ Don't call `get()` inside actions

`get()` is for declaring dependencies during setup, not runtime:

```ts
// ❌ Wrong - calling get() inside action
setup({ get }) {
  return {
    doSomething: () => {
      const [other] = get(otherStore); // Don't do this!
    },
  };
}

// ✅ Correct - declare dependency at setup time
setup({ get }) {
  const [otherState, otherActions] = get(otherStore);

  return {
    doSomething: () => {
      if (otherState.ready) {
        // Use the reactive state captured during setup
      }
    },
  };
}
```

### ❌ Don't return Promises from effects

Effects must be synchronous. Use `ctx.safe()` for async:

```ts
// ❌ Wrong - async effect
effect(async (ctx) => {
  const data = await fetchData(); // Don't do this!
});

// ✅ Correct - use ctx.safe()
effect((ctx) => {
  ctx.safe(fetchData()).then((data) => {
    state.data = data;
  });
});
```

### ✅ Use `pick()` for computed values from nested state

When reading nested state in selectors, use `pick()` for fine-grained reactivity:

```ts
// Re-renders when profile object changes (coarse tracking)
const name = state.profile.name;

// Re-renders only when the actual name value changes (fine tracking)
const name = pick(() => state.profile.name);
const fullName = pick(() => `${state.profile.first} ${state.profile.last}`);
```

### ✅ Use stale mode for SWR patterns

```ts
// Fresh mode: data is undefined during loading
state: {
  data: async.fresh<Data>(),
}

// Stale mode: preserves previous data during loading (SWR pattern)
state: {
  data: async.stale<Data>(initialData),
}
```

---

## TypeScript

Storion is written in TypeScript and provides excellent type inference:

```ts
// State and action types are inferred
const myStore = store({
  name: "my-store",
  state: { count: 0, name: "" },
  setup({ state }) {
    return {
      inc: () => state.count++, // () => void
      setName: (n: string) => (state.name = n), // (n: string) => string
    };
  },
});

// Using with explicit types when needed (unions, nullable)
interface MyState {
  userId: string | null;
  status: "idle" | "loading" | "ready";
}

const typedStore = store({
  name: "typed",
  state: {
    userId: null as string | null,
    status: "idle" as "idle" | "loading" | "ready",
  } satisfies MyState,
  setup({ state }) {
    return {
      setUser: (id: string | null) => {
        state.userId = id;
      },
    };
  },
});
```

---

## Contributing

We welcome contributions! Here's how to get started:

### Prerequisites

- Node.js 18+
- pnpm 8+

### Setup

```bash
# Clone the repo
git clone https://github.com/linq2js/storion.git
cd storion

# Install dependencies
pnpm install

# Build the library
pnpm --filter storion build
```

### Development

```bash
# Watch mode
pnpm --filter storion dev

# Run tests
pnpm --filter storion test

# Run tests with UI
pnpm --filter storion test:ui

# Type check
pnpm --filter storion build:check
```

### Code Style

- Prefer **type inference** over explicit interfaces (add types only for unions, nullable, discriminated unions)
- Keep examples **copy/paste runnable**
- Write tests for new features
- Follow existing patterns in the codebase

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add new feature
fix(react): resolve hook issue
docs: update README
chore: bump dependencies
```

### Pull Requests

1. Fork the repo and create your branch from `main`
2. Add tests for new functionality
3. Ensure all tests pass
4. Update documentation as needed
5. Submit a PR with a clear description

---

## License

MIT © [linq2js](https://github.com/linq2js)

---

<p align="center">
  <sub>Built with ❤️ for the React community</sub>
</p>
