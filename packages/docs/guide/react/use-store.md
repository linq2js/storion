# useStore

`useStore` is the primary hook for connecting React components to Storion stores. It handles subscriptions, automatic re-rendering, and provides access to state and actions.

## The Basics

```tsx
import { useStore } from "storion/react";
import { userStore } from "../stores/userStore";

function UserProfile() {
  const { name, setName } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    return {
      name: state.name,
      setName: actions.setName,
    };
  });

  return (
    <input
      value={name}
      onChange={(e) => setName(e.target.value)}
    />
  );
}
```

**What happens:**

1. `useStore` calls your selector function
2. Selector calls `get(userStore)` to access the store
3. Reading `state.name` creates a subscription to that property
4. When `name` changes, component re-renders with new value
5. Changes to other state properties don't trigger re-renders

## The Selector Function

The selector receives a context object and returns what the component needs:

```ts
useStore(({ get, mixin, scoped, id, once }) => {
  // get() - Access stores and services
  const [state, actions] = get(userStore);
  const api = get(apiService);

  // mixin() - Use selector mixins
  const [asyncState, asyncActions] = mixin(asyncMixin);

  // scoped() - Component-local store instances
  const [formState, formActions] = scoped(formStore);

  // id - Unique ID for this component instance
  console.log("Component ID:", id);

  // once() - Run code once on mount
  once(() => {
    console.log("Component mounted");
  });

  // Return what the component needs
  return { name: state.name, setName: actions.setName };
});
```

## Accessing Multiple Stores

Combine data from multiple stores in a single selector:

```tsx
function Dashboard() {
  const { userName, todoCount, cartTotal } = useStore(({ get }) => {
    const [userState] = get(userStore);
    const [todoState] = get(todoStore);
    const [cartState] = get(cartStore);

    return {
      userName: userState.name,
      todoCount: todoState.items.length,
      cartTotal: cartState.items.reduce((sum, i) => sum + i.price, 0),
    };
  });

  return (
    <div>
      <h1>Welcome, {userName}</h1>
      <p>{todoCount} todos | ${cartTotal} in cart</p>
    </div>
  );
}
```

## Computed Values

Derive values in the selector - they're recalculated on each render:

```tsx
function TodoStats() {
  const { completed, total, progress } = useStore(({ get }) => {
    const [state] = get(todoStore);

    const completed = state.items.filter((t) => t.done).length;
    const total = state.items.length;

    return {
      completed,
      total,
      progress: total > 0 ? Math.round((completed / total) * 100) : 0,
    };
  });

  return (
    <div>
      {completed}/{total} completed ({progress}%)
    </div>
  );
}
```

## Optimizing Re-renders

### Return Only What You Need

The most important optimization is returning only what your component uses:

```tsx
// ❌ Bad - returns entire state, re-renders on ANY change
const { state } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { state }; // Tracks everything!
});

// ✅ Good - returns specific values, re-renders only when they change
const { name, email } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { name: state.name, email: state.email };
});
```

### Use pick() for Fine-grained Control

For collections or nested objects, use `pick()` to control exactly what triggers re-renders:

```tsx
import { pick } from "storion";

function TodoCount() {
  const { count } = useStore(({ get }) => {
    const [state] = get(todoStore);
    return {
      // Only re-renders when items.length changes
      // Not when item content changes
      count: pick(() => state.items.length),
    };
  });

  return <span>{count} items</span>;
}
```

### Custom Equality with pick()

```tsx
import { pick, shallowEqual, deepEqual } from "storion";

const result = useStore(({ get }) => {
  const [state] = get(todoStore);
  return {
    // Strict equality (default)
    filter: state.filter,

    // Shallow equality - good for arrays
    items: pick(() => state.items, "shallow"),

    // Deep equality - good for nested objects
    settings: pick(() => state.settings, "deep"),

    // Custom comparison
    ids: pick(
      () => state.items.map((i) => i.id),
      (a, b) => a.join(",") === b.join(",")
    ),
  };
});
```

## Stable Function References

Functions returned from `useStore` are automatically wrapped with stable references:

```tsx
function SearchForm({ userId }) {
  const [query, setQuery] = useState("");

  const { results, search } = useStore(({ get }) => {
    const [state, actions] = get(searchStore);
    return {
      results: state.results,
      // This function reference is STABLE
      // It won't change between renders
      // But it always has access to current query and userId
      search: () => actions.search(query, userId),
    };
  });

  return (
    <div>
      <input value={query} onChange={(e) => setQuery(e.target.value)} />
      {/* Safe to pass to memoized children */}
      <MemoizedButton onClick={search}>Search</MemoizedButton>
      <Results items={results} />
    </div>
  );
}

// Button never re-renders due to onClick changes
const MemoizedButton = memo(({ onClick, children }) => (
  <button onClick={onClick}>{children}</button>
));
```

**Why this matters:**

- No need for `useCallback` - functions are stable automatically
- Safe to pass to `memo()` components without causing re-renders
- Always has access to current props and state

## Triggering Actions

Use `trigger()` for effects that should run based on dependencies:

```tsx
import { trigger } from "storion";

function UserProfile({ userId }) {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);

    // Fetch when userId changes
    trigger(actions.fetchUser, [userId], userId);

    return { user: state.user };
  });

  return <div>{user.data?.name}</div>;
}
```

**trigger() patterns:**

| Pattern                                    | Behavior                         |
| ------------------------------------------ | -------------------------------- |
| `trigger(fn, [])`                          | Run once, ever                   |
| `trigger(fn, [id])`                        | Run every mount (id is unique)   |
| `trigger(fn, [userId], userId)`            | Run when userId changes          |
| No trigger                                 | User controls when to call       |

::: warning Important
Never pass anonymous functions to `trigger()`:

```ts
// ❌ WRONG - new function each render = infinite calls
trigger(() => actions.fetch(id), [id]);

// ✅ CORRECT - stable function reference
trigger(actions.fetch, [id], id);
```
:::

## Component-Local State with scoped()

Use `scoped()` for stores that should be isolated per component:

```tsx
function FormComponent() {
  const { value, setValue, reset } = useStore(({ get, scoped }) => {
    // Global store - shared across components
    const [userState] = get(userStore);

    // Component-local store - isolated, auto-disposed on unmount
    const [formState, formActions] = scoped(formStore);

    return {
      value: formState.value,
      setValue: formActions.setValue,
      reset: formActions.reset,
    };
  });

  return (
    <div>
      <input value={value} onChange={(e) => setValue(e.target.value)} />
      <button onClick={reset}>Reset</button>
    </div>
  );
}
```

**When to use `scoped()`:**

- Form state that shouldn't be shared
- Modal/dialog internal state
- Temporary UI state
- Any state that should reset when component unmounts

## Using Mixins

Mixins provide reusable selector logic:

```tsx
import { async } from "storion/async";

// Define a mixin for async operations
const submitMixin = async.mixin(async (ctx, data: FormData) => {
  const res = await fetch("/api/submit", {
    method: "POST",
    body: JSON.stringify(data),
    signal: ctx.signal,
  });
  return res.json();
});

function ContactForm() {
  const { status, error, submit } = useStore(({ mixin }) => {
    const [state, actions] = mixin(submitMixin);
    return {
      status: state.status,
      error: state.error,
      submit: actions.dispatch,
    };
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(data); }}>
      <button disabled={status === "pending"}>Submit</button>
      {status === "error" && <p>{error.message}</p>}
    </form>
  );
}
```

## Requirements

`useStore` must be used within a `StoreProvider`:

```tsx
import { container, StoreProvider } from "storion/react";

const app = container();

function App() {
  return (
    <StoreProvider container={app}>
      <YourApp /> {/* useStore works anywhere in this tree */}
    </StoreProvider>
  );
}
```

## Common Patterns

### Loading States

```tsx
function UserProfile({ userId }) {
  const { user, fetchUser } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    trigger(actions.fetchUser, [userId], userId);
    return { user: state.user, fetchUser: actions.fetchUser };
  });

  if (user.status === "idle") return <button onClick={() => fetchUser(userId)}>Load</button>;
  if (user.status === "pending") return <Spinner />;
  if (user.status === "error") return <Error error={user.error} />;
  return <div>{user.data.name}</div>;
}
```

### Conditional Store Access

```tsx
function MaybeAdmin({ isAdmin }) {
  const result = useStore(({ get }) => {
    const [userState] = get(userStore);

    // Only access admin store if user is admin
    if (isAdmin) {
      const [adminState] = get(adminStore);
      return { user: userState, admin: adminState };
    }

    return { user: userState, admin: null };
  });

  return <div>...</div>;
}
```

### Accessing Services

```tsx
function DataView() {
  const { data, refresh } = useStore(({ get }) => {
    const [state, actions] = get(dataStore);
    const logger = get(loggerService); // Services work too

    return {
      data: state.data,
      refresh: () => {
        logger.info("Refreshing data");
        actions.refresh();
      },
    };
  });
}
```

## Pre-bound Hooks with useStore.from()

For components that primarily work with a single store, `useStore.from()` creates a simpler hook:

```tsx
import { useStore } from "storion/react";
import { counterStore } from "../stores/counterStore";

// Create a pre-bound hook
const useCounter = useStore.from(counterStore);

function Counter() {
  // State and actions are provided directly - no get() needed
  const { count, increment } = useCounter((state, actions) => ({
    count: state.count,
    increment: actions.increment,
  }));

  return <button onClick={increment}>{count}</button>;
}
```

### When to Use

| Pattern | Use Case |
|---------|----------|
| `useStore()` | Multiple stores, complex selectors |
| `useStore.from(spec)` | Single store focus, simpler syntax |

### Module Pattern

Export the pre-bound hook alongside your store for cleaner imports:

```ts
// stores/counter.ts
export const counterStore = store({
  name: "counter",
  state: { count: 0 },
  setup: ({ state }) => ({
    increment: () => { state.count++; },
  }),
});

export const useCounter = useStore.from(counterStore);
```

```tsx
// components/Counter.tsx
import { useCounter } from "../stores/counter";

function Counter() {
  const { count, increment } = useCounter((state, actions) => ({
    count: state.count,
    increment: actions.increment,
  }));
  
  return <button onClick={increment}>{count}</button>;
}
```

### Accessing Other Stores

The third parameter provides full context access:

```tsx
const useCounter = useStore.from(counterStore);

function UserCounter() {
  const { count, userName } = useCounter((state, actions, ctx) => {
    const [userState] = ctx.get(userStore);
    return {
      count: state.count,
      userName: userState.name,
    };
  });
}
```

See [`useStore.from()` API reference](/api/use-store#usestorefrom) for more details.

## Selector Context Reference

| Property   | Type                                     | Description                           |
| ---------- | ---------------------------------------- | ------------------------------------- |
| `get`      | `(spec) => [state, actions]` or `T`      | Access stores and services            |
| `mixin`    | `(mixin, ...args) => result`             | Use selector mixins                   |
| `scoped`   | `(spec) => [state, actions, instance]`   | Component-local store instances       |
| `id`       | `object`                                 | Unique ID per component mount         |
| `once`     | `(fn) => void`                           | Run function once on mount            |

## See Also

- **[Reactivity](/guide/reactivity)** — How dependency tracking works
- **[trigger()](/api/trigger)** — Running effects in selectors
- **[useStore API](/api/use-store)** — Complete API reference
- **[Stores](/guide/stores)** — Creating stores
