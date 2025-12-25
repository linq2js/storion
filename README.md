<p align="center">
  <img src="https://raw.githubusercontent.com/linq2js/storion/main/.github/logo.svg" alt="Storion Logo" width="120" height="120" />
</p>

<h1 align="center">Storion</h1>

<p align="center">
  <strong>Reactive state management with automatic dependency tracking</strong>
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

## Why Storion?

**Simple at first. Powerful as you grow.**

Start with basic stores and direct mutations. As your app grows, layer in async state, effects, dependency injection, and middleware — all without rewriting existing code.

## Features

|                      |                                          |
| -------------------- | ---------------------------------------- |
| 🎯 **Auto-tracking** | Dependencies tracked when you read state |
| ⚡ **Fine-grained**  | Only re-render what changed              |
| 🔒 **Type-safe**     | Full TypeScript with excellent inference |
| 📦 **Tiny**          | ~4KB minified + gzipped                  |
| ⏳ **Async**         | First-class loading states with Suspense |
| 🛠️ **DevTools**      | Built-in debugging panel                 |

## Installation

```bash
npm install storion
```

## Quick Start

**Read state → Storion tracks it. State changes → Only affected components re-render.**

```tsx
import { create } from "storion/react";

// Create store and hook in one call - no Provider needed!
const [counter, useCounter] = create({
  state: { count: 0 },
  setup({ state }) {
    return {
      inc: () => state.count++,
      dec: () => state.count--,
    };
  },
});

function Counter() {
  const { count, inc, dec } = useCounter((state, actions) => ({
    count: state.count,
    ...actions,
  }));

  return (
    <div>
      <button onClick={dec}>-</button>
      <span>{count}</span>
      <button onClick={inc}>+</button>
    </div>
  );
}
```

<details>
<summary>Multi-store apps with StoreProvider</summary>

```tsx
import { store, useStore, StoreProvider } from "storion/react";

const counterStore = store({
  name: "counter",
  state: { count: 0 },
  setup({ state }) {
    return {
      inc: () => state.count++,
      dec: () => state.count--,
    };
  },
});

function Counter() {
  const { count, inc, dec } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    return { count: state.count, ...actions };
  });

  return (
    <div>
      <button onClick={dec}>-</button>
      <span>{count}</span>
      <button onClick={inc}>+</button>
    </div>
  );
}

function App() {
  return (
    <StoreProvider>
      <Counter />
    </StoreProvider>
  );
}
```

</details>

## Documentation

📚 **[Full Documentation](https://linq2js.github.io/storion/)** — Guides, examples, and API reference

- [Getting Started](https://linq2js.github.io/storion/guide/getting-started.html)
- [Core Concepts](https://linq2js.github.io/storion/guide/core-concepts.html)
- [Async State](https://linq2js.github.io/storion/guide/async.html)
- [API Reference](https://linq2js.github.io/storion/api/store.html)
- [Live Demos](https://linq2js.github.io/storion/demos.html)

## Packages

| Package                                           | Description          |
| ------------------------------------------------- | -------------------- |
| [`storion`](./packages/storion)                   | Core library         |
| [`docs`](./packages/docs)                         | Documentation site   |
| [`feature-showcase`](./packages/feature-showcase) | Feature demo app     |
| [`pokemon`](./packages/pokemon)                   | Pokemon demo app     |
| [`chat`](./packages/chat)                         | Chat demo app        |
| [`expense-manager`](./packages/expense-manager)   | Expense manager demo |

## Development

```bash
# Install dependencies
pnpm install

# Build core library
pnpm --filter storion build

# Run tests
pnpm --filter storion test

# Start docs dev server
pnpm --filter storion-docs dev
```

## License

MIT © [linq2js](https://github.com/linq2js)

---

<p align="center">
  <sub>Built with ❤️ for the React community</sub>
</p>
