# Getting Started

This guide walks you through setting up Storion and building your first reactive store. By the end, you'll understand the core pattern that makes Storion different from other state management libraries.

## The Core Idea

Most state libraries require you to manually specify which state your component depends on. Storion flips this:

**You read state naturally → Storion automatically tracks what you read → Only re-renders when those specific values change.**

This means no forgotten dependencies, no stale closures, and no over-rendering.

## Installation

::: code-group

```bash [npm]
npm install storion
```

```bash [pnpm]
pnpm add storion
```

```bash [yarn]
yarn add storion
```

:::

## Your First Store

Let's build a counter to understand the pattern. We'll go step by step.

### 1. Define a Store

A store is a container for related state and the actions that modify it:

```ts
// stores/counterStore.ts
import { store } from 'storion/react';

export const counterStore = store({
  name: 'counter',
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => { state.count++; },
      decrement: () => { state.count--; },
      reset: () => { state.count = 0; },
    };
  },
});
```

**What's happening here:**

- `name` identifies the store in devtools and error messages
- `state` is your initial data - Storion wraps it in a reactive proxy
- `setup` receives the reactive state and returns actions that can modify it
- Actions mutate state directly - no need for `setState` or `dispatch`

### 2. Create a Container

The container is the central hub that manages all your store instances:

```tsx
// App.tsx
import { container, StoreProvider } from 'storion/react';

const app = container();

function App() {
  return (
    <StoreProvider container={app}>
      <Counter />
    </StoreProvider>
  );
}
```

**Why a container?**

- **Instance management**: Creates stores on-demand, caches them for reuse
- **Dependency injection**: Stores can access other stores and services
- **Isolation**: Different containers = different state (great for testing and SSR)
- **Cleanup**: Disposing the container cleans up all resources

### 3. Use the Store

Now connect your component to the store:

```tsx
// components/Counter.tsx
import { useStore } from 'storion/react';
import { counterStore } from '../stores/counterStore';

function Counter() {
  const { count, increment, decrement } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    return {
      count: state.count,
      increment: actions.increment,
      decrement: actions.decrement,
    };
  });

  return (
    <div>
      <button onClick={decrement}>-</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  );
}
```

**The magic happens here:**

1. When you access `state.count`, Storion records: "this component depends on `count`"
2. When `increment` changes `count`, Storion notifies only subscribers of `count`
3. Components that don't read `count` are never re-rendered

**The selector pattern:**

```ts
useStore(({ get }) => {
  // get() retrieves the store, returning [state, actions]
  const [state, actions] = get(counterStore);
  
  // Return only what this component needs
  // Everything you access here is tracked
  return { count: state.count, increment: actions.increment };
});
```

This is different from Redux/Zustand where you manually tell it what to watch. Here, you just use state naturally and Storion figures out the dependencies.

## Single-Store Shorthand

For simple apps or isolated features, skip the container setup with `create()`:

```tsx
import { create } from 'storion/react';

// Creates both the store and a custom hook in one call
const [counter, useCounter] = create({
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => { state.count++; },
    };
  },
});

function Counter() {
  // Simpler selector: (state, actions) => ...
  const { count, increment } = useCounter((state, actions) => ({
    count: state.count,
    increment: actions.increment,
  }));

  return <button onClick={increment}>{count}</button>;
}

// No StoreProvider needed!
```

**When to use `create()` vs `store()` + container:**

| Approach | Best for |
|----------|----------|
| `create()` | Single feature, isolated component, quick prototypes |
| `store()` + container | Multiple stores, cross-store dependencies, DI |

## Understanding Reactivity

Here's what makes Storion efficient:

```tsx
function UserCard() {
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore);
    return { name: state.name }; // Only tracks 'name'
  });
  
  // This component ONLY re-renders when name changes
  // Changes to state.email, state.age, etc. are ignored
  return <h1>{name}</h1>;
}
```

Compare to Redux:

```tsx
// Redux - must remember to use shallow equality
const name = useSelector(state => state.user.name);

// Or write a custom selector with reselect
const selectUserName = createSelector(
  state => state.user,
  user => user.name
);
```

Storion handles this automatically - no selectors, no memoization, no `shallowEqual`.

## Common Patterns

### Accessing Multiple Stores

```tsx
const { userName, todoCount } = useStore(({ get }) => {
  const [userState] = get(userStore);
  const [todoState] = get(todoStore);
  
  return {
    userName: userState.name,
    todoCount: todoState.items.length,
  };
});
```

### Triggering Actions on Mount

Use `trigger()` for effects that should run based on dependencies:

```tsx
import { trigger } from 'storion';

function UserProfile({ userId }: { userId: string }) {
  const { user, fetchUser } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    
    // Fetch when userId changes
    trigger(actions.fetchUser, [userId], userId);
    
    return { user: state.currentUser, fetchUser: actions.fetchUser };
  });
  
  // ...
}
```

### Stable Function References

Functions returned from `useStore` are automatically stable:

```tsx
const { search } = useStore(({ get }) => {
  const [, actions] = get(searchStore);
  
  return {
    // This function reference never changes between renders
    // Safe to pass to memoized children
    search: () => actions.search(query),
  };
});

// Won't cause re-renders of MemoizedButton
<MemoizedButton onClick={search}>Search</MemoizedButton>
```

## What's Next?

Now that you understand the basics:

- **[Core Concepts](/guide/core-concepts)** — Understand stores, services, and containers in depth
- **[Stores](/guide/stores)** — Learn about state mutation, focus, and lifecycle
- **[Reactivity](/guide/reactivity)** — Deep dive into how tracking works
- **[Async State](/guide/async)** — Handle loading, error, and success states
- **[Effects](/guide/effects)** — Create reactive side effects

::: tip Progressive Complexity
Storion is designed to be **simple at first, powerful as you grow**. Start with basic stores and direct mutations. As your app grows, layer in async state, effects, dependency injection, and middleware — all without rewriting existing code.
:::
