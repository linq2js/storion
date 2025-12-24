# Async Data

Build a data fetching component with loading, error, and success states. This tutorial demonstrates Storion's approach to async operations, including `trigger()`, cancellation, and the stale-while-revalidate pattern.

## What We're Building

A user profile viewer that:
- ✅ Fetches user data from an API
- ✅ Shows loading spinner during fetch
- ✅ Handles errors with retry
- ✅ Refreshes data on demand
- ✅ Auto-cancels on new requests

## Fresh vs Stale Modes

Before we start, understand the two async state modes:

| Mode | Initial Data | During Refresh | When to Use |
|------|--------------|----------------|-------------|
| **Fresh** | `undefined` | Shows loading | Critical data that must be current |
| **Stale** | Default value | Shows previous data | Lists, feeds, cached content |

## Step 1: Define the Store

```ts
// stores/userStore.ts
import { store } from 'storion/react';
import { async } from 'storion/async';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
}

export const userStore = store({
  name: 'user',
  state: {
    /** Current user profile (fresh mode - undefined until loaded) */
    currentUser: async.fresh<User>(),
    
    /** List of all users (stale mode - keeps previous data during refresh) */
    users: async.stale<User[]>([]),
  },
  setup({ focus }) {
    /**
     * Fetch a single user by ID
     * Use *Query naming for read operations
     */
    const userQuery = async.action(
      focus('currentUser'),
      async (ctx, userId: string) => {
        const res = await fetch(`/api/users/${userId}`, {
          signal: ctx.signal, // Enable cancellation
        });
        
        if (!res.ok) {
          throw new Error(`Failed to fetch user: ${res.status}`);
        }
        
        return res.json();
      }
    );

    /**
     * Fetch all users
     * Returns array, so stale mode keeps previous data
     */
    const usersQuery = async.action(
      focus('users'),
      async (ctx) => {
        const res = await fetch('/api/users', {
          signal: ctx.signal,
        });
        
        if (!res.ok) {
          throw new Error('Failed to fetch users');
        }
        
        return res.json();
      }
    );

    return {
      fetchUser: userQuery.dispatch,
      fetchUsers: usersQuery.dispatch,
      refreshUsers: usersQuery.refresh,
    };
  },
});
```

**Key Concepts:**

- `async.fresh<T>()` — Data is `undefined` until loaded; suspends or shows loading state
- `async.stale<T>(initial)` — Keeps previous data during refresh; great for lists
- `async.action(focus, handler)` — Creates async action bound to state field
- `ctx.signal` — Pass to fetch for automatic cancellation

## Step 2: Component with Status Checks

The explicit approach - check status and handle each case:

```tsx
// components/UserProfile.tsx
import { useStore, trigger } from 'storion/react';
import { userStore } from '../stores/userStore';

interface Props {
  userId: string;
}

export function UserProfile({ userId }: Props) {
  const { user, status, error, retry } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    
    // Trigger fetch when userId changes
    // Uses userId as dependency AND passes it as argument
    trigger(actions.fetchUser, [userId], userId);

    return {
      user: state.currentUser.data,
      status: state.currentUser.status,
      error: state.currentUser.error,
      retry: () => actions.fetchUser(userId),
    };
  });

  // Handle loading state
  if (status === 'pending') {
    return (
      <div className="loading">
        <div className="spinner" />
        <p>Loading user...</p>
      </div>
    );
  }

  // Handle error state
  if (status === 'error') {
    return (
      <div className="error">
        <h3>⚠️ Something went wrong</h3>
        <p>{String(error)}</p>
        <button onClick={retry}>Try Again</button>
      </div>
    );
  }

  // Handle no data yet (idle state)
  if (!user) {
    return null;
  }

  // Success - render the data
  return (
    <div className="user-profile">
      <img src={user.avatarUrl} alt={user.name} />
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}
```

**Understanding `trigger()`:**

```ts
trigger(actions.fetchUser, [userId], userId);
//      ↑ action           ↑ deps    ↑ args passed to action
```

- **First arg**: The action to call (must be stable reference)
- **Second arg**: Dependency array - re-triggers when these change
- **Rest args**: Arguments passed to the action

::: warning trigger() Key Rule
Never pass anonymous functions to `trigger()` [[memory:12425242]]. The function reference is used as a key, so inline functions cause infinite re-triggers:

```ts
// ❌ WRONG - creates new function every render
trigger(() => actions.fetchUser(userId), [userId]);

// ✅ CORRECT - stable function reference
trigger(actions.fetchUser, [userId], userId);
```
:::

## Step 3: Using React Suspense

For a declarative approach, use `async.wait()` with Suspense:

```tsx
// components/UserProfileSuspense.tsx
import { Suspense } from 'react';
import { useStore, trigger } from 'storion/react';
import { async } from 'storion/async';
import { userStore } from '../stores/userStore';

function UserProfileContent({ userId }: { userId: string }) {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    
    trigger(actions.fetchUser, [userId], userId);

    // async.wait() throws a promise during pending → Suspense catches it
    // Also throws errors → ErrorBoundary catches them
    return { user: async.wait(state.currentUser) };
  });

  // Only renders when data is ready
  return (
    <div className="user-profile">
      <img src={user.avatarUrl} alt={user.name} />
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
}

export function UserProfile({ userId }: { userId: string }) {
  return (
    <ErrorBoundary fallback={<ErrorMessage />}>
      <Suspense fallback={<LoadingSpinner />}>
        <UserProfileContent userId={userId} />
      </Suspense>
    </ErrorBoundary>
  );
}
```

**`async.wait()` Behavior:**

| Status | Fresh Mode | Stale Mode |
|--------|------------|------------|
| `idle` | ❌ Throws `AsyncNotReadyError` | ✅ Returns initial/stale data |
| `pending` | ❌ Throws promise (Suspense) | ✅ Returns previous data |
| `success` | ✅ Returns data | ✅ Returns data |
| `error` | ❌ Throws error | ✅ Returns stale data if any |

## Step 4: Stale-While-Revalidate Pattern

Show cached data while fetching fresh data:

```tsx
// components/UserList.tsx
import { useStore, trigger } from 'storion/react';
import { async } from 'storion/async';
import { userStore } from '../stores/userStore';

export function UserList() {
  const { users, isRefreshing, refresh, error } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    
    // Fetch on mount (empty deps = only once)
    trigger(actions.fetchUsers, []);

    return {
      // async.wait() in stale mode always returns data (initial [] or previous)
      users: async.wait(state.users),
      isRefreshing: state.users.status === 'pending',
      error: state.users.status === 'error' ? state.users.error : null,
      refresh: actions.refreshUsers,
    };
  });

  return (
    <div className="user-list">
      <header>
        <h2>Users</h2>
        <button 
          onClick={refresh} 
          disabled={isRefreshing}
          aria-label="Refresh users"
        >
          {isRefreshing ? '⟳ Refreshing...' : '↻ Refresh'}
        </button>
      </header>
      
      {/* Show error banner but keep showing stale data */}
      {error && (
        <div className="error-banner">
          Failed to refresh: {String(error)}
          <button onClick={refresh}>Retry</button>
        </div>
      )}
      
      {/* Subtle refresh indicator */}
      {isRefreshing && <div className="refresh-indicator" />}
      
      {users.length === 0 ? (
        <p className="empty">No users found</p>
      ) : (
        <ul>
          {users.map(user => (
            <li key={user.id}>
              <img src={user.avatarUrl} alt="" />
              <span>{user.name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**Stale Mode Benefits:**

1. Users see content immediately (no flash of loading state)
2. Background refresh doesn't disrupt reading
3. Errors don't blank out existing content
4. Better perceived performance

## Step 5: Combining Multiple Async States

Wait for multiple data sources with `async.all()`:

```tsx
// components/Dashboard.tsx
import { useStore, trigger } from 'storion/react';
import { async } from 'storion/async';
import { userStore } from '../stores/userStore';
import { statsStore } from '../stores/statsStore';

function DashboardContent() {
  const dashboard = useStore(({ get }) => {
    const [userState, userActions] = get(userStore);
    const [statsState, statsActions] = get(statsStore);
    
    // Trigger both fetches
    trigger(userActions.fetchUsers, []);
    trigger(statsActions.fetchStats, []);

    // Wait for both to be ready
    // Throws if either is pending/error → caught by Suspense/ErrorBoundary
    const [users, stats] = async.all(
      userState.users,
      statsState.stats
    );

    return { users, stats };
  });

  return (
    <div className="dashboard">
      <StatsPanel stats={dashboard.stats} />
      <UserTable users={dashboard.users} />
    </div>
  );
}

export function Dashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  );
}
```

## Cancellation

Requests are automatically cancelled when:
- A new request starts (prevents race conditions)
- The component unmounts
- The store is disposed

```ts
const userQuery = async.action(
  focus('currentUser'),
  async (ctx, userId: string) => {
    // 1. Signal passed to fetch - cancelled automatically
    const res = await fetch(`/api/users/${userId}`, {
      signal: ctx.signal,
    });
    
    // 2. Check before expensive operations
    if (ctx.signal.aborted) return;
    
    const data = await res.json();
    
    // 3. Another checkpoint
    if (ctx.signal.aborted) return;
    
    // 4. Optional: heavy processing
    const processed = expensiveTransform(data);
    
    return processed;
  }
);
```

**Why check `signal.aborted`?**

Even though fetch throws on abort, subsequent synchronous code still runs. Add checks before CPU-intensive operations to bail out early.

## Adding Retry Logic

Use the `abortable` wrapper for advanced patterns:

```ts
import { abortable, retry, timeout } from 'storion/async';

// Define a robust fetch function
const fetchUser = abortable(async ({ signal }, userId: string) => {
  const res = await fetch(`/api/users/${userId}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
});

// Chain wrappers for retry + timeout
const robustFetchUser = fetchUser
  .use(retry(3, { backoff: 'exponential' }))
  .use(timeout(10000));

// Use in store
const userQuery = async.action(focus('currentUser'), robustFetchUser);
```

## Key Concepts Demonstrated

### 1. Async State Management

| Concept | Description |
|---------|-------------|
| `async.fresh<T>()` | Undefined until loaded, throws during pending |
| `async.stale<T>(init)` | Keeps previous data, graceful degradation |
| `async.action()` | Store-bound async with cancellation |
| `async.wait()` | Extract data, throws for Suspense |

### 2. Component Patterns

| Pattern | Use Case |
|---------|----------|
| Status checks | Explicit loading/error handling |
| Suspense + ErrorBoundary | Declarative, cleaner component code |
| Stale-while-revalidate | Lists, feeds, cached content |

### 3. trigger() Best Practices

- Always use stable function references
- Deps array controls re-triggering
- Pass args as rest parameters

### 4. Cancellation Checkpoints

- Pass `ctx.signal` to fetch
- Check `ctx.signal.aborted` before heavy operations
- Use `ctx.safe()` for automatic cancellation handling

## Exercises

1. **Pagination**: Add page number to `fetchUsers` and show next/prev buttons
2. **Search**: Debounce search input and fetch filtered users
3. **Optimistic Updates**: Show pending changes immediately, rollback on error
4. **Polling**: Refresh data every 30 seconds using `setInterval`
5. **Infinite Scroll**: Load more items when reaching bottom of list

## Complete Example

See the [Pokemon Demo](/demos) for a full implementation with:
- Search with debounce
- Detail view with navigation
- Error handling with retry
- Loading skeletons

## Next Steps

- **[Async API Reference](/api/async)** — Full API documentation
- **[abortable()](/api/abortable)** — Cancellable functions with wrappers
- **[Effects](/guide/effects)** — Reactive side effects
- **[Network Layer](/guide/network)** — Offline support and retry strategies
