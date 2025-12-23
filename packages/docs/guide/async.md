# Async State

Storion provides first-class support for async state with automatic cancellation.

## Installation

```ts
import { async } from 'storion/async';
```

## Naming Convention

Use semantic names for async actions:

| Type | Pattern | Example |
|------|---------|---------|
| Read operations | `*Query` | `userQuery`, `postsQuery` |
| Write operations | `*Mutation` | `createUserMutation`, `updatePostMutation` |

## Defining Async State

### Fresh Mode (Suspense-compatible)

```ts
import { async } from 'storion/async';

const userStore = store({
  name: 'user',
  state: {
    user: async.fresh<User>(),  // undefined during loading
  },
  setup({ focus }) {
    // Use *Query for read operations
    const userQuery = async(focus('user'), async (ctx, id: string) => {
      const res = await fetch(`/api/users/${id}`, { signal: ctx.signal });
      return res.json();
    });

    return {
      fetchUser: userQuery.dispatch,
    };
  },
});
```

### Stale Mode (Keep Previous Data)

```ts
const userStore = store({
  state: {
    users: async.stale<User[]>([]),  // Shows [] while loading
  },
  setup({ focus }) {
    const usersQuery = async(focus('users'), async (ctx) => {
      const res = await fetch('/api/users', { signal: ctx.signal });
      return res.json();
    });

    return {
      fetchUsers: usersQuery.dispatch,
      refreshUsers: usersQuery.refresh,
    };
  },
});
```

## Using Async State

### In Components

```tsx
import { trigger } from 'storion/react';

function UserProfile({ userId }: { userId: string }) {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    
    // Trigger fetch when userId changes
    trigger(actions.fetchUser, [userId], userId);
    
    return { user: state.user };
  });

  if (user.status === 'pending') return <Spinner />;
  if (user.status === 'error') return <Error error={user.error} />;
  return <div>{user.data?.name}</div>;
}
```

### With Suspense (Fresh Mode)

```tsx
function UserProfile({ userId }: { userId: string }) {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    trigger(actions.fetchUser, [userId], userId);
    
    // async.wait() throws promise for Suspense
    return { user: async.wait(state.user) };
  });

  // No loading check needed - Suspense handles it
  return <div>{user.name}</div>;
}

// Wrap with Suspense
<Suspense fallback={<Spinner />}>
  <UserProfile userId="123" />
</Suspense>
```

## Async State Shape

```ts
type AsyncState<T> = {
  status: 'idle' | 'pending' | 'success' | 'error';
  data: T | undefined;
  error: unknown;
};
```

## Behavior Table

| Status | Fresh Mode | Stale Mode |
|--------|------------|------------|
| `idle` | ❌ Throws `AsyncNotReadyError` | ✅ Returns stale data |
| `pending` | ❌ Throws promise (Suspense) | ✅ Returns stale data |
| `success` | ✅ Returns data | ✅ Returns data |
| `error` | ❌ Throws error | ✅ Returns stale data |

## Cancellation

Requests are automatically cancelled when:

```ts
// 1. Component unmounts
// 2. New request starts with same key
// 3. Store is disposed
```

Use `ctx.signal` in your fetch:

```ts
async(focus('data'), async (ctx, query: string) => {
  const res = await fetch(`/api/search?q=${query}`, {
    signal: ctx.signal,  // Aborts on cancellation
  });
  return res.json();
});
```

## trigger() Rules

::: warning Important
Never pass anonymous functions to `trigger()`:

```ts
// ❌ WRONG - new function reference each render
trigger(() => actions.fetch(id), [id]);

// ✅ CORRECT - stable function reference
trigger(actions.fetch, [id], id);
```
:::

