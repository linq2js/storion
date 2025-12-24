# Welcome to Storion

Storion is a **reactive state management library for React** that automatically tracks what state you use and only updates when those values change.

No manual selectors. No dependency arrays. Just write natural code.

<div class="hero-badge">
  <span>~4KB</span> minified • <span>Zero</span> dependencies • <span>TypeScript</span> first
</div>

---

## Prerequisites

Before starting, you should be comfortable with:

- **React fundamentals** — Components, hooks (`useState`, `useEffect`), props
- **TypeScript basics** — Types, interfaces, generics (optional but recommended)
- **npm/pnpm/yarn** — Installing packages and running scripts

::: tip New to React?
Check out the [official React docs](https://react.dev/learn) first. Storion builds on React's mental model.
:::

---

## Choose Your Path

### 🚀 Quick Start
**5 minutes** — Jump straight into code

Perfect if you learn by doing. Get a working store up and running immediately.

1. **[Getting Started](/guide/getting-started)** — Install and build your first store
2. **[Counter Example](/examples/counter)** — See the complete code

### 📖 Concept First
**30 minutes** — Understand the architecture

Best if you want to know the "why" before the "how".

1. **[Core Concepts](/guide/core-concepts)** — Architecture and design philosophy
2. **[Stores](/guide/stores)** — How state and actions work together
3. **[Getting Started](/guide/getting-started)** — Then build something

### 🔧 API Reference
**Reference as needed** — For experienced developers

Already know state management? Jump to what you need:

- **[API Reference](/api/store)** — Complete API documentation
- **[Examples](/examples/)** — Common patterns with code
- **[Live Demos](/demos)** — Interactive showcases

---

## The Problem We Solve

Most state libraries require **manual dependency tracking**:

```ts
// ❌ Redux/Zustand: Specify exactly what you need
const name = useSelector((state) => state.user.name);
const email = useSelector((state) => state.user.email);

// Forget a selector? Stale data.
// Select too much? Extra re-renders.
// Return new object? Infinite loops.
```

Storion uses **automatic tracking**:

```tsx
// ✅ Storion: Just use state naturally
const { name, email } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { name: state.name, email: state.email };
});

// Storion tracks that you accessed `name` and `email`
// Component re-renders ONLY when those values change
```

### Comparison

| Scenario | Redux/Zustand | Storion |
|----------|---------------|---------|
| Return new object | ❌ Causes infinite re-render | ✅ Works correctly |
| Computed values | ❌ Need manual memoization | ✅ Automatic |
| Conditional access | ❌ Manual dependency handling | ✅ Automatic |
| Multiple properties | ❌ Need shallowEqual | ✅ Just works |
| Nested state access | ❌ Need structured selectors | ✅ Access naturally |

---

## Key Features

<div class="features-grid">

<div class="feature">
<h4>🎯 Auto-Tracking</h4>
<p>No manual dependency arrays. Read state naturally and Storion tracks it for you.</p>
</div>

<div class="feature">
<h4>🔒 Type-Safe</h4>
<p>Full TypeScript inference for state, actions, and selectors. No explicit generics needed.</p>
</div>

<div class="feature">
<h4>⚡ Fine-Grained</h4>
<p>Only re-renders components that actually use the changed data. No wasted renders.</p>
</div>

<div class="feature">
<h4>🧩 Composable</h4>
<p>Stores can access other stores. Build complex state from simple, focused pieces.</p>
</div>

<div class="feature">
<h4>⏳ First-Class Async</h4>
<p>Built-in loading states, error handling, cancellation, and retry. No extra libraries.</p>
</div>

<div class="feature">
<h4>🧪 Testable</h4>
<p>Dependency injection makes testing easy. Mock services, isolate stores, test in Node.</p>
</div>

</div>

---

## Progressive Complexity

Storion grows with your app. Start simple, add complexity only when needed:

| Stage | What You Learn | Features Used |
|-------|----------------|---------------|
| **Beginner** | Basic state management | `store()`, `useStore()`, direct mutation |
| **Growing** | Multiple stores | Cross-store `get()`, `update()` |
| **Complex** | Async operations | `async()`, `focus()`, `trigger()` |
| **Enterprise** | Architecture | Middleware, meta, persistence, DI |

::: info You don't need everything
Most apps only need stores, actions, and useStore. Advanced features exist for when your app needs them.
:::

---

## Guide Structure

### Getting Started
- **[Getting Started](/guide/getting-started)** — Installation and first store
- **[Core Concepts](/guide/core-concepts)** — Architecture overview

### State & Actions
- **[Stores](/guide/stores)** — Defining state and actions
- **[Actions](/guide/actions)** — Functions that modify state
- **[Reactivity](/guide/reactivity)** — How auto-tracking works

### Async & Effects
- **[Effects](/guide/effects)** — Side effects that react to state
- **[Async](/guide/async)** — Loading states and data fetching

### Advanced
- **[Meta](/guide/meta)** — Annotations for middleware
- **[Middleware](/guide/middleware)** — Cross-cutting concerns
- **[Persistence](/guide/persistence)** — Saving state to storage
- **[Dependency Injection](/guide/dependency-injection)** — Services and testing
- **[Testing](/guide/testing)** — Unit and integration tests
- **[DevTools](/guide/devtools)** — Debugging and inspection

### React Integration
- **[useStore](/guide/react/use-store)** — The main React hook
- **[StoreProvider](/guide/react/provider)** — Container isolation
- **[withStore](/guide/react/with-store)** — HOC for class components

---

## Quick Links

<div class="quick-links">

<a href="/guide/getting-started" class="link-card">
  <span class="icon">📖</span>
  <strong>Getting Started</strong>
  <span>Your first store in 5 minutes</span>
</a>

<a href="/api/store" class="link-card">
  <span class="icon">📚</span>
  <strong>API Reference</strong>
  <span>Complete documentation</span>
</a>

<a href="/demos" class="link-card">
  <span class="icon">💻</span>
  <strong>Live Demos</strong>
  <span>See Storion in action</span>
</a>

<a href="/examples/" class="link-card">
  <span class="icon">🧩</span>
  <strong>Examples</strong>
  <span>Common patterns with code</span>
</a>

</div>

<style>
.hero-badge {
  display: inline-flex;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: var(--vp-c-bg-soft);
  border-radius: 20px;
  font-size: 0.875rem;
  margin-top: 1rem;
}

.hero-badge span {
  font-weight: 600;
  color: var(--vp-c-brand-1);
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 1.5rem;
  margin: 1.5rem 0;
}

.feature {
  padding: 1.25rem;
  background: var(--vp-c-bg-soft);
  border-radius: 12px;
  border: 1px solid var(--vp-c-divider);
}

.feature h4 {
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
}

.feature p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
}

.quick-links {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin: 1.5rem 0;
}

.link-card {
  display: flex;
  flex-direction: column;
  padding: 1.25rem;
  border-radius: 12px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  text-decoration: none !important;
  transition: border-color 0.2s, transform 0.2s;
}

.link-card:hover {
  border-color: var(--vp-c-brand-1);
  transform: translateY(-2px);
}

.link-card .icon {
  font-size: 1.5rem;
  margin-bottom: 0.5rem;
}

.link-card strong {
  color: var(--vp-c-text-1);
  font-size: 1rem;
}

.link-card span:last-child {
  font-size: 0.875rem;
  color: var(--vp-c-text-2);
  margin-top: 0.25rem;
}
</style>

---

## Need Help?

- 🐛 **Found a bug?** [Open an issue](https://github.com/linq2js/storion/issues)
- 💬 **Have questions?** [Start a discussion](https://github.com/linq2js/storion/discussions)
- 📖 **Docs unclear?** Help us improve by suggesting edits

---

**Ready to start?** [Let's build your first store →](/guide/getting-started)
