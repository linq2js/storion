<p align="center">
  <img src="https://raw.githubusercontent.com/linq2js/storion/main/.github/logo.svg" alt="Storion Logo" width="120" height="120" />
</p>

<h1 align="center">Storion</h1>

<p align="center">
  <strong>State management that gets out of your way</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/storion"><img src="https://img.shields.io/npm/v/storion?style=flat-square&color=blue" alt="npm version"></a>
  <a href="https://bundlephobia.com/package/storion"><img src="https://img.shields.io/bundlephobia/minzip/storion?style=flat-square&color=green" alt="bundle size"></a>
  <a href="https://github.com/linq2js/storion/actions"><img src="https://img.shields.io/github/actions/workflow/status/linq2js/storion/ci.yml?style=flat-square&label=tests" alt="tests"></a>
  <a href="https://github.com/linq2js/storion/blob/main/LICENSE"><img src="https://img.shields.io/npm/l/storion?style=flat-square" alt="license"></a>
</p>

<p align="center">
  <a href="https://linq2js.github.io/storion/"><strong>📚 Documentation</strong></a> · 
  <a href="https://linq2js.github.io/storion/demos.html">Demos</a> · 
  <a href="https://linq2js.github.io/storion/api/store.html">API</a> · 
  <a href="https://linq2js.github.io/storion/guide/getting-started.html">Getting Started</a>
</p>

---

## The Simplest Counter You'll Ever Write

```tsx
import { create } from "storion/react";

const [_, useCounter] = create({
  state: { count: 0 },
  setup: ({ state }) => ({
    inc: () => state.count++,
    dec: () => state.count--,
  }),
});

function Counter() {
  const { count, inc, dec } = useCounter((s, a) => ({ count: s.count, ...a }));
  return <button onClick={inc}>{count}</button>;
}
```

**That's it.** No Provider. No boilerplate. No ceremony.

---

## Why Storion?

| Pain Point                | Storion's Answer                                |
| ------------------------- | ----------------------------------------------- |
| 🤯 Too much boilerplate   | One `create()` call. Done.                      |
| 🐌 Unnecessary re-renders | Auto-tracks what you read, updates only that    |
| 😵 Complex async handling | Built-in loading states, cancellation, Suspense |
| 🔧 Provider hell          | Optional. Use it when you need it               |
| 📦 Bundle anxiety         | ~4KB gzipped. Seriously.                        |

---

## Features at a Glance

```
✦ Auto-tracking     Read state → automatically subscribed
✦ Fine-grained      Change count? Only Counter re-renders
✦ Type-safe         Full inference, zero manual types
✦ Async-first       Loading, error, stale states built-in
✦ DevTools          Time-travel debugging included
✦ Scalable          From counter to enterprise, same API
```

---

## Growing With You

**Start simple:**

```tsx
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

**Add async when ready:**

```tsx
const [_, useUsers] = create({
  state: { users: async.stale([]) },
  setup: ({ focus }) => {
    const query = async(focus("users"), (ctx) =>
      fetch("/api/users", { signal: ctx.signal }).then((r) => r.json())
    );
    return { fetch: query.dispatch, refresh: query.refresh };
  },
});
```

**Scale to multi-store apps:**

```tsx
// When you need shared containers, dependency injection, middleware...
<StoreProvider>
  <App />
</StoreProvider>
```

---

## Documentation

📚 **[Full Documentation](https://linq2js.github.io/storion/)** — Everything you need

- [Getting Started](https://linq2js.github.io/storion/guide/getting-started.html) — 5 min setup
- [Core Concepts](https://linq2js.github.io/storion/guide/core-concepts.html) — How it works
- [Async State](https://linq2js.github.io/storion/guide/async.html) — Loading states made easy
- [API Reference](https://linq2js.github.io/storion/api/store.html) — Every function documented
- [Live Demos](https://linq2js.github.io/storion/demos.html) — See it in action

---

## License

MIT © [linq2js](https://github.com/linq2js)

---

<p align="center">
  <sub>Built with ❤️ for developers who value simplicity</sub>
</p>
