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
      setTheme: (theme: "light" | "dark") => {
        setTheme(theme);
      },

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

function UserName() {
  // Without pick: re-renders when ANY profile property changes
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore);
    return { name: state.profile.name };
  });

  // With pick: re-renders ONLY when profile.name changes
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore);
    return { name: pick(() => state.profile.name) };
  });

  return <h1>{name}</h1>;
}
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

### Dependency Injection

**The problem:** Your stores need shared services (API clients, loggers, config) but you don't want to import singletons directly—it makes testing hard and creates tight coupling.

**With Storion:** The container acts as a DI container. Define factory functions and resolve them with `get()`. Services are cached as singletons automatically.

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
```

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

#### StoreContext (in setup)

```ts
interface StoreContext<TState, TActions> {
  state: TState; // First-level props only (state.x = y)
  get<T>(spec: StoreSpec<T>): StoreTuple; // Get dependency store
  get<T>(factory: Factory<T>): T; // Get DI service
  focus<P extends Path>(path: P): Focus; // Lens-like accessor
  update(fn: (draft: TState) => void): void; // For nested/array mutations
  dirty(prop?: keyof TState): boolean; // Check if state changed
  reset(): void; // Reset to initial state
  onDispose(fn: VoidFunction): void; // Register cleanup
}
```

> **Note:** `state` allows direct assignment only for first-level properties. Use `update()` for nested objects, arrays, or batch updates.

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
// Selector receives context with get() for accessing stores
const result = useStore(({ get, mixin, once }) => {
  const [state, actions] = get(myStore);
  const service = get(myFactory);

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

#### StoreMiddlewareContext

Container middleware uses `StoreMiddlewareContext` where `spec` is always available:

```ts
interface StoreMiddlewareContext<S, A> {
  spec: StoreSpec<S, A>; // The store spec (always present)
  resolver: Resolver; // The resolver/container instance
  next: () => StoreInstance<S, A>; // Call next middleware or create the store
  displayName: string; // Store name (always present for stores)
}

type StoreMiddleware = <S, A>(
  ctx: StoreMiddlewareContext<S, A>
) => StoreInstance<S, A>;
```

For generic resolver middleware (non-container), use `Middleware` with `MiddlewareContext`:

```ts
interface MiddlewareContext<T> {
  factory: Factory<T>; // The factory being invoked
  resolver: Resolver; // The resolver instance
  next: () => T; // Call next middleware or the factory
  displayName?: string; // Name (from factory.displayName or factory.name)
}

type Middleware = <T>(ctx: MiddlewareContext<T>) => T;
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
