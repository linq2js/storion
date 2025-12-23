# Async Data

Handling asynchronous data fetching with loading, success, and error states.

## Store with Async State

```ts
import { store } from 'storion/react';
import { async } from 'storion/async';

interface User {
  id: string;
  name: string;
  email: string;
}

export const userStore = store({
  name: 'user',
  state: {
    // Fresh mode: undefined until loaded, suspends during loading
    currentUser: async.fresh<User>(),
    
    // Stale mode: keeps previous data during refresh
    users: async.stale<User[]>([]),
  },
  setup({ focus }) {
    // Create async managers (use *Query for read operations)
    const currentUserQuery = async(
      focus('currentUser'),
      async (ctx, userId: string) => {
        const res = await fetch(`/api/users/${userId}`, {
          signal: ctx.signal, // Cancellation support
        });
        if (!res.ok) throw new Error('Failed to fetch user');
        return res.json();
      }
    );

    const usersQuery = async(
      focus('users'),
      async (ctx) => {
        const res = await fetch('/api/users', {
          signal: ctx.signal,
        });
        if (!res.ok) throw new Error('Failed to fetch users');
        return res.json();
      }
    );

    return {
      fetchUser: currentUserQuery.dispatch,
      fetchUsers: usersQuery.dispatch,
    };
  },
});
```

## Using with Status Checks

```tsx
import { useStore, trigger } from 'storion/react';
import { userStore } from './stores';

function UserProfile({ userId }: { userId: string }) {
  const { user, status, error, retry } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    
    // Trigger fetch when userId changes
    trigger(actions.fetchUser, [userId], userId);

    return {
      user: state.currentUser.data,
      status: state.currentUser.status,
      error: state.currentUser.error,
      retry: () => actions.fetchUser(userId),
    };
  });

  if (status === 'pending') {
    return <div className="spinner">Loading...</div>;
  }

  if (status === 'error') {
    return (
      <div className="error">
        <p>Error: {String(error)}</p>
        <button onClick={retry}>Retry</button>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="user-profile">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}
```

## Using with Suspense

```tsx
import { Suspense } from 'react';
import { useStore, trigger } from 'storion/react';

function UserProfileContent({ userId }: { userId: string }) {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    
    trigger(actions.fetchUser, [userId], userId);

    // wait() throws promise during pending → Suspense catches it
    return { user: state.currentUser.wait() };
  });

  return (
    <div className="user-profile">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}

function UserProfile({ userId }: { userId: string }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <UserProfileContent userId={userId} />
    </Suspense>
  );
}
```

## Stale-While-Revalidate Pattern

```tsx
function UserList() {
  const { users, isRefreshing, refresh } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    
    // Fetch on mount
    trigger(actions.fetchUsers, []);

    return {
      // wait() in stale mode returns previous data during refresh
      users: state.users.wait(),
      isRefreshing: state.users.status === 'pending',
      refresh: actions.fetchUsers,
    };
  });

  return (
    <div>
      <header>
        <h2>Users</h2>
        <button onClick={refresh} disabled={isRefreshing}>
          {isRefreshing ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>
      
      {isRefreshing && <div className="refresh-indicator" />}
      
      <ul>
        {users.map(user => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Cancellation

Requests are automatically cancelled when:
- A new request starts (race condition prevention)
- The component unmounts
- The store is disposed

```ts
const userQuery = async(
  focus('user'),
  async (ctx, userId: string) => {
    // Use ctx.signal for fetch
    const res = await fetch(`/api/users/${userId}`, {
      signal: ctx.signal,
    });
    
    // Check if cancelled before expensive operations
    if (ctx.signal.aborted) return;
    
    const data = await res.json();
    
    // Another check point
    if (ctx.signal.aborted) return;
    
    return data;
  }
);
```

## Key Concepts

1. **Fresh vs Stale**: Choose based on UX needs
   - Fresh: Good for critical data that must be current
   - Stale: Good for lists that can show old data while refreshing

2. **trigger()**: Deduplicates requests based on deps array

3. **Cancellation**: Built-in via `ctx.signal` - use it!

4. **Error Handling**: Check `status === 'error'` and provide retry

## Try It

Check out the [Pokemon Demo](/demos) for a real-world example with API calls.

