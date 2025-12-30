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

## Selector Mixins vs Multiple Hooks

When selecting data from multiple stores, you have two options: multiple `useStore()` hooks or selector mixins. **Selector mixins are more efficient.**

### The Problem with Multiple useStore() Calls

```tsx
// ❌ INEFFICIENT: Multiple hooks = multiple subscriptions, lifecycle overhead
const useUserData = () => {
  return useStore(({ get }) => {
    const [state] = get(userStore);
    return { name: state.name };
  });
};

const useCartData = () => {
  return useStore(({ get }) => {
    const [state] = get(cartStore);
    return { itemCount: state.items.length };
  });
};

// Component uses both hooks
function Header() {
  const { name } = useUserData();     // 1st useStore (subscriptions, refs, effects)
  const { itemCount } = useCartData(); // 2nd useStore (more subscriptions, refs, effects)
  
  return <div>{name} - Cart: {itemCount}</div>;
}
```

**What's wrong:**
- Each `useStore()` creates its own subscription system
- Duplicate React hooks (`useState`, `useEffect`, etc.) for each call
- If both selectors read the same field, tracking is duplicated
- More memory, more cleanup, slower renders

### The Solution: Selector Mixins

```tsx
// ✅ EFFICIENT: Single useStore with composable mixins
const userDataMixin = (ctx: SelectorContext) => {
  const [state] = ctx.get(userStore);
  return { name: state.name };
};

const cartDataMixin = (ctx: SelectorContext) => {
  const [state] = ctx.get(cartStore);
  return { itemCount: state.items.length };
};

// Combine mixins into one
const headerDataMixin = (ctx: SelectorContext) => {
  const userData = ctx.mixin(userDataMixin);
  const cartData = ctx.mixin(cartDataMixin);
  return { ...userData, ...cartData };
};

// Component uses single hook
function Header() {
  const { name, itemCount } = useStore((ctx) => ctx.mixin(headerDataMixin));
  
  return <div>{name} - Cart: {itemCount}</div>;
}
```

**Benefits:**
- Single subscription system for all data
- One set of React hooks
- Shared tracking — same fields aren't tracked twice
- Composable and reusable

### Comparison

| Aspect | Multiple `useStore()` | Selector Mixins |
|--------|----------------------|-----------------|
| React hooks | N sets (useState, useEffect, etc.) | 1 set |
| Subscriptions | N separate systems | 1 unified system |
| Tracking | Duplicate for same fields | Shared tracking |
| Memory | Higher | Lower |
| Composability | Via custom hooks | Via mixin composition |

### Creating Selector Mixins

```ts
import { SelectorContext } from "storion/react";

// Basic mixin - selects specific data
const userNameMixin = (ctx: SelectorContext) => {
  const [state] = ctx.get(userStore);
  return state.name;
};

// Mixin with parameters
const userByIdMixin = (ctx: SelectorContext, userId: string) => {
  const [state] = ctx.get(userStore);
  return state.users[userId];
};

// Mixin returning multiple values
const userStatsMixin = (ctx: SelectorContext) => {
  const [state] = ctx.get(userStore);
  return {
    totalUsers: state.users.length,
    activeUsers: state.users.filter(u => u.active).length,
  };
};

// Mixin with actions
const cartMixin = (ctx: SelectorContext) => {
  const [state, actions] = ctx.get(cartStore);
  return {
    items: state.items,
    total: state.total,
    addItem: actions.addItem,
    removeItem: actions.removeItem,
  };
};
```

### Composing Mixins

```ts
// Combine multiple mixins
const dashboardMixin = (ctx: SelectorContext) => {
  const user = ctx.mixin(userStatsMixin);
  const cart = ctx.mixin(cartMixin);
  const orders = ctx.mixin(ordersMixin);
  
  return {
    ...user,
    ...cart,
    ...orders,
    // Add computed values
    isVIP: user.totalUsers > 100 && cart.total > 1000,
  };
};

function Dashboard() {
  const data = useStore((ctx) => ctx.mixin(dashboardMixin));
  
  return (
    <div>
      <UserStats {...data} />
      <CartSummary {...data} />
      <OrderHistory {...data} />
    </div>
  );
}
```

### Module Organization

```ts
// selectors/user.ts
export const userNameMixin = (ctx: SelectorContext) => {
  const [state] = ctx.get(userStore);
  return state.name;
};

export const userProfileMixin = (ctx: SelectorContext) => {
  const [state] = ctx.get(userStore);
  return {
    name: state.name,
    email: state.email,
    avatar: state.avatar,
  };
};

// selectors/cart.ts
export const cartSummaryMixin = (ctx: SelectorContext) => {
  const [state, actions] = ctx.get(cartStore);
  return {
    itemCount: state.items.length,
    total: state.total,
    checkout: actions.checkout,
  };
};

// selectors/combined.ts
import { userProfileMixin } from "./user";
import { cartSummaryMixin } from "./cart";

export const headerMixin = (ctx: SelectorContext) => ({
  ...ctx.mixin(userProfileMixin),
  ...ctx.mixin(cartSummaryMixin),
});
```

### When to Use Each Approach

| Scenario | Recommendation |
|----------|----------------|
| Single store access | Either approach works |
| Multiple stores, same component | ✅ Selector mixins |
| Reusable selection logic | ✅ Selector mixins |
| Isolated hook with own state | Custom hook with `useStore` |
| Third-party hook integration | Custom hook with `useStore` |

### Shorthand: mixins() Helper

For cleaner mixin composition, use the `mixins()` helper:

**Array syntax** — Merge multiple mixins:

```tsx
import { useStore, mixins } from "storion/react";

// Direct mixin returns object that gets spread
const selectUser = (ctx: SelectorContext) => {
  const [state] = ctx.get(userStore);
  return { name: state.name, email: state.email };
};

// Named mixin maps key to result
const selectCount = (ctx: SelectorContext) => {
  const [state] = ctx.get(counterStore);
  return state.count;
};

function Component() {
  // Array merges all results
  const { name, email, count } = useStore(
    mixins([
      selectUser,            // → { name, email } spread into result
      { count: selectCount } // → { count: number }
    ])
  );
  
  return <div>{name}: {count}</div>;
}
```

**Object syntax** — Map keys to mixin results (keys ending with "Mixin" are stripped):

```tsx
const selectNameMixin = (ctx: SelectorContext) => ctx.get(userStore)[0].name;
const selectAgeMixin = (ctx: SelectorContext) => ctx.get(userStore)[0].age;
const selectIncrement = (ctx: SelectorContext) => ctx.get(counterStore)[1].increment;

function Component() {
  // Each key maps to its mixin's return value
  // "Mixin" suffix stripped: selectNameMixin → selectName
  const { selectName, selectAge, inc } = useStore(
    mixins({
      selectNameMixin,   // string
      selectAgeMixin,    // number  
      inc: selectIncrement,   // () => void
    })
  );
  
  return (
    <div>
      <p>{selectName}, age {selectAge}</p>
      <button onClick={inc}>+</button>
    </div>
  );
}
```

**Comparison:**

```tsx
// Standard selector - most flexible
const data = useStore((ctx) => ({
  ...ctx.mixin(userMixin),
  ...ctx.mixin(cartMixin),
}));

// mixins() array - cleaner composition
const data = useStore(mixins([userMixin, cartMixin]));

// mixins() object - explicit key mapping
const data = useStore(
  mixins({
    user: userMixin,
    cart: cartMixin,
  })
);
```

**StoreSpec proxy** — Get a proxy for all store properties/actions:

```tsx
import { mixins, store } from "storion/react";

const userStore = store({
  state: { name: "", age: 0 },
  setup: ({ state }) => ({
    setName: (name: string) => { state.name = name; },
  }),
});

const proxy = mixins(userStore);

function Component() {
  // Use proxy to access state/actions as mixins
  const { name, setName } = useStore(
    mixins({
      name: proxy.name,
      setName: proxy.setName,
    })
  );
  
  // Or use select() to select multiple at once
  const { name, age, setName } = useStore(
    proxy.select(["name", "age", "setName"])
  );
}
```

**Service factory proxy** — Get a proxy for service properties:

```tsx
const dbService = (resolver: Resolver) => ({
  users: { getAll: () => [] },
});

const proxy = mixins(dbService);

function Component() {
  const { users } = useStore(
    mixins({
      users: proxy.users,
    })
  );
}
```

See [`useStore()` API reference](/api/use-store#mixin-composition-with-mixins) for more details.

### Real-World Example

```tsx
// ❌ BEFORE: Three separate hooks
function ProductPage({ productId }: { productId: string }) {
  const { product } = useProduct(productId);
  const { user } = useCurrentUser();
  const { cart, addToCart } = useCart();
  
  // Each hook runs its own useStore internally...
}

// ✅ AFTER: Single useStore with mixins
const productMixin = (ctx: SelectorContext, productId: string) => {
  const [state] = ctx.get(productStore);
  return { product: state.products[productId] };
};

const currentUserMixin = (ctx: SelectorContext) => {
  const [state] = ctx.get(userStore);
  return { user: state.currentUser };
};

const cartMixin = (ctx: SelectorContext) => {
  const [state, actions] = ctx.get(cartStore);
  return { cart: state, addToCart: actions.add };
};

function ProductPage({ productId }: { productId: string }) {
  const { product, user, cart, addToCart } = useStore((ctx) => ({
    ...ctx.mixin(productMixin, productId),
    ...ctx.mixin(currentUserMixin),
    ...ctx.mixin(cartMixin),
  }));
  
  // Single subscription system, shared tracking, lower overhead
}
```

## Using Async Mixins

For async operations, use `async.mixin()` which provides component-local async state:

```tsx
import { async } from "storion/async";

// Define a mixin for async operations
const submitMixin = async(async (ctx, data: FormData) => {
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

### Parameterized Hooks

Create hooks with arguments using the selector overload:

```tsx
// Create a parameterized hook
const useUserById = useStore.from((ctx, userId: string) => {
  const [state] = ctx.get(userStore);
  return { user: state.users[userId] };
});

// Use with different arguments
function UserCard({ userId }: { userId: string }) {
  const { user } = useUserById(userId);
  return <div>{user?.name}</div>;
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
