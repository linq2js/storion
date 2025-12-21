# What is Storion?

Storion is a lightweight state management library that automatically tracks which parts of your state you use and only updates when those parts change.

## The Core Idea

1. **You read state** → Storion remembers what you read
2. **That state changes** → Storion updates only the components that need it

No manual selectors. No accidental over-rendering. Just write natural code.

```tsx
function Counter() {
  const { count, inc } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    return { count: state.count, inc: actions.inc };
  });

  return <button onClick={inc}>{count}</button>;
}
```

**What happens:**

- When you access `state.count`, Storion notes that this component depends on `count`
- When `count` changes, Storion re-renders only this component
- If other state properties change, this component stays untouched

## Key Features

### 🎯 Auto-tracking

No need to manually specify dependencies. Just use the state, and Storion tracks it for you.

### 🔒 Type-safe

Full TypeScript support with excellent inference. Your IDE knows exactly what's in your state and actions.

### ⚡ Fine-grained Updates

Unlike traditional state management where any state change triggers a re-render, Storion only updates components that actually use the changed data.

### 🧩 Composable

Stores can depend on other stores. Services can be injected. Everything composes naturally.

### 📦 Tiny

~4KB minified and gzipped. No heavy dependencies.

## When to Use Storion?

Storion is great for:

- ✅ React applications of any size
- ✅ Apps requiring fine-grained reactivity
- ✅ Teams that value type safety
- ✅ Projects needing dependency injection
- ✅ Apps with complex async data flows

Consider alternatives if:

- ❌ You need server-side state management (use TanStack Query)
- ❌ Your team is already productive with another solution
- ❌ You need the largest possible ecosystem

