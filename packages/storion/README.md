# 🏪 Storion

**A tiny, type-safe reactive state management library with automatic dependency tracking.**

[![npm](https://img.shields.io/npm/v/storion)](https://www.npmjs.com/package/storion)
[![bundle size](https://img.shields.io/bundlephobia/minzip/storion)](https://bundlephobia.com/package/storion)
[![license](https://img.shields.io/npm/l/storion)](LICENSE)

```bash
npm install storion
```

## Why Storion?

- 🎯 **Auto-tracking** — Dependencies tracked automatically. No selectors to optimize.
- ⚡ **Fine-grained** — Only re-renders when _accessed_ properties change.
- 🔗 **Cross-store** — Stores can compose other stores seamlessly.
- 🎭 **Effects** — Built-in reactive effects with automatic cleanup.
- 📦 **Tiny** — ~3KB gzipped. No dependencies.
- 🦾 **Type-safe** — Full TypeScript inference. No awkward generics.
- 🌐 **Framework-agnostic** — Works with React, or standalone with vanilla JS.

## Quick Start

### Single-Store App

```tsx
import { create } from "storion/react";

// Define and create in one step
const [counter, useCounter] = create({
  name: "counter",
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => state.count++,
      decrement: () => state.count--,
    };
  },
});

function Counter() {
  const { count, increment } = useCounter((state, actions) => ({
    count: state.count,
    increment: actions.increment,
  }));

  return <button onClick={increment}>{count}</button>;
}
```

**That's it.** No providers, no boilerplate.

### Multi-Store App

```tsx
import { store, container, StoreProvider, useStore } from "storion/react";

// Define stores
const userStore = store({
  name: "user",
  state: { name: "" },
  setup() {
    return {};
  },
});
const cartStore = store({
  name: "cart",
  state: { items: [] },
  setup() {
    return {};
  },
});

// Create a container
const app = container();

function App() {
  return (
    <StoreProvider container={app}>
      <MyComponent />
    </StoreProvider>
  );
}

function MyComponent() {
  const { userName, items } = useStore(({ resolve }) => {
    const [user] = resolve(userStore);
    const [cart] = resolve(cartStore);
    return { userName: user.name, items: cart.items };
  });
  // ...
}
```

---

## Mental Model

```
┌─────────────────────────────────────────────────────────────────┐
│                         Container                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │   Store A       │  │   Store B       │  │   Store C       │  │
│  │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │  │
│  │  │   State   │◄─┼──┼──│   State   │  │  │  │   State   │  │  │
│  │  └───────────┘  │  │  └───────────┘  │  │  └───────────┘  │  │
│  │  ┌───────────┐  │  │  ┌───────────┐  │  │  ┌───────────┐  │  │
│  │  │  Actions  │──┼──┼─►│  Actions  │  │  │  │  Actions  │  │  │
│  │  └───────────┘  │  │  └───────────┘  │  │  └───────────┘  │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│            ▲                   ▲                   ▲             │
└────────────┼───────────────────┼───────────────────┼─────────────┘
             │                   │                   │
     ┌───────┴───────┐   ┌───────┴───────┐   ┌───────┴───────┐
     │   useStore    │   │    Effect     │   │   subscribe   │
     │  (React Hook) │   │  (Reactive)   │   │  (Vanilla JS) │
     └───────────────┘   └───────────────┘   └───────────────┘
```

### Core Concepts

| Concept            | Description                                                                          |
| ------------------ | ------------------------------------------------------------------------------------ |
| **Store Spec**     | Blueprint defining state shape, setup function, and options. Created with `store()`. |
| **Store Instance** | Live store with reactive state and actions. Created when accessed via container.     |
| **Container**      | Factory that creates and manages store instances. Enables dependency injection.      |
| **Effect**         | Reactive function that auto-tracks dependencies and re-runs on changes.              |
| **Action**         | Function returned from `setup()` that can mutate state.                              |

### Data Flow Rules

```
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│   UI / App   │─────►│    Action    │─────►│    State     │
└──────────────┘      └──────────────┘      └──────────────┘
       ▲                                           │
       │              ┌──────────────┐             │
       └──────────────│    Effect    │◄────────────┘
                      └──────────────┘
```

**Key rule: Only Actions and Effects can mutate state.**

```tsx
// ✅ Correct - mutation inside action
setup({ state }) {
  return {
    increment: () => { state.count++; },  // Action mutates state
  };
}

// ✅ Correct - mutation inside effect
effect(() => {
  state.computed = state.a + state.b;  // Effect can mutate state
});

// ❌ Wrong - mutation outside action/effect
function Component() {
  const [s] = resolve(store);
  s.count++;  // Don't do this! Use actions instead.
}
```

### Store Lifecycle

```
store(options)          container.get(spec)         component unmounts
      │                        │                           │
      ▼                        ▼                           ▼
 ┌─────────┐              ┌─────────┐                ┌─────────┐
 │  Spec   │─────────────►│Instance │───────────────►│Disposed │
 │ Created │              │ Created │                │(if auto)│
 └─────────┘              └─────────┘                └─────────┘
                               │
                               ▼
                     ┌───────────────────┐
                     │ setup() runs      │
                     │ • resolve() deps  │
                     │ • effects start   │
                     │ • actions created │
                     └───────────────────┘
```

---

## Features That Set Storion Apart

### 🎯 Automatic Dependency Tracking

Unlike Redux/Zustand where you manually select state, Storion tracks what you _actually access_:

```tsx
// Zustand - manual selection, easy to over-select
const { user } = useStore((state) => ({ user: state.user }));
// If ANY property of user changes, component re-renders

// Storion - automatic fine-grained tracking
const { name } = useStore(({ resolve }) => {
  const [state] = resolve(userStore);
  return { name: state.user.name }; // Only tracks user.name
});
// Only re-renders when user.name specifically changes
```

### 🔬 Even Finer with `pick()`

Need to track a computed value instead of a property path?

```tsx
import { pick, useStore } from "storion/react";

const { fullName } = useStore(({ resolve }) => {
  const [state] = resolve(userStore);
  return {
    // Only re-renders when the RESULT changes, not when first/last change
    fullName: pick(() => `${state.user.first} ${state.user.last}`),
  };
});
```

### 🔗 Cross-Store Composition

Stores can seamlessly depend on other stores:

```tsx
import { store } from "storion/react";

const cartStore = store({
  name: "cart",
  state: { items: [] },
  setup({ state, resolve }) {
    // Access user store from within cart store
    const [userState] = resolve(userStore);

    return {
      checkout: () => {
        if (!userState.isLoggedIn) throw new Error("Must be logged in");
        // ... checkout logic
      },
    };
  },
});
```

### 🎭 Reactive Effects

Built-in effects that automatically track dependencies and clean up:

```tsx
import { store, effect } from "storion/react";

const analyticsStore = store({
  name: "analytics",
  state: { pageViews: 0 },
  setup({ state, resolve }) {
    const [routerState] = resolve(routerStore);

    // Runs whenever routerState.path changes
    effect(() => {
      trackPageView(routerState.path);
      state.pageViews++;
    });

    return {};
  },
});
```

### 📝 Local Stores (Component-Scoped)

Perfect for forms, modals, wizards — any component-local state:

```tsx
import { store, useStore } from "storion/react";

const formStore = store({
  name: "form",
  state: { email: "", password: "" },
  setup({ state }) {
    return {
      setEmail: (v: string) => {
        state.email = v;
      },
      setPassword: (v: string) => {
        state.password = v;
      },
    };
  },
});

function LoginForm() {
  // Each component instance gets its own store!
  const [state, actions, { dirty, reset }] = useStore(formStore);

  return (
    <form>
      <input
        value={state.email}
        onChange={(e) => actions.setEmail(e.target.value)}
      />
      <input
        value={state.password}
        onChange={(e) => actions.setPassword(e.target.value)}
      />
      <button disabled={!dirty()}>Submit</button>
      <button type="button" onClick={reset}>
        Reset
      </button>
    </form>
  );
}
```

### 🔄 Immer-Style Updates

Update complex nested state with simple mutations:

```tsx
// In your store's setup function:
setup({ state, update }) {
  return {
    addTodo: (text: string) => {
      update(draft => {
        draft.todos.push({ id: Date.now(), text, done: false });
      });
    },
    toggleTodo: (id: number) => {
      update(draft => {
        const todo = draft.todos.find(t => t.id === id);
        if (todo) todo.done = !todo.done;
      });
    },
  };
}
```

### ⚙️ Flexible Equality

Configure how changes are detected per-property:

```tsx
import { store } from "storion/react";

const userStore = store({
  name: "user",
  state: {
    profile: { name: "", bio: "" },
    settings: { theme: "dark" },
    lastLogin: new Date(),
  },
  // Deep compare profile, shallow compare settings, strict for rest
  equality: {
    profile: "deep",
    settings: "shallow",
    default: "strict",
  },
  setup({ state }) {
    /* ... */
  },
});
```

### 🎬 Action-Based Reactivity

React to action dispatches, not just state changes:

```tsx
import { effect } from "storion/react";

effect(() => {
  const lastSave = saveAction.last();
  if (!lastSave) return;

  // Runs every time saveAction is dispatched
  showNotification(`Saved at ${new Date()}`);
});

// Or subscribe directly
instance.subscribe("@save", (event) => {
  console.log("Save called with:", event.next.args);
});
```

---

## API Reference

### `store(options)` — Define a Store

```ts
import { store } from "storion";

const myStore = store({
  name: "myStore", // Optional, auto-generated if omitted
  state: { count: 0 }, // Initial state (required)
  setup({ state, resolve, update, dirty, reset, use }) {
    // state     - Mutable proxy, writes notify subscribers
    // resolve   - Access other stores: [state, actions]
    // update    - Immer-style or partial updates
    // dirty     - Check if state modified: dirty() or dirty("prop")
    // reset     - Reset to initial state
    // use       - Apply mixins: use(mixin, ...args)

    return {
      increment: () => state.count++,
    };
  },
  equality: "shallow", // Or per-prop: { count: "deep", default: "strict" }
  lifetime: "autoDispose", // "keepAlive" (default) | "autoDispose"
  meta: { persist: true }, // Custom metadata for middleware
  onDispatch: (event) => {}, // Called after each action
  onError: (error) => {}, // Called on effect/action errors
  normalize: (state) => ({}), // For dehydrate() serialization
  denormalize: (data) => ({}), // For hydrate() deserialization
});
```

### `container(options?)` — Manage Store Instances

```ts
import { container } from "storion";

const app = container({
  middleware: [logger, devtools], // Applied to all stores
  defaultLifetime: "autoDispose", // Override default lifetime
});

// Get or create a store instance
const instance = app.get(myStore);

// Check if store exists
app.has(myStore); // boolean

// Clear all instances
app.clear();

// Global container
import { container } from "storion";
const global = container.global;
```

### `effect(fn, options?)` — Reactive Effects

```ts
import { effect } from "storion";

const dispose = effect((ctx) => {
  // Runs immediately, re-runs when tracked values change
  console.log(state.count);

  // Register cleanup (runs before re-run and on dispose)
  ctx.onCleanup(() => {
    console.log("cleaning up");
  });
});

// Options
effect(fn, {
  name: "myEffect", // For debugging
  onError: "keepAlive", // "failFast" | "keepAlive" | custom handler
});

// Stop the effect
dispose();
```

### `batch(fn)` — Batch Updates

```ts
import { batch } from "storion";

// Multiple writes, single notification
batch(() => {
  state.a = 1;
  state.b = 2;
  state.c = 3;
});
```

### `untrack(fn)` — Read Without Tracking

```ts
import { untrack } from "storion";

effect(() => {
  const tracked = state.count; // Creates dependency
  const untracked = untrack(() => state.other); // No dependency
});
```

### `pick(selector, equality?)` — Fine-Grained Tracking

```ts
import { pick } from "storion";

// Only re-renders when the RESULT changes
const fullName = pick(() => `${state.first} ${state.last}`);
const total = pick(() => state.items.reduce((s, i) => s + i.price, 0), "deep");
```

### Store Instance

```ts
const instance = container.get(myStore);

// Properties
instance.id; // "myStore:1"
instance.spec; // The StoreSpec
instance.state; // Readonly state proxy
instance.actions; // Actions with reactive last()
instance.deps; // Dependency instances

// Subscribe
instance.subscribe(() => {}); // All changes
instance.subscribe("count", ({ next, prev }) => {}); // Specific prop
instance.subscribe("@increment", (event) => {}); // Specific action
instance.subscribe("@*", (event) => {}); // All actions

// Lifecycle
instance.onDispose(() => {});
instance.dispose();
instance.disposed(); // boolean

// State management
instance.dirty(); // Any prop modified?
instance.dirty("count"); // Specific prop modified?
instance.reset(); // Reset to initial state

// Persistence
instance.dehydrate(); // Get serializable state
instance.hydrate(data); // Restore state (skips dirty props)
```

### React Hooks

```tsx
import { useStore, StoreProvider, create } from "storion/react";

// Selector-based (with container)
const { count } = useStore(({ resolve }) => {
  const [state, actions] = resolve(myStore);
  return { count: state.count };
});

// Local store (no provider needed)
const [state, actions, { dirty, reset }] = useStore(formStore);

// Provider
<StoreProvider container={app}>
  <App />
</StoreProvider>;

// Shorthand for single-store apps
const [instance, useCounter] = create({
  state: { count: 0 },
  setup({ state }) {
    return { increment: () => state.count++ };
  },
});

// useCounter selector receives (state, actions)
const { count } = useCounter((state, actions) => ({ count: state.count }));
```

### Middleware

```ts
import { applyFor, applyExcept, compose } from "storion";

// Conditional middleware
applyFor("user*", logger); // Wildcard match
applyFor(/Store$/, [logger, devtools]); // RegExp match
applyFor((spec) => spec.meta?.persist, persistMiddleware); // Predicate

// Exclude middleware
applyExcept("_internal*", logger);

// Compose multiple
const combined = compose(logger, devtools, persist);

// Use in container
container({ middleware: [combined] });
```

### Middleware Signature

```ts
type StoreMiddleware = (
  instance: StoreInstance,
  spec: StoreSpec,
  container: StoreContainer
) => void | (() => void); // Return cleanup function
```

---

## Comparison

| Feature             | Storion   | Zustand  | Redux Toolkit | Jotai     |
| ------------------- | --------- | -------- | ------------- | --------- |
| Bundle size         | ~3KB      | ~1KB     | ~10KB         | ~3KB      |
| Boilerplate         | Minimal   | Minimal  | Moderate      | Minimal   |
| Dependency tracking | Automatic | Manual   | Manual        | Automatic |
| Cross-store deps    | Built-in  | Manual   | Manual        | Built-in  |
| TypeScript          | Excellent | Good     | Good          | Excellent |
| React Strict Mode   | ✅        | ✅       | ✅            | ✅        |
| Effects             | Built-in  | External | External      | External  |
| Middleware          | ✅        | ✅       | ✅            | Limited   |
| DevTools            | 🚧        | ✅       | ✅            | ✅        |

---

## TypeScript

Storion is written in TypeScript and provides excellent type inference:

```tsx
import { store, useStore } from "storion/react";

const todoStore = store({
  name: "todos",
  state: {
    items: [] as Todo[],
    filter: "all" as "all" | "active" | "done",
  },
  setup({ state }) {
    return {
      add: (text: string) => {
        /* ... */
      },
      toggle: (id: number) => {
        /* ... */
      },
      setFilter: (f: typeof state.filter) => {
        state.filter = f;
      },
    };
  },
});

// Full inference - no generics needed!
const { items, add } = useStore(({ resolve }) => {
  const [state, actions] = resolve(todoStore);
  return { items: state.items, add: actions.add };
});
// items: Todo[], add: (text: string) => void
```

---

## Installation

```bash
# npm
npm install storion

# yarn
yarn add storion

# pnpm
pnpm add storion
```

### Requirements

- React 18+ (for React integration)
- TypeScript 4.7+ (recommended)

---

## License

MIT © [linq2js](https://github.com/linq2js)

---

<p align="center">
  <sub>Built with ❤️ for developers who want state management that just works.</sub>
</p>
