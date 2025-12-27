<p align="center">
  <img src="https://raw.githubusercontent.com/linq2js/storion/main/.github/logo.svg" alt="Storion Logo" width="120" height="120" />
</p>

<h1 align="center">Storion</h1>

<p align="center">
  <strong>State management that just works</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/storion"><img src="https://img.shields.io/npm/v/storion?style=flat-square&color=blue" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/storion"><img src="https://img.shields.io/bundlephobia/minzip/storion?style=flat-square&color=green" alt="bundle size"></a>
  <a href="https://github.com/linq2js/storion/actions"><img src="https://img.shields.io/github/actions/workflow/status/linq2js/storion/ci.yml?style=flat-square&label=tests" alt="tests"></a>
  <a href="https://github.com/linq2js/storion/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/storion?style=flat-square" alt="license"></a>
</p>

<p align="center">
  <a href="https://linq2js.github.io/storion/"><strong>📚 Docs</strong></a> · 
  <a href="https://linq2js.github.io/storion/demos.html">Demos</a> · 
  <a href="https://linq2js.github.io/storion/api/store.html">API</a> · 
  <a href="https://linq2js.github.io/storion/guide/getting-started.html">Get Started</a>
</p>

---

```tsx
import { create } from "storion/react";

const [counterStore, useCounter] = create({
  state: { count: 0 },
  setup: ({ state }) => ({
    inc: () => state.count++,
    dec: () => state.count--,
  }),
});

function Counter() {
  const { count, inc } = useCounter((s, a) => ({ count: s.count, ...a }));
  return <button onClick={inc}>{count}</button>;
}
```

**No Provider. No boilerplate. It just works.**

---

## Features

| Feature              | Description                                  |
| -------------------- | -------------------------------------------- |
| 🎯 **Auto-tracking** | Read state → subscribed automatically        |
| ⚡ **Fine-grained**  | Only changed state triggers re-renders       |
| 🔒 **Type-safe**     | Full TypeScript inference, zero manual types |
| 🌊 **Async-first**   | Loading states, error handling, Suspense     |
| 🛠️ **DevTools**      | Time-travel debugging built-in               |
| 📦 **~4KB**          | Tiny bundle, no compromises                  |

---

## Install

```bash
npm install storion
```

---

## Usage

### Single Store

For isolated features, widgets, or prototypes:

```tsx
import { create } from "storion/react";

const [_, useAuth] = create({
  state: { user: null },
  setup: ({ state }) => ({
    login: (user) => {
      state.user = user;
    },
    logout: () => {
      state.user = null;
    },
  }),
});
```

### Multiple Stores

For apps with shared state (auth, cart, users):

```tsx
import { store, container, StoreProvider, useStore } from "storion/react";

const authStore = store({
  name: "auth",
  state: { user: null },
  setup: ({ state }) => ({
    login: (user) => {
      state.user = user;
    },
    logout: () => {
      state.user = null;
    },
  }),
});

const cartStore = store({
  name: "cart",
  state: { items: [] },
  setup: ({ state, get }) => {
    const [auth] = get(authStore); // Cross-store access
    return {
      add: (item) => {
        state.items = [...state.items, item];
      },
      clear: () => {
        state.items = [];
      },
    };
  },
});

const app = container();

function App() {
  return (
    <StoreProvider container={app}>
      <Shop />
    </StoreProvider>
  );
}

function Shop() {
  const { items, add } = useStore(({ get }) => {
    const [state, actions] = get(cartStore);
    return { items: state.items, add: actions.add };
  });
  // ...
}
```

### Async Data

```tsx
import { store } from "storion/react";
import { async } from "storion/async";

const usersStore = store({
  name: "users",
  state: { users: async.fresh([]) },
  setup: ({ focus }) => {
    const query = async(focus("users"), async (ctx) => {
      const res = await fetch("/api/users", { signal: ctx.signal });
      return res.json();
    });
    return { fetch: query.dispatch, refresh: query.refresh };
  },
});
```

---

## When to Use What

| Scenario              | Use                         |
| --------------------- | --------------------------- |
| Single feature/widget | `create()`                  |
| Multiple stores       | `store()` + `container()`   |
| Testing with mocks    | `container()` + `app.set()` |
| Persistence           | `app.use(persist())`        |

---

## Documentation

📚 **[Full Docs](https://linq2js.github.io/storion/)** — [Get Started](https://linq2js.github.io/storion/guide/getting-started.html) · [Core Concepts](https://linq2js.github.io/storion/guide/core-concepts.html) · [Async](https://linq2js.github.io/storion/guide/async.html) · [API](https://linq2js.github.io/storion/api/store.html) · [Demos](https://linq2js.github.io/storion/demos.html)

---

## Packages

| Package                                           | Description     |
| ------------------------------------------------- | --------------- |
| [`storion`](./packages/storion)                   | Core library    |
| [`docs`](./packages/docs)                         | Documentation   |
| [`feature-showcase`](./packages/feature-showcase) | Feature demos   |
| [`pokemon`](./packages/pokemon)                   | Pokemon demo    |
| [`chat`](./packages/chat)                         | Chat demo       |
| [`expense-manager`](./packages/expense-manager)   | Expense tracker |

---

## Development

```bash
pnpm install                    # Install
pnpm --filter storion build     # Build
pnpm --filter storion test      # Test
pnpm --filter docs dev          # Docs server
```

---

## License

MIT © [linq2js](https://github.com/linq2js)
