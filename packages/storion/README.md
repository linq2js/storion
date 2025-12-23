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
  <a href="https://linq2js.github.io/storion/">📚 Documentation</a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#core-concepts">Core Concepts</a> •
  <a href="#api-reference">API Reference</a> •
  <a href="#advanced-patterns">Advanced Patterns</a> •
  <a href="#limitations--anti-patterns">Limitations</a>
</p>

---

## Table of Contents

- [What is Storion?](#what-is-storion)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
  - [Stores](#stores)
  - [Services](#services)
  - [Container](#container)
  - [Reactivity](#reactivity)
- [Working with State](#working-with-state)
  - [Direct Mutation](#direct-mutation)
  - [Nested State with update()](#nested-state-with-update)
  - [Focus (Lens-like Access)](#focus-lens-like-access)
- [Reactive Effects](#reactive-effects)
- [Async State Management](#async-state-management)
- [Using Stores in React](#using-stores-in-react)
- [API Reference](#api-reference)
- [Advanced Patterns](#advanced-patterns)
- [Limitations & Anti-patterns](#limitations--anti-patterns)
- [Contributing](#contributing)

---

## What is Storion?

Storion is a lightweight state management library that automatically tracks which parts of your state you use and only updates when those parts change.

**The core idea is simple:**

1. You read state → Storion remembers what you read
2. That state changes → Storion updates only the components that need it

No manual selectors. No accidental over-rendering. Just write natural code.

```tsx
function Counter() {
  const { count, inc } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    return { count: state.count, inc: actions.inc };
  });

  return <button onClick={inc}>{count}</button>;
}
```

**What Storion does:**

- When you access `state.count`, Storion notes that this component depends on `count`
- When `count` changes, Storion re-renders only this component
- If other state properties change, this component stays untouched

---

## Features

| Feature                     | Description                                                 |
| --------------------------- | ----------------------------------------------------------- |
| 🎯 **Auto-tracking**        | Dependencies tracked automatically when you read state      |
| 🔒 **Type-safe**            | Full TypeScript support with excellent inference            |
| ⚡ **Fine-grained updates** | Only re-render what actually changed                        |
| 🧩 **Composable**           | Mix stores, use dependency injection, create derived values |
| 🔄 **Reactive effects**     | Side effects that automatically respond to state changes    |
| 📦 **Tiny footprint**       | ~4KB minified + gzipped                                     |
| 🛠️ **DevTools**             | Built-in devtools panel for debugging                       |
| 🔌 **Middleware**           | Extensible with conditional middleware patterns             |
| ⏳ **Async helpers**        | First-class async state management with cancellation        |

---

## Installation

```bash
npm install storion
# or
pnpm add storion
# or
yarn add storion
```

For React integration:

```bash
npm install storion react
```

---

## Quick Start

### Single Store (Simplest Approach)

Best for small apps or isolated features.

```tsx
import { create } from "storion/react";

// Define store + hook in one call
const [counterStore, useCounter] = create({
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
  const { count, inc } = useCounter((state, actions) => ({
    count: state.count,
    inc: actions.inc,
  }));

  return <button onClick={inc}>{count}</button>;
}

// Use outside React
counterStore.actions.inc();
console.log(counterStore.state.count);
```

**What Storion does:**

1. Creates a reactive state container with `{ count: 0 }`
2. Wraps the state so any read is tracked
3. When `inc()` changes `count`, Storion notifies only subscribers using `count`
4. The React hook connects the component to the store and handles cleanup automatically

### Multi-Store with Container (Scalable Approach)

Best for larger apps with multiple stores.

```tsx
import { store, container } from "storion";
import { StoreProvider, useStore } from "storion/react";

// Define stores separately
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
    };
  },
});

// Create container (manages all store instances)
const app = container();

// Provide to React tree
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

**What Storion does:**

1. Each `store()` call creates a store specification (a blueprint)
2. The `container()` manages store instances and their lifecycles
3. When you call `get(authStore)`, the container either returns an existing instance or creates one
4. All stores share the same container, enabling cross-store communication
5. The container handles cleanup when the app unmounts

---

## Core Concepts

### Stores

A **store** is a container for related state and actions. Think of it as a module that owns a piece of your application's data.

```ts
import { store } from "storion";

const userStore = store({
  name: "user", // Identifier for debugging
  state: {
    // Initial state
    name: "",
    email: "",
  },
  setup({ state }) {
    // Setup function returns actions
    return {
      setName: (name: string) => {
        state.name = name;
      },
      setEmail: (email: string) => {
        state.email = email;
      },
    };
  },
});
```

**Naming convention:** Use `xxxStore` for store specifications (e.g., `userStore`, `authStore`, `cartStore`).

### Services

A **service** is a factory function that creates dependencies like API clients, loggers, or utilities. Services are cached by the container.

```ts
// Service factory (use xxxService naming)
function apiService(resolver) {
  return {
    get: (url: string) => fetch(url).then((r) => r.json()),
    post: (url: string, data: unknown) =>
      fetch(url, { method: "POST", body: JSON.stringify(data) }).then((r) =>
        r.json()
      ),
  };
}

function loggerService(resolver) {
  return {
    info: (msg: string) => console.log(`[INFO] ${msg}`),
    error: (msg: string) => console.error(`[ERROR] ${msg}`),
  };
}
```

**Naming convention:** Use `xxxService` for service factories (e.g., `apiService`, `loggerService`, `authService`).

### Using Services in Stores

```ts
const userStore = store({
  name: "user",
  state: { user: null },
  setup({ get }) {
    // Get services (cached automatically)
    const api = get(apiService);
    const logger = get(loggerService);

    return {
      fetchUser: async (id: string) => {
        logger.info(`Fetching user ${id}`);
        return api.get(`/users/${id}`);
      },
    };
  },
});
```

**What Storion does:**

1. When `get(apiService)` is called, the container checks if an instance exists
2. If not, it calls `apiService()` to create one and caches it
3. Future calls to `get(apiService)` return the same instance
4. This gives you dependency injection without complex configuration

### Container

The **container** is the central hub that:

- Creates and caches store instances
- Creates and caches service instances
- Provides dependency injection
- Manages cleanup and disposal

```ts
import { container } from "storion";

const app = container();

// Get store instance
const { state, actions } = app.get(userStore);

// Get service instance
const api = app.get(apiService);

// Clear all instances (useful for testing)
app.clear();

// Dispose container (cleanup all resources)
app.dispose();
```

### Reactivity

Storion's reactivity is built on a simple principle: **track reads, notify on writes**.

```ts
// When you read state.count, Storion tracks this access
const value = state.count;

// When you write state.count, Storion notifies all trackers
state.count = value + 1;
```

**What Storion does behind the scenes:**

1. State is wrapped in a tracking layer
2. Each read is recorded: "Component A depends on `count`"
3. Each write triggers a check: "Who depends on `count`? Notify them."
4. Only affected subscribers are notified, keeping updates minimal

---

## Working with State

### Direct Mutation

For **first-level properties**, you can assign directly:

```ts
const userStore = store({
  name: "user",
  state: {
    name: "",
    age: 0,
    isActive: false,
  },
  setup({ state }) {
    return {
      setName: (name: string) => {
        state.name = name;
      },
      setAge: (age: number) => {
        state.age = age;
      },
      activate: () => {
        state.isActive = true;
      },
    };
  },
});
```

**Use case:** Simple state updates where you're changing a top-level property.

**What Storion does:**

1. Intercepts the assignment `state.name = name`
2. Compares old and new values
3. If different, notifies all subscribers watching `name`

### Nested State with update()

For **nested objects or arrays**, use `update()` with an immer-style draft:

```ts
const userStore = store({
  name: "user",
  state: {
    profile: { name: "", email: "" },
    tags: [] as string[],
  },
  setup({ state, update }) {
    return {
      // Update nested object
      setProfileName: (name: string) => {
        update((draft) => {
          draft.profile.name = name;
        });
      },

      // Update array
      addTag: (tag: string) => {
        update((draft) => {
          draft.tags.push(tag);
        });
      },

      // Batch multiple changes
      updateProfile: (name: string, email: string) => {
        update((draft) => {
          draft.profile.name = name;
          draft.profile.email = email;
        });
      },
    };
  },
});
```

**Use case:** Any mutation to nested objects, arrays, or when you need to update multiple properties atomically.

**What Storion does:**

1. Creates a draft copy of the state
2. Lets you mutate the draft freely
3. Compares the draft to the original state
4. Applies only the changes and notifies affected subscribers
5. All changes within one `update()` call are batched into a single notification

### Focus (Lens-like Access)

`focus()` creates a getter/setter pair for any state path:

```ts
const settingsStore = store({
  name: "settings",
  state: {
    user: { name: "", email: "" },
    preferences: {
      theme: "light" as "light" | "dark",
      notifications: true,
    },
  },
  setup({ focus }) {
    // Create focused accessors
    const [getTheme, setTheme] = focus("preferences.theme");
    const [getUser, setUser] = focus("user");

    return {
      // Direct value
      setTheme,

      // Computed from previous value
      toggleTheme: () => {
        setTheme((prev) => (prev === "light" ? "dark" : "light"));
      },

      // Immer-style mutation on focused path
      updateUserName: (name: string) => {
        setUser((draft) => {
          draft.name = name;
        });
      },

      // Getter for use in effects
      getTheme,
    };
  },
});
```

**Use case:** When you frequently access a deep path and want cleaner code.

**What Storion does:**

1. Parses the path `"preferences.theme"` once at setup time
2. The getter reads directly from that path
3. The setter determines the update type automatically:
   - Direct value: `setTheme("dark")`
   - Reducer (returns new value): `setTheme(prev => newValue)`
   - Producer (mutates draft): `setTheme(draft => { draft.x = y })`

**Focus setter patterns:**

| Pattern      | Example                         | When to use                   |
| ------------ | ------------------------------- | ----------------------------- |
| Direct value | `set("dark")`                   | Replacing the entire value    |
| Reducer      | `set(prev => prev + 1)`         | Computing from previous value |
| Producer     | `set(draft => { draft.x = 1 })` | Partial updates to objects    |

---

## Reactive Effects

Effects are functions that run automatically when their dependencies change.

### Basic Effect

```ts
import { store, effect } from "storion";

const userStore = store({
  name: "user",
  state: {
    firstName: "",
    lastName: "",
    fullName: "",
  },
  setup({ state }) {
    // Effect runs when firstName or lastName changes
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

**Use case:** Computed/derived state that should stay in sync with source data.

**What Storion does:**

1. Runs the effect function immediately
2. Tracks every state read during execution (`firstName`, `lastName`)
3. When any tracked value changes, re-runs the effect
4. The effect updates `fullName`, which notifies its own subscribers

### Effect with Cleanup

```ts
const syncStore = store({
  name: "sync",
  state: {
    userId: null as string | null,
    status: "idle" as "idle" | "connected" | "error",
  },
  setup({ state }) {
    effect((ctx) => {
      if (!state.userId) return;

      const ws = new WebSocket(`/ws?user=${state.userId}`);
      state.status = "connected";

      // Cleanup runs before next effect or on dispose
      ctx.onCleanup(() => {
        ws.close();
        state.status = "idle";
      });
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

**Use case:** Managing resources like WebSocket connections, event listeners, or timers.

**What Storion does:**

1. Runs effect when `userId` changes
2. Before re-running, calls the cleanup function from the previous run
3. When the store is disposed, calls cleanup one final time
4. This prevents resource leaks

### Effect with Async Operations

Effects must be synchronous, but you can handle async operations safely:

```ts
effect((ctx) => {
  const userId = state.userId;
  if (!userId) return;

  // ctx.safe() wraps a promise to ignore stale results
  ctx.safe(fetchUserData(userId)).then((data) => {
    // Only runs if this effect is still current
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

**Use case:** Data fetching that should be cancelled when dependencies change.

**What Storion does:**

1. `ctx.safe()` wraps the promise in a guard
2. If the effect re-runs before the promise resolves, the guard prevents the callback from executing
3. `ctx.signal` is an AbortSignal that aborts when the effect re-runs
4. This prevents race conditions and stale data updates

### Manual Effect Refresh

```ts
effect((ctx) => {
  // From async code
  setTimeout(() => {
    ctx.refresh(); // Triggers a re-run
  }, 1000);

  // Or by returning ctx.refresh
  if (needsAnotherRun) {
    return ctx.refresh;
  }
});
```

**Important:** You cannot call `ctx.refresh()` synchronously during effect execution. This throws an error to prevent infinite loops.

---

## Async State Management

Storion provides helpers for managing async operations with loading, error, and success states.

### Defining Async State

```ts
import { store } from "storion";
import { async } from "storion/async";

interface User {
  id: string;
  name: string;
}

const userStore = store({
  name: "user",
  state: {
    // Fresh mode: data is undefined during loading
    currentUser: async.fresh<User>(),

    // Stale mode: preserves previous data during loading (SWR pattern)
    userList: async.stale<User[]>([]),
  },
  setup({ focus }) {
    // Use *Query for read operations
    const currentUserQuery = async.action(
      focus("currentUser"),
      async (ctx, userId: string) => {
        const res = await fetch(`/api/users/${userId}`, { signal: ctx.signal });
        return res.json();
      },
      {
        retry: { count: 3, delay: (attempt) => attempt * 1000 },
        onError: (err) => console.error("Failed:", err),
      }
    );

    return {
      fetchUser: currentUserQuery.dispatch,
      cancelFetch: currentUserQuery.cancel,
      refreshUser: currentUserQuery.refresh,
    };
  },
});
```

**Use case:** API calls, data fetching, any async operation that needs loading/error states.

**What Storion does:**

1. `async.fresh<User>()` creates initial state: `{ status: "idle", data: undefined, error: undefined }`
2. When `dispatch()` is called:
   - Sets status to `"pending"`
   - In fresh mode, clears data; in stale mode, keeps previous data
3. When the promise resolves:
   - Sets status to `"success"` and stores the data
4. When the promise rejects:
   - Sets status to `"error"` and stores the error
5. If `cancel()` is called, aborts the request via `ctx.signal`

### Consuming Async State

```tsx
function UserProfile() {
  const { user, fetchUser } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    return { user: state.currentUser, fetchUser: actions.fetchUser };
  });

  useEffect(() => {
    fetchUser("123");
  }, []);

  if (user.status === "pending") return <Spinner />;
  if (user.status === "error") return <Error message={user.error.message} />;
  if (user.status === "idle") return null;

  return <div>{user.data.name}</div>;
}
```

### Async State with Suspense

```tsx
import { trigger } from "storion";
import { async } from "storion/async";
import { useStore } from "storion/react";
import { Suspense } from "react";

function UserProfile() {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);

    // Trigger fetch on mount
    trigger(actions.fetchUser, [], "123");

    return {
      // async.wait() throws if pending (triggers Suspense)
      user: async.wait(state.currentUser),
    };
  });

  // Only renders when data is ready
  return <div>{user.name}</div>;
}

function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <UserProfile />
    </Suspense>
  );
}
```

**What Storion does:**

1. `async.wait()` checks the async state's status
2. If `"pending"`, throws a promise that React Suspense catches
3. If `"error"`, throws the error for ErrorBoundary to catch
4. If `"success"`, returns the data
5. When the data arrives, Suspense re-renders the component

### Derived Async State

```ts
const dashboardStore = store({
  name: "dashboard",
  state: {
    user: async.fresh<User>(),
    posts: async.fresh<Post[]>(),
    summary: async.fresh<{ name: string; postCount: number }>(),
  },
  setup({ state, focus }) {
    // ... async actions for user and posts ...

    // Option 1: Using async.all() - simpler for multiple sources
    async.derive(focus("summary"), () => {
      const [user, posts] = async.all(state.user, state.posts);
      return { name: user.name, postCount: posts.length };
    });

    // Option 2: Using async.wait() - more control for conditional logic
    async.derive(focus("summary"), () => {
      const user = async.wait(state.user);
      const posts = async.wait(state.posts);
      return { name: user.name, postCount: posts.length };
    });

    return {
      /* actions */
    };
  },
});
```

**Use case:** Computing a value from multiple async sources.

**What Storion does:**

1. Runs the derive function and tracks dependencies
2. If any source is pending/error, the derived state mirrors that status
3. If all sources are ready, computes and stores the result
4. Re-runs automatically when source states change

**When to use each approach:**

| Approach       | Best for                                              |
| -------------- | ----------------------------------------------------- |
| `async.all()`  | Waiting for multiple sources at once (cleaner syntax) |
| `async.wait()` | Conditional logic where you may not need all sources  |

---

## Using Stores in React

### useStore Hook

```tsx
import { useStore } from "storion/react";
import { trigger } from "storion";

function Component() {
  const { count, inc, user } = useStore(({ get, id }) => {
    const [counterState, counterActions] = get(counterStore);
    const [userState, userActions] = get(userStore);

    // Trigger immediately (empty deps = once)
    trigger(userActions.fetchProfile, []); // OR trigger(userActions.fetchProfile);

    // Trigger on each component mount (id is unique per mount)
    trigger(userActions.refresh, [id]);

    return {
      count: counterState.count,
      inc: counterActions.inc,
      user: userState.profile,
    };
  });

  return <div>...</div>;
}
```

**Selector context provides:**

| Property                   | Description                                    |
| -------------------------- | ---------------------------------------------- |
| `get(store)`               | Get store instance, returns `[state, actions]` |
| `get(service)`             | Get service instance (cached)                  |
| `create(service, ...args)` | Create fresh service instance with args        |
| `id`                       | Unique ID per component mount                  |
| `once(fn)`                 | Run function once on mount                     |

**Global function `trigger()`** — Call a function when dependencies change (import from `"storion"`).

### Stable Function Wrapping

Functions returned from `useStore` are automatically wrapped with stable references. This means:

- The function reference never changes between renders
- The function always accesses the latest props and state
- Safe to pass to child components without causing re-renders

```tsx
import { useStore } from "storion/react";

function SearchForm({ userId }: { userId: string }) {
  const [query, setQuery] = useState("");

  const { search, results } = useStore(({ get }) => {
    const [state, actions] = get(searchStore);

    return {
      results: state.results,
      // This function is auto-wrapped with stable reference
      search: () => {
        // Always has access to current query and userId
        actions.performSearch(query, userId);
      },
    };
  });

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      {/* search reference is stable - won't cause Button to re-render */}
      <Button onClick={search}>Search</Button>
      <Results items={results} />
    </div>
  );
}

// Button only re-renders when its own props change
const Button = memo(({ onClick, children }) => (
  <button onClick={onClick}>{children}</button>
));
```

**Use case:** Creating callbacks that depend on component state/props but need stable references for `memo`, `useCallback` dependencies, or child component optimization.

**What Storion does:**

1. Detects functions in the selector's return value
2. Wraps each function with a stable reference (created once)
3. When the wrapped function is called, it executes the latest version from the selector
4. Component state (`query`) and props (`userId`) are always current when the function runs

**Why this matters:**

```tsx
// ❌ Without stable wrapping - new reference every render
const search = () => actions.search(query); // Changes every render!

// ❌ Manual useCallback - verbose and easy to forget deps
const search = useCallback(() => actions.search(query), [query, actions]);

// ✅ With useStore - stable reference, always current values
const { search } = useStore(({ get }) => ({
  search: () => actions.search(query), // Stable reference!
}));
```

### Trigger Patterns

```tsx
import { trigger } from "storion";
import { useStore } from "storion/react";

function Dashboard({ categoryId }: { categoryId: string }) {
  const { data } = useStore(({ get, id }) => {
    const [state, actions] = get(dataStore);

    // Pattern 1: Fetch once ever (empty deps)
    trigger(actions.fetchOnce, []);

    // Pattern 2: Fetch every mount (id changes each mount)
    trigger(actions.fetchEveryVisit, [id]);

    // Pattern 3: Fetch when prop changes
    trigger(actions.fetchByCategory, [categoryId], categoryId);

    return { data: state.data };
  });
}
```

**What Storion does:**

1. `trigger()` compares current deps with previous deps
2. If deps changed (or first render), calls the function with provided args
3. Empty deps `[]` means "call once and never again"
4. `[id]` means "call every time component mounts" (id is unique per mount)

**Comparison with React Query / Apollo:**

| Storion                                    | React Query                               | Apollo                                           | Behavior                      |
| ------------------------------------------ | ----------------------------------------- | ------------------------------------------------ | ----------------------------- |
| `trigger(fetch, [])`                       | `useQuery()`                              | `useQuery()`                                     | Auto-fetch on mount           |
| `trigger(fetch, [id])`                     | `useQuery({ refetchOnMount: 'always' })`  | `useQuery({ fetchPolicy: 'network-only' })`      | Fetch every mount             |
| `trigger(fetch, [categoryId], categoryId)` | `useQuery({ variables: { categoryId } })` | `useQuery(QUERY, { variables: { categoryId } })` | Refetch when variable changes |
| Manual `dispatch()`                        | `useLazyQuery()`                          | `useLazyQuery()`                                 | Fetch on user action          |

```tsx
// Auto-fetch (like useQuery in React Query / Apollo)
function UserProfile() {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    trigger(actions.fetchUser, []); // Fetches automatically on mount
    return { user: state.user };
  });
}

// Lazy fetch (like useLazyQuery in React Query / Apollo)
function SearchResults() {
  const { results, search } = useStore(({ get }) => {
    const [state, actions] = get(searchStore);
    // No trigger - user controls when to fetch
    return { results: state.results, search: actions.search };
  });

  return (
    <div>
      <button onClick={() => search("query")}>Search</button>
      {/* results shown after user clicks */}
    </div>
  );
}
```

### Fine-Grained Updates with pick()

```tsx
import { pick } from "storion";

function UserName() {
  const { name, fullName } = useStore(({ get }) => {
    const [state] = get(userStore);
    return {
      // Re-renders ONLY when this specific value changes
      name: pick(() => state.profile.name),

      // Computed values are tracked the same way
      fullName: pick(() => `${state.profile.first} ${state.profile.last}`),
    };
  });

  return <span>{fullName}</span>;
}
```

**Use case:** When you need even more precise control over re-renders.

**Without pick():** Component re-renders when `state.profile` reference changes (even if `name` didn't change).

**With pick():** Component only re-renders when the picked value actually changes.

**pick() equality options:**

```tsx
const result = useStore(({ get }) => {
  const [state] = get(mapStore);
  return {
    // Default: strict equality (===)
    x: pick(() => state.coords.x),

    // Shallow: compare object properties one level deep
    coords: pick(() => state.coords, "shallow"),

    // Deep: recursive comparison
    settings: pick(() => state.settings, "deep"),

    // Custom: provide your own function
    ids: pick(
      () => state.items.map((i) => i.id),
      (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
    ),
  };
});
```

---

## API Reference

### store(options)

Creates a store specification.

```ts
import { store } from "storion";

const myStore = store({
  name: "myStore",
  state: { count: 0 },
  setup({ state, update, focus, get, create, onDispose }) {
    return {
      inc: () => state.count++,
    };
  },
});
```

**Options:**

| Option       | Type                           | Description                                 |
| ------------ | ------------------------------ | ------------------------------------------- |
| `name`       | `string`                       | Display name for debugging                  |
| `state`      | `TState`                       | Initial state object                        |
| `setup`      | `(ctx) => TActions`            | Setup function, returns actions             |
| `lifetime`   | `"singleton" \| "autoDispose"` | Instance lifecycle (default: `"singleton"`) |
| `equality`   | `Equality \| EqualityMap`      | Custom equality for state comparisons       |
| `onDispatch` | `(event) => void`              | Called when any action is dispatched        |
| `onError`    | `(error) => void`              | Called when an error occurs                 |

**Setup context:**

| Property                   | Description                             |
| -------------------------- | --------------------------------------- |
| `state`                    | Reactive state (first-level props only) |
| `update(fn)`               | Immer-style update for nested state     |
| `focus(path)`              | Create getter/setter for a path         |
| `get(spec)`                | Get dependency (store or service)       |
| `create(factory, ...args)` | Create fresh instance                   |
| `dirty(prop?)`             | Check if state has changed              |
| `reset()`                  | Reset to initial state                  |
| `onDispose(fn)`            | Register cleanup function               |

### container(options?)

Creates a container for managing store and service instances.

```ts
import { container } from "storion";

const app = container({
  middleware: myMiddleware,
});

// Get store instance
const { state, actions } = app.get(userStore);

// Get service instance
const api = app.get(apiService);

// Create with parameters
const logger = app.create(loggerService, "myNamespace");

// Lifecycle
app.delete(userStore); // Remove specific instance
app.clear(); // Clear all instances
app.dispose(); // Dispose container and cleanup
```

**Methods:**

| Method                     | Description                           |
| -------------------------- | ------------------------------------- |
| `get(spec)`                | Get or create cached instance         |
| `create(factory, ...args)` | Create fresh instance (not cached)    |
| `set(spec, factory)`       | Override factory (useful for testing) |
| `delete(spec)`             | Remove cached instance                |
| `clear()`                  | Clear all cached instances            |
| `dispose()`                | Dispose container and all instances   |

### effect(fn, options?)

Creates a reactive effect.

```ts
import { effect } from "storion";

const cleanup = effect((ctx) => {
  console.log("Count:", state.count);

  ctx.onCleanup(() => {
    console.log("Cleaning up...");
  });
});

// Later: stop the effect
cleanup();
```

**Context properties:**

| Property        | Description                          |
| --------------- | ------------------------------------ |
| `onCleanup(fn)` | Register cleanup function            |
| `safe(promise)` | Wrap promise to ignore stale results |
| `signal`        | AbortSignal for fetch cancellation   |
| `refresh()`     | Manually trigger re-run (async only) |

**Options:**

| Option       | Type     | Description         |
| ------------ | -------- | ------------------- |
| `debugLabel` | `string` | Label for debugging |

### async.action(focus, handler, options?)

Creates store-bound async state management for queries and shared data.

```ts
import { async } from "storion/async";

// Use *Query for read operations
const userQuery = async.action(
  focus("user"),
  async (ctx, userId: string) => {
    const res = await fetch(`/api/users/${userId}`, { signal: ctx.signal });
    return res.json();
  },
  {
    autoCancel: true, // Cancel previous request on new dispatch (default)
  }
);

// Actions
userQuery.dispatch("123"); // Start async operation
userQuery.cancel(); // Cancel current operation
userQuery.refresh(); // Refetch with same args
userQuery.reset(); // Reset to initial state
```

### async.mixin(handler, options?)

Creates component-local async state for mutations and form submissions.

```ts
import { async } from "storion/async";

// Use *Mutation for write operations
const submitMutation = async.mixin(async (ctx, data: FormData) => {
  const res = await fetch("/api/submit", {
    method: "POST",
    body: JSON.stringify(data),
    signal: ctx.signal,
  });
  return res.json();
});

// Usage in component
function Form() {
  const [state, { dispatch }] = useStore(({ mixin }) => mixin(submitMutation));
  return <button onClick={() => dispatch(data)}>Submit</button>;
}
```

**Options:**

| Option        | Type                            | Description                                               |
| ------------- | ------------------------------- | --------------------------------------------------------- |
| `retry`       | `number \| AsyncRetryOptions`   | Retry configuration                                       |
| `retry.count` | `number`                        | Number of retry attempts                                  |
| `retry.delay` | `number \| (attempt) => number` | Delay between retries (ms)                                |
| `onError`     | `(error) => void`               | Called on error                                           |
| `autoCancel`  | `boolean`                       | Cancel previous request on new dispatch (default: `true`) |

**Async helpers:**

```ts
// Initial state creators
async.fresh<T>(); // Fresh mode: data undefined during loading
async.stale<T>(initial); // Stale mode: preserves data during loading

// State extractors (Suspense-compatible)
async.wait(state); // Get data or throw
async.all(...states); // Wait for all, return tuple
async.any(...states); // Get first successful
async.race(states); // Get fastest

// State checks (non-throwing)
async.hasData(state); // boolean
async.isLoading(state); // boolean
async.isError(state); // boolean

// Derived state
async.derive(focus, () => {
  const a = async.wait(state.a);
  const b = async.wait(state.b);
  return computeResult(a, b);
});
```

**How `async.wait()` handles each state:**

| Status    | Fresh Mode                     | Stale Mode            |
| --------- | ------------------------------ | --------------------- |
| `idle`    | ❌ Throws `AsyncNotReadyError` | ✅ Returns stale data |
| `pending` | ❌ Throws promise (Suspense)   | ✅ Returns stale data |
| `success` | ✅ Returns data                | ✅ Returns data       |
| `error`   | ❌ Throws error                | ✅ Returns stale data |

**Key insight:** In **stale mode**, `async.wait()` always returns the stale data (even during idle/pending/error), so your UI can show previous data while loading. In **fresh mode**, it throws until data is ready.

```tsx
// Fresh mode - throws on idle, must trigger fetch first
const freshState = async.fresh<User>();
async.wait(freshState); // ❌ Throws "Cannot wait: state is idle"

// Stale mode - returns initial data immediately
const staleState = async.stale<User[]>([]);
async.wait(staleState); // ✅ Returns [] (the initial data)
```

**`async.all()` follows the same rules** — it calls `async.wait()` on each state:

```tsx
// All stale mode - returns immediately with stale data
const [users, posts] = async.all(
  async.stale<User[]>([]), // Returns []
  async.stale<Post[]>([]) // Returns []
);

// Mixed mode - throws if any fresh state is not ready
const [user, posts] = async.all(
  async.fresh<User>(), // ❌ Throws - idle fresh state
  async.stale<Post[]>([])
);
```

### pick(fn, equality?)

Fine-grained value tracking.

```ts
import { pick } from "storion";

// In selector
const name = pick(() => state.profile.name);
const coords = pick(() => state.coords, "shallow");
const config = pick(() => state.config, "deep");
const custom = pick(
  () => state.ids,
  (a, b) => arraysEqual(a, b)
);
```

**Equality options:**

| Value               | Description                       |
| ------------------- | --------------------------------- |
| (none)              | Strict equality (`===`)           |
| `"shallow"`         | Compare properties one level deep |
| `"deep"`            | Recursive comparison              |
| `(a, b) => boolean` | Custom comparison function        |

### batch(fn)

Batch multiple mutations into one notification.

```ts
import { batch } from "storion";

batch(() => {
  state.x = 1;
  state.y = 2;
  state.z = 3;
});
// Subscribers notified once, not three times
```

### untrack(fn)

Read state without tracking dependencies.

```ts
import { untrack } from "storion";

effect(() => {
  const count = state.count; // Tracked

  const name = untrack(() => state.name); // Not tracked

  console.log(count, name);
});
// Effect only re-runs when count changes, not when name changes
```

---

## Advanced Patterns

### Middleware

Middleware intercepts store creation for cross-cutting concerns.

```ts
import { container, compose, applyFor, applyExcept } from "storion";
import type { StoreMiddleware } from "storion";

// Simple middleware
const loggingMiddleware: StoreMiddleware = (ctx) => {
  console.log(`Creating: ${ctx.displayName}`);
  const instance = ctx.next();
  console.log(`Created: ${instance.id}`);
  return instance;
};

// Middleware with store-specific logic
const customPersistMiddleware: StoreMiddleware = (ctx) => {
  const instance = ctx.next();

  if (ctx.spec.options.meta?.persist) {
    // Add persistence logic
  }

  return instance;
};

// Apply single middleware
const app = container({
  middleware: loggingMiddleware,
});

// Apply multiple middlewares (array)
const app = container({
  middleware: [
    // Apply to stores starting with "user"
    applyFor("user*", loggingMiddleware),

    // Apply except to cache stores
    applyExcept("*Cache", customPersistMiddleware),

    // Apply to specific stores
    applyFor(["authStore", "settingsStore"], loggingMiddleware),

    // Apply based on condition
    applyFor((ctx) => ctx.spec.options.meta?.debug === true, loggingMiddleware),
  ],
});
```

**Pattern matching:**

| Pattern            | Matches                |
| ------------------ | ---------------------- |
| `"user*"`          | Starts with "user"     |
| `"*Store"`         | Ends with "Store"      |
| `["a", "b"]`       | Exact match "a" or "b" |
| `(ctx) => boolean` | Custom predicate       |

### Parameterized Services

For services that need configuration:

```ts
// Parameterized service factory
function dbService(resolver, config: { host: string; port: number }) {
  return {
    query: (sql: string) =>
      fetch(`http://${config.host}:${config.port}/query`, {
        method: "POST",
        body: sql,
      }),
  };
}

// Use with create() instead of get()
const myStore = store({
  name: "data",
  state: { items: [] },
  setup({ create }) {
    // create() always makes a fresh instance and accepts args
    const db = create(dbService, { host: "localhost", port: 5432 });

    return {
      fetchItems: async () => {
        return db.query("SELECT * FROM items");
      },
    };
  },
});
```

**get() vs create():**

| Aspect    | `get()`         | `create()`           |
| --------- | --------------- | -------------------- |
| Caching   | Yes (singleton) | No (always fresh)    |
| Arguments | None            | Supports extra args  |
| Use case  | Shared services | Configured instances |

### Mixins (Reusable Logic)

Mixins let you compose reusable logic across stores and selectors.

**Store Mixin — reusable actions:**

```ts
import { store, type StoreContext } from "storion";

// Define a reusable mixin
const counterMixin = (ctx: StoreContext<{ count: number }>) => ({
  increment: () => ctx.state.count++,
  decrement: () => ctx.state.count--,
  reset: () => ctx.reset(),
});

// Use in multiple stores
const store1 = store({
  name: "counter1",
  state: { count: 0, label: "Counter 1" },
  setup: (ctx) => ({
    ...ctx.mixin(counterMixin),
    setLabel: (label: string) => (ctx.state.label = label),
  }),
});

const store2 = store({
  name: "counter2",
  state: { count: 100 },
  setup: (ctx) => ctx.mixin(counterMixin),
});
```

**Selector Mixin — reusable selector logic:**

```tsx
import { useStore, type SelectorContext } from "storion/react";

// Define a reusable selector mixin
const sumMixin = (
  ctx: SelectorContext,
  stores: StoreSpec<{ value: number }>[]
) => {
  return stores.reduce((sum, spec) => {
    const [state] = ctx.get(spec);
    return sum + state.value;
  }, 0);
};

function Dashboard() {
  const { total } = useStore((ctx) => ({
    total: ctx.mixin(sumMixin, [store1, store2, store3]),
  }));

  return <div>Total: {total}</div>;
}
```

**Important: Mixins are NOT singletons**

Each call to `mixin()` creates a fresh instance. If you need singleton behavior **within the same store/selector scope**, wrap with memoize:

```ts
import memoize from "lodash/memoize";
import { store, type StoreContext } from "storion";

// Shared mixin - memoized to be singleton within same store setup
const sharedLogicMixin = memoize((ctx: StoreContext<any>) => {
  console.log("sharedLogicMixin created"); // Only logs once per store!
  return {
    doSomething: () => console.log("shared logic"),
  };
});

// Feature A mixin - uses sharedLogicMixin
const featureAMixin = (ctx: StoreContext<any>) => {
  const shared = ctx.mixin(sharedLogicMixin); // Gets cached instance
  return {
    featureA: () => shared.doSomething(),
  };
};

// Feature B mixin - also uses sharedLogicMixin
const featureBMixin = (ctx: StoreContext<any>) => {
  const shared = ctx.mixin(sharedLogicMixin); // Gets SAME cached instance
  return {
    featureB: () => shared.doSomething(),
  };
};

// Main store - composes both features
const myStore = store({
  name: "myStore",
  state: { value: 0 },
  setup: (ctx) => {
    const featureA = ctx.mixin(featureAMixin);
    const featureB = ctx.mixin(featureBMixin);

    // Both features share the same sharedLogicMixin instance!
    // featureA.featureA and featureB.featureB call the same shared.doSomething

    return { ...featureA, ...featureB };
  },
});
```

**What happens:**

1. `featureAMixin` calls `mixin(sharedLogicMixin)` → creates instance, memoize caches it
2. `featureBMixin` calls `mixin(sharedLogicMixin)` → returns cached instance
3. Both features share the same `sharedLogicMixin` instance within this store

**When to use mixin vs service:**

| Pattern              | Caching                   | Access to context      | Use case                            |
| -------------------- | ------------------------- | ---------------------- | ----------------------------------- |
| `get(service)`       | ✅ Global singleton       | ❌ No StoreContext     | Shared utilities, API clients       |
| `mixin(fn)`          | ❌ Fresh each call        | ✅ Full context access | Reusable actions, computed values   |
| `mixin(memoize(fn))` | ✅ Singleton (same scope) | ✅ Full context access | Shared logic across multiple mixins |

### Equality Strategies

Storion supports equality checks at **two levels**, giving you fine-grained control over when updates happen.

**Comparison with other libraries:**

| Library     | Store-level equality | Selector-level equality                |
| ----------- | -------------------- | -------------------------------------- |
| **Redux**   | ❌ No                | ✅ `useSelector(selector, equalityFn)` |
| **Zustand** | ❌ No                | ✅ `useStore(selector, shallow)`       |
| **Jotai**   | ✅ Per-atom          | ❌ No                                  |
| **MobX**    | ✅ Deep by default   | ❌ No (computed)                       |
| **Storion** | ✅ Per-property      | ✅ `pick(fn, equality)`                |

**Store-level equality** — Prevents notifications when state "changes" to an equivalent value:

```ts
const mapStore = store({
  name: "map",
  state: {
    coords: { x: 0, y: 0 },
    markers: [] as Marker[],
    settings: { zoom: 1, rotation: 0 },
  },
  equality: {
    // Shallow: only notify if x or y actually changed
    coords: "shallow",
    // Deep: recursive comparison for complex objects
    settings: "deep",
    // Custom function
    markers: (a, b) => a.length === b.length,
  },
  setup({ state }) {
    return {
      setCoords: (x: number, y: number) => {
        // This creates a new object, but shallow equality
        // prevents notification if x and y are the same
        state.coords = { x, y };
      },
    };
  },
});
```

**Selector-level equality** — Prevents re-renders when selected value hasn't changed:

```tsx
function MapView() {
  const { x, coords, markers } = useStore(({ get }) => {
    const [state] = get(mapStore);
    return {
      // Only re-render if x specifically changed
      x: pick(() => state.coords.x),

      // Only re-render if coords object is shallow-different
      coords: pick(() => state.coords, "shallow"),

      // Custom comparison at selector level
      markers: pick(
        () => state.markers.map((m) => m.id),
        (a, b) => a.join() === b.join()
      ),
    };
  });
}
```

**When to use each:**

| Level              | When it runs          | Use case                                             |
| ------------------ | --------------------- | ---------------------------------------------------- |
| **Store-level**    | On every state write  | Prevent unnecessary notifications to ALL subscribers |
| **Selector-level** | On every selector run | Prevent re-renders for THIS component only           |

```
┌─────────────────────────────────────────────────────────────────────┐
│  state.coords = { x: 1, y: 2 }                                      │
│         │                                                           │
│         ▼                                                           │
│  Store-level equality: coords: "shallow"                            │
│  Same x and y values? → Skip notifying ALL subscribers              │
│         │                                                           │
│         ▼ (if changed)                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐                 │
│  │ Component A         │    │ Component B         │                 │
│  │ pick(() => coords.x)│    │ pick(() => coords)  │                 │
│  │      │              │    │      │              │                 │
│  │      ▼              │    │      ▼              │                 │
│  │ Re-render if x      │    │ Re-render if x OR y │                 │
│  │ changed             │    │ changed             │                 │
│  └─────────────────────┘    └─────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

**Why Storion's approach is powerful:**

```tsx
// Redux/Zustand - must remember to add equality every time
const coords = useSelector((state) => state.coords, shallowEqual);
const coords = useStore((state) => state.coords, shallow);

// Storion - store-level handles common cases, pick() for fine-tuning
const mapStore = store({
  equality: { coords: "shallow" }, // Set once, applies everywhere
  // ...
});

// Components can add extra precision with pick()
const x = pick(() => state.coords.x); // Even finer control
```

### Testing with Mocks

```ts
import { container } from "storion";

// Production code
const app = container();

// Test setup
const testApp = container();

// Override services with mocks
testApp.set(apiService, () => ({
  get: async () => ({ id: "1", name: "Test User" }),
  post: async () => ({}),
}));

// Now stores will use the mock
const { actions } = testApp.get(userStore);
await actions.fetchUser("1"); // Uses mock apiService
```

### Child Containers

For scoped dependencies (e.g., per-request in SSR):

```ts
const rootApp = container();

// Create child container with overrides
const requestApp = container({
  parent: rootApp,
});

// Child inherits from parent but can have its own instances
requestApp.set(sessionService, () => createSessionForRequest());

// Cleanup after request
requestApp.dispose();
```

### Store Lifecycle

```ts
const myStore = store({
  name: "myStore",
  lifetime: "autoDispose", // Dispose when no subscribers
  state: { ... },
  setup({ onDispose }) {
    const interval = setInterval(() => {}, 1000);

    // Cleanup when store is disposed
    onDispose(() => {
      clearInterval(interval);
    });

    return { ... };
  },
});
```

**Lifetime options:**

| Value           | Behavior                                    |
| --------------- | ------------------------------------------- |
| `"singleton"`   | Lives until container is disposed (default) |
| `"autoDispose"` | Disposed when last subscriber unsubscribes  |

### DevTools Integration

![Storion DevTools](https://raw.githubusercontent.com/linq2js/storion/main/packages/storion/img/image.png)

```ts
import { devtools } from "storion/devtools";

const app = container({
  middleware: devtools({
    name: "My App",
    enabled: process.env.NODE_ENV === "development",
  }),
});
```

```tsx
import { DevtoolsPanel } from "storion/devtools-panel";

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

## Error Handling

### Effect Errors

Errors in effects are caught and can be handled:

```ts
const myStore = store({
  name: "myStore",
  state: { ... },
  onError: (error) => {
    console.error("Store error:", error);
    // Send to error tracking service
  },
  setup({ state }) {
    effect(() => {
      if (state.invalid) {
        throw new Error("Invalid state!");
      }
    });

    return { ... };
  },
});
```

**Important:** Even if an effect throws an error, it **still re-runs** when its tracked states change. The effect keeps its dependency tracking from before the error occurred.

```ts
effect(() => {
  console.log("Effect running, count:", state.count); // Tracks `count`

  if (state.count > 5) {
    throw new Error("Count too high!");
  }
});

// Later...
state.count = 10; // Effect re-runs, throws error, calls onError
state.count = 3; // Effect re-runs again, no error this time
state.count = 8; // Effect re-runs, throws error again
```

This behavior ensures that effects can recover when state returns to a valid condition.

### Async Errors

```ts
// Use *Query for read operations
const userQuery = async.action(
  focus("user"),
  async (ctx) => {
    const res = await fetch("/api/user", { signal: ctx.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  {
    onError: (error) => {
      // Handle or log the error
    },
    retry: {
      count: 3,
      delay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
  }
);
```

### React Error Boundaries

```tsx
function App() {
  return (
    <ErrorBoundary fallback={<ErrorPage />}>
      <Suspense fallback={<Spinner />}>
        <UserProfile />
      </Suspense>
    </ErrorBoundary>
  );
}

function UserProfile() {
  const { user } = useStore(({ get }) => {
    const [state] = get(userStore);
    // async.wait() throws on error, caught by ErrorBoundary
    return { user: async.wait(state.currentUser) };
  });

  return <div>{user.name}</div>;
}
```

---

## Limitations & Anti-patterns

### ❌ Don't Mutate Nested State Directly

Direct mutation only works for first-level properties:

```ts
// ❌ Wrong - won't trigger reactivity
state.profile.name = "John";
state.items.push("new item");

// ✅ Correct - use update()
update((draft) => {
  draft.profile.name = "John";
  draft.items.push("new item");
});
```

### ❌ Don't Call get() Inside Actions

`get()` is for setup-time dependencies, not runtime:

```ts
// ❌ Wrong
setup({ get }) {
  return {
    doSomething: () => {
      const [other] = get(otherStore); // Don't do this!
    },
  };
}

// ✅ Correct - capture at setup time
setup({ get }) {
  const [otherState, otherActions] = get(otherStore);

  return {
    doSomething: () => {
      // Use the captured state/actions
      if (otherState.ready) { ... }
    },
  };
}
```

### ❌ Don't Use Async Effects

Effects must be synchronous:

```ts
// ❌ Wrong
effect(async (ctx) => {
  const data = await fetchData();
});

// ✅ Correct
effect((ctx) => {
  ctx.safe(fetchData()).then((data) => {
    state.data = data;
  });
});
```

### ❌ Don't Pass Anonymous Functions to trigger()

Anonymous functions create new references on every render:

```ts
// ❌ Wrong - anonymous function called every render
trigger(() => {
  actions.search(query);
}, [query]);

// ✅ Correct - stable function reference
trigger(actions.search, [query], query);
```

### ❌ Don't Call refresh() Synchronously

Calling `ctx.refresh()` during effect execution throws an error:

```ts
// ❌ Wrong - throws error
effect((ctx) => {
  ctx.refresh(); // Error!
});

// ✅ Correct - async or return pattern
effect((ctx) => {
  setTimeout(() => ctx.refresh(), 1000);
  // or
  return ctx.refresh;
});
```

### ❌ Don't Create Stores Inside Components

Store specs should be defined at module level:

```ts
// ❌ Wrong - creates new spec on every render
function Component() {
  const myStore = store({ ... }); // Don't do this!
}

// ✅ Correct - define at module level
const myStore = store({ ... });

function Component() {
  const { state } = useStore(({ get }) => get(myStore));
}
```

### ❌ Don't Forget to Handle All Async States

```tsx
// ❌ Incomplete - misses error and idle states
function User() {
  const { user } = useStore(({ get }) => {
    const [state] = get(userStore);
    return { user: state.currentUser };
  });

  if (user.status === "pending") return <Spinner />;
  return <div>{user.data.name}</div>; // Crashes if error or idle!
}

// ✅ Complete handling
function User() {
  const { user } = useStore(...);

  if (user.status === "idle") return <button>Load User</button>;
  if (user.status === "pending") return <Spinner />;
  if (user.status === "error") return <Error error={user.error} />;
  return <div>{user.data.name}</div>;
}
```

### Limitation: No Deep Property Tracking

Storion tracks first-level property access, not deep paths:

```ts
// Both track "profile" property, not "profile.name"
const name1 = state.profile.name;
const name2 = state.profile.email;

// To get finer tracking, use pick()
const name = pick(() => state.profile.name);
```

### Limitation: Equality Check Timing

Store-level equality runs on write, component-level equality runs on read:

```ts
// Store level - prevents notification
store({
  equality: { coords: "shallow" },
  setup({ state }) {
    return {
      setCoords: (x, y) => {
        // If same x,y, no subscribers are notified
        state.coords = { x, y };
      },
    };
  },
});

// Component level - prevents re-render
const x = pick(() => state.coords.x);
// Component only re-renders if x specifically changed
```

---

## Contributing

### Prerequisites

- Node.js 18+
- pnpm 8+

### Setup

```bash
git clone https://github.com/linq2js/storion.git
cd storion
pnpm install
pnpm --filter storion build
```

### Development

```bash
pnpm --filter storion dev      # Watch mode
pnpm --filter storion test     # Run tests
pnpm --filter storion test:ui  # Tests with UI
```

### Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(core): add new feature
fix(react): resolve hook issue
docs: update README
```

### AI Assistance

For AI coding assistants, see [AI_GUIDE.md](./AI_GUIDE.md) for rules and patterns when generating Storion code.

---

## License

MIT © [linq2js](https://github.com/linq2js)

---

<p align="center">
  <sub>Built with ❤️ for the React community</sub>
</p>
