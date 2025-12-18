# 🏪 Storion

**Reactive stores for modern apps. Type-safe. Auto-tracked. Effortlessly composable.**

[![npm](https://img.shields.io/npm/v/storion)](https://www.npmjs.com/package/storion)
[![license](https://img.shields.io/npm/l/storion)](LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/storion)](https://bundlephobia.com/package/storion)
[![tests](https://img.shields.io/github/actions/workflow/status/linq2js/storion/ci.yml?label=tests)](https://github.com/linq2js/storion/actions)

Storion is a small state-management library with **automatic dependency tracking**:

- **You read state → Storion tracks the read**
- **That read changes → only then your effect/component updates**

No manual selectors to “optimize”, and no accidental over-subscription to large objects.

---

## Purpose (what this package does)

- **Define stores** with `store({ state, setup })`
- **Create and cache instances** with `container()` (also works as a DI resolver)
- **React integration** via `StoreProvider`, `useStore`, `create`, and `withStore`
- **Reactive side-effects** via `effect()`
- **Fine-grained derived values** via `pick()`
- **Optional async helpers** via `storion/async`
- **Devtools + panel** via `storion/devtools` and `storion/devtools-panel`

---

## Installation

```bash
npm install storion
```

**Peer dependency:** React is optional, but required if you use `storion/react`.

---

## Quick start

### 1) Single store (React) with `create()`

```tsx
import { create } from "storion/react";

const [counter, useCounter] = create({
  name: "counter",
  state: { count: 0 },
  setup({ state }) {
    return {
      inc: () => {
        state.count++;
      },
      dec: () => {
        state.count--;
      },
    };
  },
});

// Outside React:
counter.actions.inc();

export function Counter() {
  const { count, inc } = useCounter((state, actions) => ({
    count: state.count,
    inc: actions.inc,
  }));

  return <button onClick={inc}>count: {count}</button>;
}
```

### 2) Multi-store (React) with `store()` + `container()`

```tsx
import { store, container } from "storion";
import { StoreProvider, useStore } from "storion/react";

const authStore = store({
  name: "auth",
  // note: explicit type only because nullability matters
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
  setup({ state }) {
    return {
      add: (text: string) => state.items.push(text),
    };
  },
});

const app = container();

export function App() {
  return (
    <StoreProvider container={app}>
      <Screen />
    </StoreProvider>
  );
}

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
      <button onClick={() => login("u1")}>login</button>
      <button onClick={() => add("hello")}>add</button>
      <div>user: {String(userId)}</div>
      <div>todos: {items.join(", ")}</div>
    </div>
  );
}
```

---

## Usage (step-by-step)

### Step 1 — Define a store

```ts
import { store } from "storion";

export const counterStore = store({
  name: "counter",
  state: { count: 0 },
  setup({ state }) {
    return {
      inc: () => state.count++,
      dec: () => state.count--,
    };
  },
});
```

### Step 2 — Create/get instances with a container

```ts
import { container } from "storion";
import { counterStore } from "./counterStore";

const app = container();
const counter = app.get(counterStore); // cached singleton per spec
counter.actions.inc();
```

### Step 3 — Consume stores in React with `useStore`

```tsx
import { useStore } from "storion/react";
import { counterStore } from "./counterStore";

export function Counter() {
  const { count, inc } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    return { count: state.count, inc: actions.inc };
  });

  return <button onClick={inc}>{count}</button>;
}
```

---

## Real examples & edge cases

### **Edge case: don’t call `ctx.get()` inside actions / async callbacks**

`StoreContext.get()` is meant for **declaring dependencies during setup**. Call it at the top of `setup()` and capture the returned state/actions.

```ts
import { store } from "storion";
import { otherStore } from "./otherStore";

export const exampleStore = store({
  name: "example",
  state: { n: 0 },
  setup: (ctx) => {
    const { update, get } = ctx;

    // ✅ declare dependency during setup
    const [otherState] = get(otherStore);

    return {
      // ✅ read reactive state later (no ctx.get here)
      bumpIfReady: update.action((draft) => {
        if (otherState.ready) draft.n++;
      }),
    };
  },
});
```

### **Factories / services via `container.get(factory)`**

The container can also cache **plain factory functions** (DI services).

```ts
import { container, type Resolver } from "storion";

type Api = { ping(): Promise<string> };

function apiService(_resolver: Resolver): Api {
  return { ping: async () => "pong" };
}

const app = container();
const api = app.get(apiService); // cached singleton (keyed by factory)
```

---

## API reference (high level)

### Core (`storion`)

- **`store(options)`**: define a store spec (callable factory)
- **`container(options?)`**: create a container (store instances + factory DI)
- **`effect(fn)`**: reactive side effects with cleanup and error strategy
- **`pick(fn)`**: derived value with result-level tracking
- **`batch(fn)`**: batch multiple mutations into a single notification
- **`untrack(fn)`**: read without dependency tracking
- **Middleware**: `applyFor`, `applyExcept`, `compose`

### React (`storion/react`)

- **`StoreProvider`**: provides a container
- **`useStore(selector | spec)`**:
  - `useStore(({ get }) => result)` for container-based selectors
  - `useStore(spec)` for a component-local store instance
- **`useContainer()`**: access the container from context
- **`create(options)`**: single-store shortcut returning `[instance, useHook]`
- **`withStore(hook, render?)`**:
  - direct component mode: returns component with `.use` and `.render`
  - HOC mode: returns HOC with `.use`

### Async (`storion/async`)

- **`async(focusLens, fn)`**: async state helper with `.dispatch()` and `.reset()`
- **`async.stale(initial)`**: initial “stale” async state

### Devtools

- **`storion/devtools`**: devtools middleware helpers
- **`storion/devtools-panel`**: mountable devtools panel UI

---

## Contribution guidelines

### Prerequisites

- Node.js + `pnpm`

### Install & build

```bash
pnpm install
pnpm --filter storion build
```

### Run tests

```bash
pnpm --filter storion test
```

### Code style

- Prefer **type inference** over explicit interfaces for stores/services (add types only where needed: unions, nullable, discriminated unions).
- Keep examples **copy/paste runnable**.

### Releases

Storion uses `npm version` scripts (see `packages/storion/package.json`).

---

## License

MIT © linq2js
