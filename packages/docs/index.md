---
layout: home

hero:
  name: Storion
  text: State Management That Just Works
  tagline: Write state naturally. Let Storion handle the rest.
  image:
    src: /logo.svg
    alt: Storion
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: Live Demos
      link: /demos
    - theme: alt
      text: GitHub
      link: https://github.com/linq2js/storion

features:
  - icon: 🎯
    title: Auto-tracking
    details: Read state → Storion tracks it. No manual dependency arrays or selectors to maintain.
  - icon: 🔒
    title: Full TypeScript
    details: Excellent type inference out of the box. Define once, get autocomplete everywhere.
  - icon: ⚡
    title: Fine-grained Updates
    details: Only re-render components that actually need to. No wasted renders.
  - icon: 🧩
    title: Composable Stores
    details: Stores can depend on other stores. Build complex state from simple pieces.
  - icon: ⏳
    title: First-class Async
    details: Loading, error, and success states handled automatically. Works with Suspense.
  - icon: 📦
    title: Tiny Footprint
    details: ~4KB minified + gzipped. No dependencies. No bloat.
---

<style>
:root {
  --vp-home-hero-name-color: transparent;
  --vp-home-hero-name-background: -webkit-linear-gradient(120deg, #6366f1 30%, #a855f7);
  --vp-home-hero-image-background-image: linear-gradient(-45deg, #6366f1 50%, #a855f7 50%);
  --vp-home-hero-image-filter: blur(44px);
}

@media (min-width: 640px) {
  :root {
    --vp-home-hero-image-filter: blur(56px);
  }
}

@media (min-width: 960px) {
  :root {
    --vp-home-hero-image-filter: blur(68px);
  }
}
</style>

## See Storion in 30 Seconds

Here's a complete, working counter:

```tsx
import { store, StoreProvider, useStore } from 'storion/react'

// STEP 1: Define your store ─────────────────────────────────────────────────
const counterStore = store({
  name: 'counter',          // Name appears in DevTools for easy debugging
  state: { count: 0 },      // Initial state — becomes reactive automatically

  // Setup runs once when store is first used
  setup({ state }) {
    return {
      // Actions: just mutate state directly!
      // Storion wraps state in a Proxy, so mutations trigger updates
      increment: () => { state.count++ },
      decrement: () => { state.count-- },
      reset: () => { state.count = 0 },
    }
  },
})

// STEP 2: Use in React ──────────────────────────────────────────────────────
function Counter() {
  // The selector function receives a context with `get` to access stores
  const { count, increment, decrement } = useStore(({ get }) => {
    // get() returns [state, actions] tuple
    const [state, actions] = get(counterStore)

    // Return only what this component needs
    // Storion tracks that we read `state.count` — so this component
    // ONLY re-renders when `count` changes, not other state
    return {
      count: state.count,
      increment: actions.increment,
      decrement: actions.decrement,
    }
  })

  return (
    <div>
      <button onClick={decrement}>-</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  )
}

// STEP 3: Wrap with Provider ────────────────────────────────────────────────
function App() {
  return (
    <StoreProvider>
      <Counter />
    </StoreProvider>
  )
}
```

::: details Don't like Providers? Use `create()` instead

```tsx
import { create } from 'storion/react'

const [counter, useCounter] = create({
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => { state.count++ },
      decrement: () => { state.count-- },
    }
  },
})

// No Provider needed!
function Counter() {
  const { count, increment, decrement } = useCounter((state, actions) => ({
    count: state.count,
    increment: actions.increment,
    decrement: actions.decrement,
  }))

  return (
    <div>
      <button onClick={decrement}>-</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  )
}
```

:::


### What's Happening Here?

| What You Write | What Storion Does |
|----------------|-------------------|
| `state.count++` | Detects mutation → notifies subscribers |
| `state.count` in selector | Tracks this property → re-renders when it changes |
| `StoreProvider` | Manages store instances and enables sharing across components |

::: tip Copy, paste, run
The example above works as-is. Just `npm install storion` and try it.
:::

---

## Why Storion?

### The Problem with Other Libraries

```tsx
// ❌ Zustand: One store per hook, manual selectors, memoize actions
function Component({ step }) {
  // Returning object? Need shallow compare or it re-renders every time!
  const { count, name } = useCounterStore(
    (state) => ({ count: state.count, name: state.name }),
    shallow  // forget this? re-renders on EVERY state change!
  )
  
  // Action uses props → need useCallback with deps
  const increment = useCallback(() => {
    useCounterStore.getState().incrementBy(step)
  }, [step])  // forget this dep? stale closure bug!
  
  return <ChildComponent onIncrement={increment} />
}

// ✅ Storion: Tracks state access, not selector result
function Component({ step }) {
  const { count, name, increment } = useStore(({ get }) => {
    const [counter, counterActions] = get(counterStore)
    const [user] = get(userStore)
    return {
      count: counter.count,    // ← Storion tracks this access
      name: user.name,         // ← and this access
      increment: () => counterActions.incrementBy(step),
    }
  })
  // No shallow compare needed — we track state.count and state.name changes
  // Not the selector result object. Return any shape you want!
  return <ChildComponent onIncrement={increment} />
}
```

### Feature Comparison

| Feature | Redux | Zustand | Jotai | **Storion** |
|---------|-------|---------|-------|-------------|
| Auto-tracking | ❌ Manual selectors | ❌ Manual selectors | ✅ | ✅ |
| Cross-store selection | ⚠️ Verbose | ❌ One hook per store | ❌ | ✅ **One hook** |
| Stable actions | ⚠️ useCallback | ⚠️ Extra selectors | ⚠️ | ✅ **Automatic** |
| Object selectors | ⚠️ Reselect | ⚠️ Need `shallow` | ✅ | ✅ **No compareFn** |
| TypeScript | ⚠️ Verbose | ✅ Good | ✅ Good | ✅ Excellent |
| Dependency Injection | ❌ | ❌ | ❌ | ✅ Built-in |
| Async State | ❌ External lib | ⚠️ Basic | ⚠️ Basic | ✅ First-class |
| Middleware | ✅ | ✅ | ❌ | ✅ |
| DevTools | ✅ | ✅ | ⚠️ | ✅ |
| Bundle Size | ~2KB | ~1KB | ~2KB | ~4KB |
| Learning Curve | Steep | Easy | Medium | **Easy** |

---

## Beyond the Basics

Storion grows with your app. Here's a taste of what's possible:

### Async Data Fetching

```tsx
import { async } from 'storion/async'

const userStore = store({
  name: 'user',
  state: {
    // async.fresh() = undefined while loading, data after success
    user: async.fresh<User>(),
  },
  setup({ focus }) {
    // Create an async action bound to state.user
    const userQuery = async(
      focus('user'),  // Links this action to state.user
      async (ctx, id: string) => {
        // ctx.signal auto-cancels on unmount or new request
        const res = await fetch(`/api/users/${id}`, { signal: ctx.signal })
        return res.json()
      }
    )

    return { fetchUser: userQuery.dispatch }
  },
})
```

### Cross-Store Dependencies

```tsx
const cartStore = store({
  name: 'cart',
  state: { items: [] },
  setup({ state, get }) {
    // Access other stores in setup
    const [userState] = get(userStore)

    return {
      checkout: async () => {
        // Use user state in cart actions
        await api.checkout(userState.user.data?.id, state.items)
      },
    }
  },
})
```

### Persistence (One Line)

```tsx
import { persist } from 'storion/persist'

const settingsStore = store({
  name: 'settings',
  state: { theme: 'dark', fontSize: 14 },
  meta: [persist()],  // ← Auto-saves to localStorage
})
```

::: info Ready to learn more?
These features are covered in the [Getting Started](/guide/getting-started) guide.
:::

---

## Live Demos

See Storion in action:

- 🎮 **Feature Showcase** — All major features demonstrated
- 🐾 **Pokemon App** — API integration with caching
- 💬 **Chat App** — Real-time with IndexedDB persistence
- 💰 **Expense Manager** — Clean architecture example

[View All Demos →](/demos)

---

## Get Started

<div class="getting-started-buttons">

[**📖 Read the Guide**](/guide/getting-started) — Step-by-step tutorial

[**📚 API Reference**](/api/store) — Detailed API documentation

[**💻 Try the Demos**](/demos) — Interactive examples

</div>

<style>
.getting-started-buttons {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 1.5rem;
}

.getting-started-buttons a {
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  text-decoration: none;
  transition: all 0.2s;
}

.getting-started-buttons a:hover {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
}
</style>

---

## Sponsors

<p align="center">
  <em>Become a sponsor to support Storion development!</em>
</p>
