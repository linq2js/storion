# create()

A shorthand for creating a store and its custom hook together, without needing `StoreProvider`.

## Signature

```ts
function create<TState, TActions>(
  options: StoreOptions<TState, TActions>
): [StoreInstance<TState, TActions>, UseStoreHook<TState, TActions>]
```

## Returns

Returns a tuple of:

1. **StoreInstance** - The store instance with `.state`, `.actions`, `.subscribe()`, etc.
2. **UseStoreHook** - A custom React hook to use in components

## Basic Usage

```tsx
import { create } from 'storion/react';

const [counter, useCounter] = create({
  name: 'counter',
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => { state.count++; },
      decrement: () => { state.count--; },
    };
  },
});

function Counter() {
  // Selector receives (state, actions, ctx)
  const { count, increment } = useCounter((state, actions) => ({
    count: state.count,
    increment: actions.increment,
  }));

  return <button onClick={increment}>{count}</button>;
}

// No StoreProvider needed!
function App() {
  return <Counter />;
}
```

## Selector Signature

The custom hook accepts a selector with this signature:

```ts
(state: TState, actions: TActions, ctx: SelectorContext) => TResult
```

### Parameters

| Parameter | Description |
|-----------|-------------|
| `state` | The store's current state |
| `actions` | The store's actions |
| `ctx` | Selector context with utilities |

### Context Utilities

The `ctx` parameter provides:

| Utility | Description |
|---------|-------------|
| `ctx.mixin(spec)` | Create component-local async state |
| `ctx.scoped(store)` | Create component-local store instance |
| `ctx.once(fn)` | Run once per component instance |
| `ctx.id` | Unique selector instance ID |
| `ctx.container` | The underlying container |

## Using Context Utilities

```tsx
import { create } from 'storion/react';
import { async } from 'storion/async';

const searchMutation = async(async (ctx, query: string) => {
  const res = await fetch(`/api/search?q=${query}`, { signal: ctx.signal });
  return res.json();
});

const [app, useApp] = create({
  name: 'app',
  state: { theme: 'dark' },
  setup({ state }) {
    return {
      toggleTheme: () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
      },
    };
  },
});

function SearchComponent() {
  const { theme, search, status } = useApp((state, actions, ctx) => {
    // Component-local async state via mixin
    const [searchState, searchActions] = ctx.mixin(searchMutation);
    
    return {
      theme: state.theme,
      search: searchActions.dispatch,
      status: searchState.status,
    };
  });

  return (
    <div className={theme}>
      <button onClick={() => search('hello')}>
        {status === 'pending' ? 'Searching...' : 'Search'}
      </button>
    </div>
  );
}
```

## Accessing Store Instance Directly

The first element of the tuple is the store instance:

```tsx
const [counter, useCounter] = create({
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => { state.count++; },
    };
  },
});

// Access state/actions outside React
console.log(counter.state.count);
counter.actions.increment();

// Subscribe to changes
const unsubscribe = counter.subscribe(() => {
  console.log('Count changed:', counter.state.count);
});
```

## When to Use

| Use Case | Recommendation |
|----------|----------------|
| Single feature/widget | ✅ Use `create()` |
| Quick prototype | ✅ Use `create()` |
| Isolated component | ✅ Use `create()` |
| Multiple stores | ❌ Use `store()` + container |
| Cross-store dependencies | ❌ Use `store()` + container |
| Testing with mocks | ❌ Use `store()` + container |

::: tip Migration Path
Start with `create()` for simplicity. When you need cross-store dependencies or testing flexibility, migrate to the full container setup - the store definition stays the same!
:::

## Related

- [`store()`](/api/store) - Full store specification API
- [`useStore()`](/api/use-store) - Hook for container-based stores
- [`StoreProvider`](/api/store-provider) - React context provider

