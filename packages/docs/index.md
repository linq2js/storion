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

Here's a complete, working counter — no setup or Provider needed:

```tsx
import { store } from 'storion'
import { useStore } from 'storion/react'

// ═══════════════════════════════════════════════════════════════════════════
// STEP 1: Define your store
// ═══════════════════════════════════════════════════════════════════════════

const counterStore = store({
  // Name appears in DevTools for easy debugging
  name: 'counter',

  // Initial state — becomes reactive automatically
  state: { count: 0 },

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

// ═══════════════════════════════════════════════════════════════════════════
// STEP 2: Use in React — that's it!
// ═══════════════════════════════════════════════════════════════════════════

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
```

### What's Happening Here?

| What You Write | What Storion Does |
|----------------|-------------------|
| `state.count++` | Detects mutation → notifies subscribers |
| `state.count` in selector | Tracks this property → re-renders when it changes |
| Nothing else | No Provider, no context, no boilerplate |

::: tip Copy, paste, run
The example above works as-is. Just `npm install storion` and try it.
:::

---

## Why Storion?

### The Problem with Other Libraries

```tsx
// ❌ Redux: Lots of boilerplate
const INCREMENT = 'INCREMENT'
const increment = () => ({ type: INCREMENT })
const reducer = (state, action) => {
  switch (action.type) {
    case INCREMENT: return { ...state, count: state.count + 1 }
    default: return state
  }
}

// ❌ Zustand: Manual selectors for optimization
const useStore = create((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}))
// If you don't add selectors, EVERY component re-renders on ANY change
const count = useStore((state) => state.count) // must remember to do this!

// ✅ Storion: Just mutate state, auto-tracked
const { count, increment } = useStore(({ get }) => {
  const [state, actions] = get(counterStore)
  return { count: state.count, increment: actions.increment }
})
// Component only re-renders when count changes — automatically
```

### Feature Comparison

| Feature | Redux | Zustand | Jotai | **Storion** |
|---------|-------|---------|-------|-------------|
| Auto-tracking | ❌ Manual selectors | ❌ Manual selectors | ✅ | ✅ |
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

- 🎮 **[Feature Showcase](/demos/feature-showcase/)** — All major features demonstrated
- 🐾 **[Pokemon App](/demos/pokemon/)** — API integration with caching
- 💬 **[Chat App](/demos/chat/)** — Real-time with IndexedDB persistence
- 💰 **[Expense Manager](/demos/expense-manager/)** — Clean architecture example

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
