# trigger()

Triggers an action with automatic caching and deduplication. Useful for data fetching in React components.

## Signature

```ts
function trigger<TArgs extends unknown[]>(
  action: (...args: TArgs) => void,
  deps: unknown[],
  ...args: TArgs
): void
```

## Parameters

### action

The action function to call. Must be a **stable reference** (not inline/anonymous).

### deps

Dependency array that determines when to re-trigger (like React's `useEffect` deps).

### args

Arguments to pass to the action.

## Basic Example

```tsx
import { trigger, useStore } from 'storion/react';

function UserProfile({ userId }: { userId: string }) {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    
    // Triggers fetchUser when userId changes
    trigger(actions.fetchUser, [userId], userId);
    
    return { user: state.user };
  });

  return <div>{user.data?.name}</div>;
}
```

## Important Rules

### 1. Use Stable Function References

```ts
// ❌ WRONG - anonymous function creates new reference each render
trigger(() => actions.fetchUser(userId), [userId]);

// ✅ CORRECT - use the action directly
trigger(actions.fetchUser, [userId], userId);
```

### 2. Multiple Triggers

```ts
// ✅ CORRECT - trigger multiple actions separately
trigger(actions.fetchUser, [userId], userId);
trigger(actions.fetchPermissions, [userId], userId);
```

### 3. Conditional Triggering

```ts
// Only trigger when userId exists
if (userId) {
  trigger(actions.fetchUser, [userId], userId);
}
```

## How It Works

1. `trigger` uses the action reference + deps as a cache key
2. On first call, executes the action with provided args
3. On subsequent renders:
   - If deps haven't changed AND args haven't changed → skips execution
   - If deps changed OR args changed → re-executes the action

## With Async State

```tsx
function PokemonList() {
  const { pokemon, status } = useStore(({ get }) => {
    const [state, actions] = get(pokemonStore);
    
    // Fetch on mount
    trigger(actions.fetchAll, []);
    
    return {
      pokemon: state.pokemon,
      status: state.pokemon.status,
    };
  });

  if (status === 'pending') return <Spinner />;
  if (status === 'error') return <Error />;
  
  return (
    <ul>
      {pokemon.data?.map(p => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
}
```

## See Also

- [useStore()](/api/use-store) - React hook for accessing stores
- [async()](/api/async) - Async state management
- [Async Guide](/guide/async) - Working with async data

