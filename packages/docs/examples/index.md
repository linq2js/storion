# Examples

Step-by-step tutorials to learn Storion patterns. Start with the basics and progress to more advanced scenarios.

## Basic Examples

### [Counter](/examples/counter)

The classic counter example — your first Storion store.

**What you'll learn:**
- Defining a store with [`store()`](/api/store)
- Direct state mutation (`state.count++`)
- Using [`useStore()`](/api/use-store) hook in React
- The [`create()`](/api/create) shorthand for single-store apps

```ts
// Preview: A simple counter store
const counterStore = store({
  name: 'counter',
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => { state.count++ },
      decrement: () => { state.count-- },
    };
  },
});
```

---

### [Todo App](/examples/todo)

Build a complete TodoMVC-style app with CRUD operations and filtering.

**What you'll learn:**
- Nested state mutations with `update()` (Immer-style)
- Computed values in selectors
- Component composition patterns
- Optional persistence with [`persist()`](/api/persist-middleware)

**Features covered:**
- ✅ Add, toggle, delete todos
- ✅ Filter by all/active/completed
- ✅ Computed counts (remaining items)
- ✅ Clear completed action
- ✅ Local storage persistence

---

## Intermediate Examples

### [Async Data](/examples/async-data)

Master async state management with loading, error, and success states.

**What you'll learn:**
- Fresh vs Stale async modes (`async.fresh` / `async.stale`)
- Using [`trigger()`](/api/trigger) for data fetching
- Request cancellation with `ctx.signal`
- React Suspense integration with `async.wait()`
- Stale-while-revalidate pattern

**Features covered:**
- ✅ Loading spinners and error handling
- ✅ Automatic request cancellation
- ✅ Background refresh without UI flicker
- ✅ Combining multiple async states

```ts
// Preview: Async state with automatic cancellation
const userQuery = async(
  focus('user'),
  async (ctx, userId: string) => {
    const res = await fetch(`/api/users/${userId}`, {
      signal: ctx.signal, // Auto-cancels on unmount or new request
    });
    return res.json();
  }
);
```

---

## Live Demos

Interactive demo applications deployed on GitHub Pages:

| Demo | Description | Key Features |
|------|-------------|--------------|
| **[Feature Showcase](/demos)** | All Storion features in one app | Stores, effects, async, persistence |
| **[Pokemon App](/demos)** | API integration example | Search, caching, infinite scroll |
| **[Chat App](/demos)** | Real-time state management | IndexedDB, multi-store, cross-tab sync |
| **[Expense Manager](/demos)** | Clean architecture example | DDD, use cases, dependency injection |

---

## Running Examples Locally

```bash
# Clone the repo
git clone https://github.com/linq2js/storion.git
cd storion

# Install dependencies
pnpm install

# Run a specific demo
pnpm --filter feature-showcase dev   # Feature Showcase
pnpm --filter pokemon dev            # Pokemon App  
pnpm --filter chat dev               # Chat App
pnpm --filter expense-manager dev    # Expense Manager
```

## Next Steps

After completing these examples:

- **[Core Concepts](/guide/core-concepts)** — Deep dive into stores, reactivity, and actions
- **[API Reference](/api/store)** — Complete API documentation
- **[Middleware](/guide/middleware)** — Extend Storion with custom middleware

