# Reactivity

Storion uses Proxy-based dependency tracking to achieve fine-grained reactivity.

## How It Works

When you read state inside a tracked context (like `useStore`), Storion records which properties you accessed:

```tsx
function UserName() {
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore);
    return { name: state.name };  // Only 'name' is tracked
  });

  return <span>{name}</span>;
}
```

- ✅ Re-renders when `state.name` changes
- ❌ Does NOT re-render when `state.email` changes

## Tracked Contexts

Reactivity only works in these contexts:

| Context | Tracked |
|---------|---------|
| `useStore` selector | ✅ |
| `effect` callback | ✅ |
| `pick()` | ✅ |
| Action bodies | ❌ |
| Event handlers | ❌ |

## Fine-grained vs Coarse-grained

### Fine-grained (Default)

```tsx
// Only tracks state.items.length
const { count } = useStore(({ get }) => {
  const [state] = get(todoStore);
  return { count: state.items.length };
});
```

### Coarse-grained (With pick)

```tsx
// Tracks entire items array with shallow equality
const { items } = useStore(({ get }) => {
  const [state] = get(todoStore);
  return { items: pick(state.items, shallowEqual) };
});
```

## Custom Equality

### Per-field Equality

```ts
const todoStore = store({
  state: { items: [], filter: 'all' },
  equality: {
    items: shallowEqual,  // Use shallow comparison
  },
  // ...
});
```

### In Selectors

```tsx
import { pick, shallowEqual, deepEqual } from 'storion/react';

const { user } = useStore(({ get }) => {
  const [state] = get(userStore);
  return {
    user: pick(state.profile, deepEqual),
  };
});
```

## Batching Updates

Multiple state changes are batched automatically within actions. For external batching:

```ts
import { batch } from 'storion/react';

batch(() => {
  actions.setName('Alice');
  actions.setEmail('alice@example.com');
  // Only one re-render
});
```

## Untracked Reading

Read state without tracking dependencies:

```ts
import { untrack } from 'storion/react';

const { name, getEmail } = useStore(({ get }) => {
  const [state, actions] = get(userStore);
  return {
    name: state.name,  // Tracked
    getEmail: () => untrack(() => state.email),  // Not tracked
  };
});
```

