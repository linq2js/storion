# useStore()

React hook for accessing stores with automatic reactivity.

## Signatures

```ts
// Standard selector
function useStore<T>(selector: (ctx: SelectorContext) => T): T;

// Merge mixins (array)
function useStore<const T extends MergeMixin>(mixins: T): MergeMixinResult<T>;

// Mixin map (object)
function useStore<const T extends MixinMap>(mixinMap: T): MixinMapResult<T>;
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

### Use Mixins Instead of Multiple useStore()

When accessing multiple stores, prefer selector mixins over multiple hooks:

```tsx
// ❌ INEFFICIENT: Each useStore creates its own subscription system
function Header() {
  const { name } = useUserHook();   // 1st useStore internals
  const { count } = useCartHook();  // 2nd useStore internals
  return <div>{name}: {count}</div>;
}

// ✅ EFFICIENT: Single useStore with mixins
const userMixin = (ctx: SelectorContext) => {
  const [state] = ctx.get(userStore);
  return { name: state.name };
};

const cartMixin = (ctx: SelectorContext) => {
  const [state] = ctx.get(cartStore);
  return { count: state.items.length };
};

function Header() {
  const { name, count } = useStore((ctx) => ({
    ...ctx.mixin(userMixin),
    ...ctx.mixin(cartMixin),
  }));
  return <div>{name}: {count}</div>;
}
```

**Why mixins are more efficient:**
- Single subscription system vs N separate systems
- Shared dependency tracking (same field isn't tracked twice)
- One set of React hooks instead of N sets

See [Selector Mixins Guide](/guide/react/use-store#selector-mixins-vs-multiple-hooks) for detailed patterns.

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

## Mixin Shorthand Overloads

For cleaner code when composing mixins, `useStore` accepts arrays and objects of mixins directly.

### MergeMixin (Array)

Pass an array to merge multiple mixins into one result:

```tsx
import { useStore } from "storion/react";
import type { SelectorContext } from "storion";

// Direct mixin - returns object that gets spread
const selectUser = (ctx: SelectorContext) => {
  const [state] = ctx.get(userStore);
  return { name: state.name, email: state.email };
};

// Named mixin - wrapped in object to map key to result
const selectCount = (ctx: SelectorContext) => {
  const [state] = ctx.get(counterStore);
  return state.count;
};

const selectIncrement = (ctx: SelectorContext) => {
  const [, actions] = ctx.get(counterStore);
  return actions.increment;
};

function Component() {
  // Mix direct and named mixins
  const result = useStore([
    selectUser,                    // → { name, email } (spread)
    { count: selectCount },        // → { count: number }
    { increment: selectIncrement } // → { increment: () => void }
  ]);
  
  // result: { name: string, email: string, count: number, increment: () => void }
  return (
    <div>
      <p>{result.name}: {result.count}</p>
      <button onClick={result.increment}>+</button>
    </div>
  );
}
```

**Type inference** with `const` ensures exact types:

```ts
// TypeScript infers: { name: string, email: string, count: number }
const result = useStore([
  selectUser,
  { count: selectCount }
] as const);
```

### MixinMap (Object)

Pass an object to map keys to mixin results:

```tsx
const selectName = (ctx: SelectorContext) => {
  const [state] = ctx.get(userStore);
  return state.name;
};

const selectAge = (ctx: SelectorContext) => {
  const [state] = ctx.get(userStore);
  return state.age;
};

const selectIncrement = (ctx: SelectorContext) => {
  const [, actions] = ctx.get(counterStore);
  return actions.increment;
};

function Component() {
  // Each key maps to its mixin's result
  const { userName, userAge, inc } = useStore({
    userName: selectName,   // string
    userAge: selectAge,     // number
    inc: selectIncrement,   // () => void
  });
  
  return (
    <div>
      <p>{userName}, age {userAge}</p>
      <button onClick={inc}>+</button>
    </div>
  );
}
```

### When to Use

| Pattern | Use Case |
|---------|----------|
| `useStore(selector)` | Full control, custom logic |
| `useStore([...mixins])` | Merging multiple reusable mixins |
| `useStore({...})` | Mapping keys to mixin results |

### Comparison

```tsx
// Standard selector - most flexible
const { name, count } = useStore((ctx) => {
  const [user] = ctx.get(userStore);
  const [counter] = ctx.get(counterStore);
  return { name: user.name, count: counter.count };
});

// MergeMixin array - cleaner composition
const { name, count } = useStore([
  (ctx) => ({ name: ctx.get(userStore)[0].name }),
  { count: (ctx) => ctx.get(counterStore)[0].count }
]);

// MixinMap object - cleanest for simple cases
const { name, count } = useStore({
  name: (ctx) => ctx.get(userStore)[0].name,
  count: (ctx) => ctx.get(counterStore)[0].count,
});
```

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

## useStore.from()

Create a pre-bound hook for easier store access. Has two overloads:

1. **From store spec** — Provides state and actions directly to the selector
2. **From selector function** — Creates a parameterized hook from a selector

### Signature

```ts
// Overload 1: From store spec
function useStore.from<TState, TActions>(
  spec: StoreSpec<TState, TActions>
): UseFromStore<TState, TActions>;

type UseFromStore<TState, TActions> = <T extends object>(
  selector: (state: TState, actions: TActions, ctx: SelectorContext) => T
) => StableResult<T>;

// Overload 2: From selector function
function useStore.from<TResult, TArgs extends unknown[]>(
  selector: (ctx: SelectorContext, ...args: TArgs) => TResult
): (...args: TArgs) => StableResult<TResult>;
```

### Basic Example (From Store Spec)

```tsx
import { useStore } from "storion/react";
import { counterStore } from "./stores";

// Create a pre-bound hook for counterStore
const useCounter = useStore.from(counterStore);

function Counter() {
  // Simpler selector - state and actions provided directly
  const { count, increment } = useCounter((state, actions) => ({
    count: state.count,
    increment: actions.increment,
  }));

  return <button onClick={increment}>Count: {count}</button>;
}
```

### Comparison

```tsx
// Without useStore.from() - verbose
const { count } = useStore(({ get }) => {
  const [state, actions] = get(counterStore);
  return { count: state.count, increment: actions.increment };
});

// With useStore.from() - cleaner
const useCounter = useStore.from(counterStore);
const { count } = useCounter((state, actions) => ({
  count: state.count,
  increment: actions.increment,
}));
```

### Accessing Other Stores

The third parameter provides full `SelectorContext` for advanced features:

```tsx
const useCounter = useStore.from(counterStore);

function UserCounter() {
  const { count, userName } = useCounter((state, actions, ctx) => {
    // Access other stores via ctx.get()
    const [userState] = ctx.get(userStore);

    return {
      count: state.count,
      userName: userState.name,
    };
  });

  return (
    <div>
      {userName}'s count: {count}
    </div>
  );
}
```

### With Scoped Stores

```tsx
const useApp = useStore.from(appStore);

function FormPage() {
  const { title, formValue, setFormValue } = useApp((state, actions, ctx) => {
    // Create component-local form store via ctx.scoped()
    const [formState, formActions] = ctx.scoped(formStore);

    return {
      title: state.title,
      formValue: formState.value,
      setFormValue: formActions.setValue,
    };
  });

  return (
    <div>
      <h1>{title}</h1>
      <input value={formValue} onChange={(e) => setFormValue(e.target.value)} />
    </div>
  );
}
```

### With Mixins

```tsx
const useCounter = useStore.from(counterStore);

// Reusable mixin
const doubledMixin = (ctx: SelectorContext) => {
  const [state] = ctx.get(counterStore);
  return state.count * 2;
};

function DoubledCounter() {
  const { count, doubled } = useCounter((state, actions, ctx) => ({
    count: state.count,
    doubled: ctx.mixin(doubledMixin),
  }));

  return (
    <div>
      Count: {count}, Doubled: {doubled}
    </div>
  );
}
```

### From Selector Function

Create parameterized hooks from selector functions. Useful for reusable hooks with arguments:

```tsx
import { useStore } from "storion/react";
import { userStore } from "./stores";

// Create a parameterized hook
const useUserById = useStore.from((ctx, userId: string) => {
  const [state] = ctx.get(userStore);
  return { user: state.users[userId] };
});

// Use in components
function UserCard({ userId }: { userId: string }) {
  const { user } = useUserById(userId);
  return <div>{user?.name}</div>;
}
```

### Multiple Arguments

```tsx
const usePaginatedItems = useStore.from(
  (ctx, page: number, pageSize: number) => {
    const [state] = ctx.get(itemStore);
    const start = page * pageSize;
    return {
      items: state.items.slice(start, start + pageSize),
      total: state.items.length,
    };
  }
);

function ItemList({ page }: { page: number }) {
  const { items, total } = usePaginatedItems(page, 10);

  return (
    <div>
      <p>Showing {items.length} of {total}</p>
      {items.map(item => <Item key={item.id} {...item} />)}
    </div>
  );
}
```

### Zero Arguments

```tsx
// Create a simple hook without arguments
const useCurrentUser = useStore.from((ctx) => {
  const [state] = ctx.get(userStore);
  return { user: state.currentUser };
});

function Header() {
  const { user } = useCurrentUser();
  return <h1>Welcome, {user?.name}</h1>;
}
```

### When to Use

| Scenario | Recommendation |
|----------|----------------|
| Single store, simple selector | ✅ `useStore.from(spec)` |
| Parameterized selector | ✅ `useStore.from(selector)` |
| Multiple stores | Use regular `useStore()` |
| Reusable store hook | ✅ Export `useStore.from(spec)` |
| Reusable parameterized hook | ✅ Export `useStore.from(selector)` |

### Module Pattern

```ts
// stores/counter.ts
import { store, useStore } from "storion/react";

export const counterStore = store({
  name: "counter",
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => { state.count++; },
      decrement: () => { state.count--; },
    };
  },
});

// Export pre-bound hook alongside the store
export const useCounter = useStore.from(counterStore);

// Export parameterized hooks
export const useCounterWithMultiplier = useStore.from(
  (ctx, multiplier: number) => {
    const [state, actions] = ctx.get(counterStore);
    return {
      count: state.count * multiplier,
      increment: actions.increment,
    };
  }
);
```

```tsx
// components/Counter.tsx
import { useCounter, useCounterWithMultiplier } from "../stores/counter";

function Counter() {
  const { count, increment } = useCounter((state, actions) => ({
    count: state.count,
    increment: actions.increment,
  }));

  return <button onClick={increment}>{count}</button>;
}

function DoubledCounter() {
  const { count, increment } = useCounterWithMultiplier(2);
  return <button onClick={increment}>{count}</button>;
}
```

## See Also

- [withStore()](/api/with-store) - HOC alternative
- [trigger()](/api/trigger) - Data fetching helper
- [create()](/api/create) - Single-store shorthand with container
