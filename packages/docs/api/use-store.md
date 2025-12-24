# useStore()

React hook for accessing stores with automatic reactivity.

## Signature

```ts
function useStore<T>(selector: (ctx: SelectorContext) => T): T;
```

## Parameters

### selector

Function that selects data from stores. Receives a context with:

```ts
interface SelectorContext {
  // Get store from global container: [state, actions]
  get<TState, TActions>(store: StoreSpec<TState, TActions>): [TState, TActions];

  // Get a service/factory from container
  get<T>(factory: (resolver: Resolver) => T): T;

  // Create component-local store: [state, actions, instance]
  scoped<TState, TActions>(
    store: StoreSpec<TState, TActions>
  ): [TState, TActions, StoreInstance];

  // Apply reusable selector logic
  mixin<TResult, TArgs>(
    mixin: SelectorMixin<TResult, TArgs>,
    ...args: TArgs
  ): TResult;

  // Run callback once on mount
  once(callback: () => void): void;

  // Unique ID for this component instance (useful with trigger)
  readonly id: object;
}
```

## Basic Example

```tsx
import { useStore } from "storion/react";

function Counter() {
  const { count, increment } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    return {
      count: state.count,
      increment: actions.increment,
    };
  });

  return <button onClick={increment}>Count: {count}</button>;
}
```

## Automatic Reactivity

The hook automatically tracks which state properties you access:

```tsx
function UserGreeting() {
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore);
    // Only re-renders when state.name changes
    // Changes to state.email won't cause re-render
    return { name: state.name };
  });

  return <h1>Hello, {name}!</h1>;
}
```

## Multiple Stores

```tsx
function CartSummary() {
  const { items, user } = useStore(({ get }) => {
    const [cartState] = get(cartStore);
    const [userState] = get(userStore);

    return {
      items: cartState.items,
      user: userState.name,
    };
  });

  return (
    <div>
      {user}'s cart: {items.length} items
    </div>
  );
}
```

## Computed Values

```tsx
function TodoStats() {
  const { total, completed, active } = useStore(({ get }) => {
    const [state] = get(todoStore);

    return {
      total: state.items.length,
      completed: state.items.filter((t) => t.completed).length,
      active: state.items.filter((t) => !t.completed).length,
    };
  });

  return (
    <div>
      {completed}/{total} completed, {active} remaining
    </div>
  );
}
```

## With Data Fetching

```tsx
import { useStore, trigger } from "storion/react";

function UserProfile({ userId }: { userId: string }) {
  const { user, loading, error } = useStore(({ get }) => {
    const [state, actions] = get(userStore);

    // Trigger fetch when userId changes
    trigger(actions.fetchUser, [userId], userId);

    return {
      user: state.user.data,
      loading: state.user.status === "pending",
      error: state.user.status === "error" ? state.user.error : null,
    };
  });

  if (loading) return <Spinner />;
  if (error) return <Error error={error} />;

  return <div>{user?.name}</div>;
}
```

## Performance Tips

### Select Only What You Need

```tsx
// ❌ Selecting entire state causes unnecessary re-renders
const state = useStore(({ get }) => get(userStore)[0]);

// ✅ Select only needed fields
const { name } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { name: state.name };
});
```

### Memoize Expensive Computations

```tsx
// ❌ BAD - computation runs on every render
const { filteredItems } = useStore(({ get }) => {
  const [state] = get(todoStore);
  return {
    filteredItems: state.items.filter(
      (t) =>
        state.filter === "all" || (state.filter === "completed") === t.completed
    ),
  };
});
```

Instead, compute in the store using an effect:

```ts
// ✅ GOOD - store computes once, component just reads
const todoStore = store({
  name: "todo",
  state: {
    items: [] as Todo[],
    filter: "all" as "all" | "active" | "completed",
    filteredItems: [] as Todo[], // Derived state
  },
  setup({ state, effect }) {
    // Auto-updates when items or filter changes
    effect(() => {
      state.filteredItems = state.items.filter(
        (t) =>
          state.filter === "all" ||
          (state.filter === "completed") === t.completed
      );
    });

    return {
      /* actions */
    };
  },
});

// Component just reads the pre-computed value
const { filteredItems } = useStore(({ get }) => {
  const [state] = get(todoStore);
  return { filteredItems: state.filteredItems };
});
```

## Effects in Selector

Use `effect()` inside the selector to create effects that:
- Access component-scope values (refs, props, other hooks)
- Auto-track store state dependencies
- Run after render (in React's `useEffect`)

```tsx
import { useStore, effect } from "storion/react";

function SearchPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();

  const { query } = useStore(({ get }) => {
    const [state] = get(searchStore);

    // Effect with access to refs, props, AND auto-tracked store state
    effect(() => {
      if (location.pathname === "/search" && state.isReady) {
        inputRef.current?.focus();
      }
    });

    return { query: state.query };
  });

  return <input ref={inputRef} value={query} />;
}
```

### Key Behavior

| Aspect | Behavior |
|--------|----------|
| **Execution** | Runs in `useEffect` (after render) |
| **Closure** | Fresh each render (access to current refs/props/hooks) |
| **Tracking** | Auto-tracks store state reads |
| **Re-runs** | When tracked state changes |
| **Cleanup** | Runs on unmount or before re-run |
| **Consolidation** | Multiple `effect()` calls → single React `useEffect` |

### Effect-Only Reactivity

Effects can track state **without causing component re-renders**:

```tsx
function AnalyticsTracker() {
  useStore(({ get, effect }) => {
    const [state] = get(pageStore);
    
    // Re-runs when state.currentPage changes
    // Component NEVER re-renders (returns nothing reactive)
    effect(() => {
      analytics.track('pageView', state.currentPage);
    });
    
    return {}; // No reactive return = no re-renders
  });

  return null;
}
```

### When to Use

| Scenario | Where |
|----------|-------|
| Store-only effects | Store's `setup()` |
| Needs refs/props/hooks | Selector's `effect()` |
| Component lifecycle | Selector's `effect()` |

## Component-Local Stores with scoped()

Use `scoped()` for stores that should be isolated to a component and automatically disposed on unmount:

```tsx
function ContactForm() {
  const { value, setValue, submit, submitting } = useStore(
    ({ get, scoped }) => {
      // Global store - shared across components
      const [userState] = get(userStore);

      // Component-local stores - isolated, auto-disposed on unmount
      const [formState, formActions] = scoped(formStore);
      const [submitState, submitActions] = scoped(submitStore);

      return {
        value: formState.value,
        setValue: formActions.setValue,
        submit: submitActions.submit,
        submitting: submitState.status === "pending",
      };
    }
  );

  return (
    <form onSubmit={submit}>
      <input value={value} onChange={(e) => setValue(e.target.value)} />
      <button disabled={submitting}>Submit</button>
    </form>
  );
}
```

### Key Features

| Feature             | Description                                         |
| ------------------- | --------------------------------------------------- |
| **Isolation**       | Each component gets its own store instance          |
| **Auto-disposal**   | Stores are disposed when component unmounts         |
| **Multiple stores** | Can call `scoped()` multiple times in same selector |
| **Mixed access**    | Combine `get()` for global and `scoped()` for local |

### Rules

```tsx
// ✅ CORRECT - scoped() in selector body
useStore(({ scoped }) => {
  const [state, actions] = scoped(formStore);
  return { state, actions };
});

// ❌ WRONG - scoped() in callback (throws error)
useStore(({ scoped }) => {
  return {
    onClick: () => {
      const [state] = scoped(formStore); // THROWS!
    },
  };
});
```

### Accessing the Instance

The third tuple element provides access to the store instance:

```tsx
const { dirty, reset } = useStore(({ scoped }) => {
  const [state, actions, instance] = scoped(formStore);

  return {
    ...state,
    ...actions,
    // Access instance methods
    dirty: instance.dirty,
    reset: instance.reset,
  };
});
```

## See Also

- [withStore()](/api/with-store) - HOC alternative
- [trigger()](/api/trigger) - Data fetching helper
