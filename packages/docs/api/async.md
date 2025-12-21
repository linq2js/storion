# async()

Creates an async state manager for handling loading, success, and error states.

## Signature

```ts
function async<TData, TArgs extends unknown[]>(
  focus: Focus<AsyncState<TData>>,
  fetcher: (ctx: AsyncContext, ...args: TArgs) => Promise<TData>
): AsyncManager<TData, TArgs>
```

## Async State Types

```ts
// Fresh mode - throws during pending/error
type AsyncFresh<T> = {
  status: 'idle' | 'pending' | 'success' | 'error';
  data: T | undefined;
  error: unknown;
};

// Stale mode - keeps previous data
type AsyncStale<T> = {
  status: 'idle' | 'pending' | 'success' | 'error';
  data: T;  // Always has data (initial or previous)
  error: unknown;
};
```

## Creating Async State

```ts
import { store } from 'storion';
import { async } from 'storion/async';

const userStore = store({
  name: 'user',
  state: {
    // Fresh: undefined until loaded
    profile: async.fresh<User>(),
    
    // Stale: keeps previous data during refresh
    posts: async.stale<Post[]>([]),
  },
  setup({ focus }) {
    const profileAsync = async(
      focus('profile'),
      async (ctx, userId: string) => {
        const res = await fetch(`/api/users/${userId}`, {
          signal: ctx.signal,  // Cancellation support
        });
        return res.json();
      }
    );

    const postsAsync = async(
      focus('posts'),
      async (ctx, userId: string) => {
        const res = await fetch(`/api/users/${userId}/posts`, {
          signal: ctx.signal,
        });
        return res.json();
      }
    );

    return {
      fetchProfile: profileAsync.dispatch,
      fetchPosts: postsAsync.dispatch,
    };
  },
});
```

## AsyncManager Methods

### dispatch()

Triggers the async operation.

```ts
actions.fetchProfile('user-123');
```

### wait()

Gets the data, throwing if not ready (for Suspense).

```ts
// In fresh mode: throws if pending/error
const data = state.profile.wait();

// In stale mode: returns previous data during pending
const data = state.posts.wait();
```

## Fresh vs Stale Mode

| Status | Fresh Mode | Stale Mode |
|--------|-----------|------------|
| `idle` | ❌ Throws `AsyncNotReadyError` | ✅ Returns initial data |
| `pending` | ❌ Throws promise (Suspense) | ✅ Returns previous data |
| `success` | ✅ Returns data | ✅ Returns data |
| `error` | ❌ Throws error | ✅ Returns previous data |

## Usage in React

### With Status Checks

```tsx
function UserProfile({ userId }: { userId: string }) {
  const { profile } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    trigger(actions.fetchProfile, [userId], userId);
    return { profile: state.profile };
  });

  if (profile.status === 'pending') return <Spinner />;
  if (profile.status === 'error') return <Error error={profile.error} />;
  if (profile.status === 'idle') return null;

  return <div>{profile.data.name}</div>;
}
```

### With Suspense (Fresh Mode)

```tsx
function UserProfile({ userId }: { userId: string }) {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    trigger(actions.fetchProfile, [userId], userId);
    
    // Throws promise during pending → triggers Suspense
    return { user: state.profile.wait() };
  });

  return <div>{user.name}</div>;
}

// Wrap with Suspense
<Suspense fallback={<Spinner />}>
  <UserProfile userId="123" />
</Suspense>
```

### With Stale Data

```tsx
function PostList({ userId }: { userId: string }) {
  const { posts, isRefreshing } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    trigger(actions.fetchPosts, [userId], userId);
    
    return {
      // Always returns data (empty array initially)
      posts: state.posts.wait(),
      isRefreshing: state.posts.status === 'pending',
    };
  });

  return (
    <div>
      {isRefreshing && <RefreshIndicator />}
      <ul>
        {posts.map(post => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Cancellation

The `ctx.signal` is automatically cancelled when:
- A new request starts
- The store is disposed

```ts
const profileAsync = async(
  focus('profile'),
  async (ctx, userId: string) => {
    // Use signal for fetch
    const res = await fetch(`/api/users/${userId}`, {
      signal: ctx.signal,
    });
    
    // Check if cancelled before expensive operations
    if (ctx.signal.aborted) return;
    
    return res.json();
  }
);
```

## Error Handling

```tsx
function UserProfile({ userId }: { userId: string }) {
  const { profile, retry } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    trigger(actions.fetchProfile, [userId], userId);
    
    return {
      profile: state.profile,
      retry: () => actions.fetchProfile(userId),
    };
  });

  if (profile.status === 'error') {
    return (
      <div>
        <p>Error: {String(profile.error)}</p>
        <button onClick={retry}>Retry</button>
      </div>
    );
  }

  // ...
}
```

## See Also

- [trigger()](/api/trigger) - Triggering async actions
- [Async Guide](/guide/async) - Deep dive into async patterns

