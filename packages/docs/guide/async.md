# Async State

Handling loading, error, and success states is one of the most complex parts of UI development. Storion provides a purpose-built async system that handles cancellation, caching, and state transitions automatically.

## The Problem

Traditional async handling in React leads to boilerplate and bugs:

```tsx
// ❌ Manual async handling - verbose and error-prone
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchUser(userId)
      .then((data) => {
        if (!cancelled) {
          setUser(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Still need to handle all states in render...
}
```

Storion's async system handles all of this:

```tsx
// ✅ Storion - clean and automatic
function UserProfile({ userId }) {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    trigger(actions.fetchUser, [userId], userId);
    return { user: state.user };
  });

  if (user.status === "pending") return <Spinner />;
  if (user.status === "error") return <Error error={user.error} />;
  return <div>{user.data?.name}</div>;
}
```

## Installation

```ts
import { async } from "storion/async";
```

## Naming Convention

Use semantic names that describe the operation type:

| Type             | Pattern     | Example                                    |
| ---------------- | ----------- | ------------------------------------------ |
| Read operations  | `*Query`    | `userQuery`, `postsQuery`                  |
| Write operations | `*Mutation` | `createUserMutation`, `updatePostMutation` |
| Other operations | `*Action`   | `uploadAction`, `downloadAction`           |

## Two Modes: Fresh vs Stale

Storion offers two strategies for handling data during loading states:

### Fresh Mode (Suspense-compatible)

Data is `undefined` during loading. Best for:

- Initial page loads
- Data that shouldn't show stale values
- Suspense-based UIs

```ts
const userStore = store({
  name: "user",
  state: {
    user: async.fresh<User>(), // undefined during loading
  },
  setup({ focus }) {
    const userQuery = async.action(focus("user"), async (ctx, id: string) => {
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

Preserves previous data during loading. Best for:

- Lists that shouldn't flash empty
- Paginated data
- "Stale-while-revalidate" patterns

```ts
const userStore = store({
  name: "user",
  state: {
    users: async.stale<User[]>([]), // Shows [] while loading, then previous data
  },
  setup({ focus }) {
    const usersQuery = async.action(focus("users"), async (ctx) => {
      const res = await fetch("/api/users", { signal: ctx.signal });
      return res.json();
    });

    return {
      fetchUsers: usersQuery.dispatch,
      refreshUsers: usersQuery.refresh,
    };
  },
});
```

## Accessing Async State

Both modes give you the same async state shape:

```ts
interface AsyncState<T> {
  status: "idle" | "pending" | "success" | "error";
  data: T | undefined; // The resolved data
  error: Error | undefined; // The error if status is 'error'
  mode: "fresh" | "stale"; // Which mode this state uses
}
```

You can access this directly and check the status manually (works the same for both modes):

```tsx
const { user } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { user: state.user }; // AsyncState<User>
});

// Check status manually - same for Fresh and Stale
if (user.status === "pending") return <Spinner />;
if (user.status === "error") return <Error error={user.error} />;
return <div>{user.data?.name}</div>;
```

### Using async.wait() to Extract Data

`async.wait()` extracts the data from an async state, but behaves differently based on the mode:

```tsx
// With async.wait() - behavior depends on mode
const { user } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { user: async.wait(state.user) }; // User (not AsyncState<User>)
});

// No status checks needed - async.wait() handles it
return <div>{user.name}</div>;
```

**`async.wait()` Behavior by Mode:**

| Status    | Fresh Mode                     | Stale Mode               |
| --------- | ------------------------------ | ------------------------ |
| `idle`    | ❌ Throws `AsyncNotReadyError` | ✅ Returns initial data  |
| `pending` | ❌ Throws promise (Suspense)   | ✅ Returns previous data |
| `success` | ✅ Returns data                | ✅ Returns data          |
| `error`   | ❌ Throws error                | ✅ Returns previous data |

**Fresh mode** is designed for Suspense - throwing promises lets React show fallback UI.

**Stale mode** never throws - it always returns the best available data (current, previous, or initial).

## Using Async State in Components

### Pattern 1: Status Checks

The most explicit approach - check status and render accordingly:

```tsx
function UserProfile({ userId }: { userId: string }) {
  const { user } = useStore(({ get }) => {
    const [state, actions] = get(userStore);

    // Trigger fetch when userId changes
    trigger(actions.fetchUser, [userId], userId);

    return { user: state.user };
  });

  // Handle all states explicitly
  if (user.status === "idle") return <button>Load User</button>;
  if (user.status === "pending") return <Spinner />;
  if (user.status === "error") return <Error error={user.error} />;

  return <div>{user.data.name}</div>;
}
```

### Pattern 2: With Suspense (Fresh Mode)

Let React Suspense handle the loading state:

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

// Wrap with Suspense boundary
function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <UserProfile userId="123" />
    </Suspense>
  );
}
```

### Pattern 3: Stale While Revalidate

Show previous data while fetching fresh data:

```tsx
function UserList() {
  const { users, isRefreshing } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    trigger(actions.fetchUsers, []);

    return {
      // Stale mode: always returns data (previous or current)
      users: state.users.data,
      isRefreshing: state.users.status === "pending",
    };
  });

  return (
    <div>
      {isRefreshing && <RefreshIndicator />}
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}
```

## Automatic Cancellation

Requests are automatically cancelled when:

1. **Component unmounts** — no stale updates
2. **New request starts** — prevents race conditions
3. **Store is disposed** — cleanup on teardown

Always use `ctx.signal` in your fetch calls:

```ts
async.action(focus("data"), async (ctx, query: string) => {
  const res = await fetch(`/api/search?q=${query}`, {
    signal: ctx.signal, // Aborts on cancellation
  });
  return res.json();
});
```

## trigger() Rules

::: warning Critical Rule
Never pass anonymous functions to `trigger()`. Anonymous functions create new references each render, causing the function to be called repeatedly.

```ts
// ❌ WRONG - new function reference each render = infinite calls
trigger(() => actions.fetch(id), [id]);

// ✅ CORRECT - stable function reference
trigger(actions.fetch, [id], id);
```

:::

**How trigger() works:**

```ts
trigger(fn, deps, ...args);
//      ↑   ↑      ↑
//      |   |      └── Arguments passed to fn
//      |   └── Dependency array (like useEffect deps)
//      └── Stable function reference
```

## Component-Local Mutations

For operations that don't need shared state (form submissions, one-off actions), use `async.mixin()`:

```tsx
const submitFormMutation = async.mixin(async (ctx, data: FormData) => {
  const res = await fetch("/api/submit", {
    method: "POST",
    body: JSON.stringify(data),
    signal: ctx.signal,
  });
  return res.json();
});

function ContactForm() {
  const [state, { dispatch }] = useStore(({ mixin }) => {
    return mixin(submitFormMutation);
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        dispatch(new FormData(e.target));
      }}
    >
      <button disabled={state.status === "pending"}>
        {state.status === "pending" ? "Submitting..." : "Submit"}
      </button>
      {state.status === "error" && <p>{state.error.message}</p>}
    </form>
  );
}
```

## Why Storion Async?

Compared to React Query, RTK Query, and Apollo:

| Advantage                     | Description                                                                 |
| ----------------------------- | --------------------------------------------------------------------------- |
| **Full control**              | Write any custom logic - conditional fetching, transformations, multi-fetch |
| **No hook composition**       | Combine multiple API calls in one action instead of multiple `useQuery`     |
| **Framework agnostic**        | Use same stores in Node.js, React Native, or background tasks               |
| **Component-local mutations** | Native mixin pattern for forms without global cache pollution               |
| **Network-aware retry**       | Built-in support for waiting on network reconnection                        |
| **Dependency injection**      | Easy testing with mock services                                             |
| **Unified state**             | Async state lives alongside regular state in the same store                 |

See the [detailed API reference](/api/async) for advanced features like `async.all()`, `async.race()`, `async.derive()`, and more.

## Next Steps

- **[Network Connectivity](/guide/network)** — Handle offline states and retries
- **[Abortable Functions](/api/abortable)** — Chainable wrappers for retry, timeout, caching
- **[async API Reference](/api/async)** — Complete API documentation
