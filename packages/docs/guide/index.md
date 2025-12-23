# What is Storion?

Storion is a lightweight state management library that automatically tracks which parts of your state you use and only updates when those parts change.

## The Problem with Traditional State Management

Most state libraries require you to manually tell them what data your component needs:

```tsx
// Redux - manual selectors
const name = useSelector((state) => state.user.name);

// Zustand - manual selectors
const name = useStore((state) => state.user.name);
```

This works, but it's easy to:

- Forget to add dependencies
- Over-select (getting more state than needed, causing extra renders)
- Under-select (missing a dependency, causing stale data)

## Storion's Approach: Automatic Tracking

Storion flips the model:

1. **You read state naturally** → Storion remembers what you read
2. **That state changes** → Storion updates only the components that need it

```tsx
function Counter() {
  const { count, inc } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    return { count: state.count, inc: actions.inc };
  });

  return <button onClick={inc}>{count}</button>;
}
```

**What happens behind the scenes:**

- When you access `state.count`, Storion records: "this component depends on `count`"
- When `inc()` modifies `count`, Storion notifies only subscribers of `count`
- If `state.email` changes, this component is not re-rendered

No manual dependency arrays. No forgotten selectors. Just natural code.

## Key Features

### 🎯 Auto-tracking

No need to manually specify dependencies. Just use the state, and Storion tracks it for you.

```tsx
// Storion automatically knows this component depends on:
// - state.user.name
// - state.todos.length
const { userName, todoCount } = useStore(({ get }) => {
  const [userState] = get(userStore);
  const [todoState] = get(todoStore);
  return {
    userName: userState.name,
    todoCount: todoState.todos.length,
  };
});
```

### 🔒 Type-safe

Full TypeScript support with excellent inference. Your IDE knows exactly what's in your state and actions.

```ts
const userStore = store({
  name: "user",
  state: { name: "", age: 0 },
  setup({ state }) {
    return {
      setName: (name: string) => {
        state.name = name;
      },
      // TypeScript infers: setName: (name: string) => void
    };
  },
});
```

### ⚡ Fine-grained Updates

Unlike traditional state management where any state change triggers a re-render, Storion only updates components that actually use the changed data.

```tsx
function UserName() {
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore);
    return { name: state.name }; // Only tracks 'name'
  });
  // Only re-renders when name changes
  // Changes to age, email, etc. are ignored
}
```

### 🧩 Composable

Stores can depend on other stores. Services can be injected. Everything composes naturally.

```ts
const cartStore = store({
  setup({ get }) {
    const [userState] = get(userStore); // Access another store
    const api = get(apiService); // Inject a service

    return {
      checkout: () => api.checkout(userState.id),
    };
  },
});
```

### 📦 Tiny

~4KB minified and gzipped. No heavy dependencies.

### ⏳ First-class Async

Built-in support for loading states, error handling, cancellation, and Suspense.

```ts
state: {
  user: async.fresh<User>(),  // Loading state built-in
},
setup({ focus }) {
  const userQuery = async.action(focus('user'), async (ctx, id) => {
    const res = await fetch(`/api/users/${id}`, { signal: ctx.signal });
    return res.json();
  });
}
```

## When to Use Storion?

Storion is great for:

- ✅ React applications of any size
- ✅ Apps requiring fine-grained reactivity
- ✅ Teams that value type safety
- ✅ Projects needing dependency injection
- ✅ Apps with complex async data flows
- ✅ Teams wanting simple-to-start, powerful-when-needed

Consider alternatives if:

- ❌ You need server-side caching with automatic revalidation (consider [TanStack Query](https://tanstack.com/query) alongside Storion)
- ❌ Your team is already productive with another solution
- ❌ You need the largest possible ecosystem

## Progressive Complexity

Storion is designed to be **simple at first, powerful as you grow**:

| Stage                | Features                                    |
| -------------------- | ------------------------------------------- |
| **Getting started**  | Stores, direct mutation, `useStore`         |
| **Growing app**      | Multiple stores, services, `update()`       |
| **Complex features** | Async state, effects, `focus()`             |
| **Large app**        | Middleware, meta, persistence, DI           |
| **Advanced**         | Custom equality, network layer, SSR support |

You only learn what you need, when you need it.

## Next Steps

Ready to start?

- **[Getting Started](/guide/getting-started)** — Install and build your first store
- **[Core Concepts](/guide/core-concepts)** — Understand stores, containers, and services
- **[Examples](/examples/)** — See complete working examples
