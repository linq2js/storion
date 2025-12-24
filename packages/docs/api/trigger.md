# trigger()

Triggers an action with automatic caching and deduplication. Designed for data fetching inside `useStore` selectors.

## Signature

```ts
function trigger<TArgs extends unknown[]>(
  action: (...args: TArgs) => void,
  deps: unknown[],
  ...args: TArgs
): void;
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `action` | `(...args: TArgs) => void` | The action to call. **Must be a stable reference** (not inline). |
| `deps` | `unknown[]` | Dependency array that determines when to re-trigger. |
| `...args` | `TArgs` | Arguments passed to the action. |

## Returns

`void` — trigger doesn't return a value.

## How It Works

```
1. trigger() computes a cache key from: action reference + deps
2. On first call → executes action with provided args
3. On subsequent calls:
   - deps unchanged AND args unchanged → SKIP (no re-execution)
   - deps changed OR args changed → RE-EXECUTE action
```

The caching happens per-component, so different component instances maintain separate cache entries.

## Basic Example

```tsx
import { trigger, useStore } from 'storion/react';
import { userStore } from './stores';

function UserProfile({ userId }: { userId: string }) {
  const { user, status } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    
    // Fetch user when userId changes
    // Uses userId as both: dependency AND argument
    trigger(actions.fetchUser, [userId], userId);
    
    return {
      user: state.user.data,
      status: state.user.status,
    };
  });

  if (status === 'pending') return <Spinner />;
  if (status === 'error') return <ErrorMessage />;
  
  return <div>{user?.name}</div>;
}
```

## Critical Rules

### 1. Never Use Anonymous Functions

The action reference is part of the cache key. Anonymous functions create new references on every render, causing infinite re-triggers.

```ts
// ❌ WRONG - anonymous function creates new reference each render
// This causes the action to be called on EVERY render!
trigger(() => actions.fetchUser(userId), [userId]);

// ❌ WRONG - inline arrow function
trigger(() => { 
  actions.searchAPI1(query);
  actions.searchAPI2(query);
}, [query]);

// ✅ CORRECT - use stable action reference
trigger(actions.fetchUser, [userId], userId);

// ✅ CORRECT - for multiple actions, call trigger multiple times
trigger(actions.searchAPI1, [query], query);
trigger(actions.searchAPI2, [query], query);
```

::: danger This is the #1 mistake with trigger()
If your action is being called on every render, you're probably using an anonymous function. Always pass the action reference directly.
:::

### 2. Deps Array Controls Re-Triggering

```ts
// Fetch once on mount (empty deps)
trigger(actions.fetchAll, []);

// Re-fetch when userId changes
trigger(actions.fetchUser, [userId], userId);

// Re-fetch when any dep changes
trigger(actions.fetchFiltered, [page, filter, sort], page, filter, sort);
```

### 3. Conditional Triggering

```ts
function UserProfile({ userId }: { userId: string | null }) {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    
// Only trigger when userId exists
if (userId) {
  trigger(actions.fetchUser, [userId], userId);
}
    
    return { user: state.user };
  });
  
  // ...
}
```

### 4. Multiple Actions

Call `trigger` multiple times for different actions:

```ts
const { user, posts, comments } = useStore(({ get }) => {
  const [userState, userActions] = get(userStore);
  const [postState, postActions] = get(postStore);
  
  // Each trigger maintains its own cache
  trigger(userActions.fetchUser, [userId], userId);
  trigger(postActions.fetchPosts, [userId], userId);
  trigger(postActions.fetchComments, [postId], postId);
  
  return {
    user: userState.user,
    posts: postState.posts,
    comments: postState.comments,
  };
});
```

## With Async State

```tsx
import { trigger, useStore } from 'storion/react';
import { async } from 'storion/async';

function PokemonList() {
  const { pokemon, status, error, refresh } = useStore(({ get }) => {
    const [state, actions] = get(pokemonStore);
    
    // Fetch on mount (empty deps = once)
    trigger(actions.fetchAll, []);
    
    return {
      pokemon: state.pokemon.data,
      status: state.pokemon.status,
      error: state.pokemon.error,
      refresh: actions.fetchAll,
    };
  });

  if (status === 'pending') return <Spinner />;
  if (status === 'error') {
    return (
      <div>
        <p>Error: {String(error)}</p>
        <button onClick={refresh}>Retry</button>
      </div>
    );
  }
  
  return (
    <ul>
      {pokemon?.map(p => (
        <li key={p.id}>{p.name}</li>
      ))}
    </ul>
  );
}
```

## With Suspense

```tsx
import { Suspense } from 'react';
import { trigger, useStore } from 'storion/react';
import { async } from 'storion/async';

function UserProfileContent({ userId }: { userId: string }) {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    
    trigger(actions.fetchUser, [userId], userId);
    
    // async.wait() throws promise during pending → caught by Suspense
    return { user: async.wait(state.user) };
  });

  return <h1>{user.name}</h1>;
}

function UserProfile({ userId }: { userId: string }) {
  return (
    <Suspense fallback={<Spinner />}>
      <UserProfileContent userId={userId} />
    </Suspense>
  );
}
```

## Comparison with useEffect

| Aspect | `trigger()` | `useEffect` |
|--------|-------------|-------------|
| Location | Inside `useStore` selector | Outside selector |
| Deduplication | Automatic | Manual with refs |
| Async state integration | Native | Manual loading/error state |
| Cancellation | Automatic (with async.action) | Manual with cleanup |

```tsx
// ❌ useEffect approach - more boilerplate
function UserProfile({ userId }) {
  const { user, actions } = useStore(/* ... */);
  
  useEffect(() => {
    actions.fetchUser(userId);
  }, [userId, actions]);
  
  // ...
}

// ✅ trigger approach - cleaner
function UserProfile({ userId }) {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    trigger(actions.fetchUser, [userId], userId);
    return { user: state.user };
  });
  
  // ...
}
```

## Common Patterns

### Pagination

```tsx
function ItemList({ page }: { page: number }) {
  const { items } = useStore(({ get }) => {
    const [state, actions] = get(itemStore);
    
    // Re-fetch when page changes
    trigger(actions.fetchPage, [page], page);
    
    return { items: state.items };
  });
  
  // ...
}
```

### Search with Query

```tsx
function SearchResults({ query }: { query: string }) {
  const { results } = useStore(({ get }) => {
    const [state, actions] = get(searchStore);
    
    // Only search if query has content
    if (query.trim()) {
      trigger(actions.search, [query], query);
    }
    
    return { results: state.results };
  });
  
  // ...
}
```

### Combined Dependencies

```tsx
function FilteredList({ category, sort, page }: Props) {
  const { items } = useStore(({ get }) => {
    const [state, actions] = get(itemStore);
    
    // Re-fetch when any filter changes
    trigger(
      actions.fetchFiltered,
      [category, sort, page],  // deps
      category, sort, page     // args
    );
    
    return { items: state.items };
  });
  
  // ...
}
```

## See Also

- **[useStore()](/api/use-store)** — React hook for accessing stores
- **[async](/api/async)** — Async state management
- **[Async Guide](/guide/async)** — Working with async data
- **[Actions](/guide/actions)** — Defining and using actions
