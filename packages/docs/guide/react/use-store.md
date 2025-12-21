# useStore

The primary hook for using stores in React components.

## Basic Usage

```tsx
import { useStore } from 'storion/react';
import { userStore } from '../stores/userStore';

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

## Selector Function

The selector receives a context with `get`:

```ts
useStore(({ get }) => {
  // Get store tuple
  const [state, actions] = get(userStore);
  
  // Get service
  const api = get(apiService);
  
  // Return what component needs
  return { /* ... */ };
});
```

## Multiple Stores

```tsx
const { user, todos } = useStore(({ get }) => {
  const [userState] = get(userStore);
  const [todoState, todoActions] = get(todoStore);
  
  return {
    user: userState.profile,
    todos: todoState.items.filter(t => t.userId === userState.id),
  };
});
```

## Computed Values

Compute derived values in the selector:

```tsx
const { completedCount, totalCount, progress } = useStore(({ get }) => {
  const [state] = get(todoStore);
  const completed = state.items.filter(t => t.done).length;
  const total = state.items.length;
  
  return {
    completedCount: completed,
    totalCount: total,
    progress: total > 0 ? completed / total : 0,
  };
});
```

## Optimizing Re-renders

### Only Return What You Need

```tsx
// ❌ Returns entire state - re-renders on any change
const { state } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { state };
});

// ✅ Returns only what's used - re-renders only when name changes
const { name } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { name: state.name };
});
```

### Use pick() for Collections

```tsx
import { pick, shallowEqual } from 'storion/react';

const { items } = useStore(({ get }) => {
  const [state] = get(todoStore);
  return {
    items: pick(state.items, shallowEqual),
  };
});
```

## Return Value

Returns a stable result object:

```ts
const result = useStore(selector);

// result is stable between renders if values haven't changed
// Safe to use in dependency arrays
useEffect(() => {
  console.log(result.name);
}, [result.name]);
```

## Requirements

Must be used within a `StoreProvider`:

```tsx
const app = container();

function App() {
  return (
    <StoreProvider container={app}>
      <UserProfile />  {/* useStore works here */}
    </StoreProvider>
  );
}
```

