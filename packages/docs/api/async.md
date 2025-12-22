# async()

Creates an async state manager for handling loading, success, and error states.

## Signatures

### Store-bound (with focus)

```ts
function async<TData, TArgs extends unknown[]>(
  focus: Focus<AsyncState<TData>>,
  handler: (ctx: AsyncContext, ...args: TArgs) => Promise<TData>,
  options?: AsyncOptions
): AsyncActions<TData, TArgs>
```

### Selector Mixin (component-local)

```ts
function async<TData, TArgs extends unknown[]>(
  handler: (ctx: AsyncContext, ...args: TArgs) => Promise<TData>,
  options?: AsyncMixinOptions<TData>
): SelectorMixin<[AsyncState<TData>, AsyncActions<TData, TArgs>]>
```

The mixin overload is ideal for **mutations** and **form submissions** where state should be component-local and auto-disposed.

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

When `autoCancel: true` (the default), the `ctx.signal` is automatically aborted when:
- A new request starts (previous request is cancelled)
- The store is disposed (via `focus.context.onDispose`)

```ts
const profileAsync = async(
  focus('profile'),
  async (ctx, userId: string) => {
    // Use signal for fetch - automatically cancelled on new request or dispose
    const res = await fetch(`/api/users/${userId}`, {
      signal: ctx.signal,
    });
    
    // Check if cancelled before expensive operations
    if (ctx.signal.aborted) return;
    
    return res.json();
  }
);

// Disable auto-cancel for concurrent requests
const multiAsync = async(
  focus('results'),
  async (ctx, id: string) => { /* ... */ },
  { autoCancel: false }
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

## AsyncContext

The context object passed to async handler functions (store-bound mode).

### signal

`AbortSignal` for cancellation. When `autoCancel: true` (default), automatically aborted when:
- A new request starts (previous request is cancelled)
- The store is disposed (cleanup registered via `focus.context.onDispose`)

```ts
async(focus('user'), async (ctx, userId: string) => {
  // Pass signal to fetch for automatic cancellation
  const res = await fetch(`/api/users/${userId}`, {
    signal: ctx.signal,
  });
  
  // Check if cancelled before expensive operations
  if (ctx.signal.aborted) return;
  
  return res.json();
});
```

### safe(promise)

Wrap a promise to never resolve/reject if the async operation is cancelled. Useful for nested async operations that should be cancelled together.

```ts
async(focus('data'), async (ctx) => {
  // If cancelled, these promises will never resolve
  const data1 = await ctx.safe(fetch('/api/1').then(r => r.json()));
  const data2 = await ctx.safe(fetch('/api/2').then(r => r.json()));
  
  return { data1, data2 };
});
```

### safe(callback)

Wrap a callback to not run if the async operation is cancelled. Useful for event handlers, timeouts, and deferred operations.

```ts
async(focus('data'), async (ctx) => {
  // Callback won't run if cancelled
  setTimeout(ctx.safe(() => {
    console.log('Still active!');
  }), 1000);
  
  // Safe callback for state updates
  someEmitter.on('data', ctx.safe((data) => {
    // Only runs if not cancelled
    processData(data);
  }));
  
  return await fetchData();
});
```

### cancel()

Manually cancel the current async operation. Useful for implementing custom timeouts.

```ts
async(focus('data'), async (ctx) => {
  // Timeout after 5 seconds
  const timeoutId = setTimeout(ctx.cancel, 5000);
  
  try {
    const data = await ctx.safe(fetch('/api/slow'));
    return data.json();
  } finally {
    clearTimeout(timeoutId);
  }
});
```

### Full Interface

```ts
interface AsyncContext {
  /** AbortSignal for cancellation */
  signal: AbortSignal;
  
  /** Wrap promise to never resolve if cancelled */
  safe<T>(promise: Promise<T>): Promise<T>;
  
  /** Wrap callback to not run if cancelled */
  safe<TArgs, TReturn>(
    callback: (...args: TArgs) => TReturn
  ): (...args: TArgs) => TReturn | undefined;
  
  /** Cancel the current async operation */
  cancel(): void;
}
```

## AsyncMixinContext

Extended context for async mixin handlers (component-local mode). Includes everything from `AsyncContext` plus store access.

### get(spec)

Get another store's state and actions. Same as `StoreContext.get()`.

```ts
const checkout = async(async (ctx, paymentMethod: string) => {
  // Access other stores
  const [user] = ctx.get(userStore);
  const [cart] = ctx.get(cartStore);
  
  const res = await fetch('/api/checkout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${user.token}` },
    body: JSON.stringify({
      userId: user.id,
      items: cart.items,
      paymentMethod,
    }),
    signal: ctx.signal,
  });
  
  return res.json();
});
```

### get(factory)

Get a service or factory instance.

```ts
const submitOrder = async(async (ctx, order: Order) => {
  const api = ctx.get(apiService);
  const logger = ctx.get(loggerService);
  
  logger.info('Submitting order', order.id);
  return api.submitOrder(order);
});
```

### Full Interface

```ts
interface AsyncMixinContext extends AsyncContext {
  /** Get store state/actions or service instance */
  get: StoreContext["get"];
}
```

| Context | Mode | Store Access |
|---------|------|--------------|
| `AsyncContext` | Store-bound (`async(focus, handler)`) | ❌ No |
| `AsyncMixinContext` | Mixin (`async(handler)`) | ✅ Yes via `ctx.get()` |

## Component-Local Async (Mixin Pattern)

The mixin overload creates **component-local async state** using `scoped()` internally. Perfect for:

- Form submissions
- Mutations (create, update, delete)
- One-off API calls
- Any async operation that doesn't need global state

### Form Submission

```ts
import { async } from "storion/async";

// Define the mutation - returns a selector mixin
const submitForm = async(async (ctx, data: FormData) => {
  const res = await fetch("/api/submit", {
    method: "POST",
    body: JSON.stringify(data),
    signal: ctx.signal,
  });
  if (!res.ok) throw new Error("Submission failed");
  return res.json();
});

// Usage in component
function ContactForm() {
  const { status, error, submit } = useStore(({ mixin }) => {
    const [state, actions] = mixin(submitForm);
    return {
      status: state.status,
      error: state.error,
      submit: actions.dispatch,
    };
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    submit({ name: formData.get("name"), email: formData.get("email") });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input name="name" />
      <input name="email" type="email" />
      <button disabled={status === "pending"}>
        {status === "pending" ? "Submitting..." : "Submit"}
      </button>
      {status === "error" && <p className="error">{error.message}</p>}
      {status === "success" && <p className="success">Submitted!</p>}
    </form>
  );
}
```

### Delete Mutation

```ts
const deleteItem = async(async (ctx, itemId: string) => {
  const res = await fetch(`/api/items/${itemId}`, {
    method: "DELETE",
    signal: ctx.signal,
  });
  if (!res.ok) throw new Error("Delete failed");
});

function ItemCard({ item }) {
  const { isDeleting, error, handleDelete } = useStore(({ mixin }) => {
    const [state, actions] = mixin(deleteItem);
    return {
      isDeleting: state.status === "pending",
      error: state.status === "error" ? state.error : null,
      handleDelete: () => actions.dispatch(item.id),
    };
  });

  return (
    <div className="item-card">
      <h3>{item.name}</h3>
      <button onClick={handleDelete} disabled={isDeleting}>
        {isDeleting ? "Deleting..." : "Delete"}
      </button>
      {error && <p className="error">{error.message}</p>}
    </div>
  );
}
```

### With Initial/Stale State

```ts
import { async, asyncState } from "storion/async";

// Start with stale data to show previous result
const updateProfile = async(
  async (ctx, data: ProfileData) => {
    const res = await fetch("/api/profile", {
      method: "PUT",
      body: JSON.stringify(data),
      signal: ctx.signal,
    });
    return res.json();
  },
  { initial: asyncState("stale", "idle", null) }
);
```

### Accessing Other Stores

The mixin context extends `AsyncContext` with a `get()` method, allowing handlers to access other stores' state and actions:

```ts
import { async } from "storion/async";

// Define stores
const userStore = store({
  name: "user",
  state: { id: "", token: "" },
  setup: () => ({}),
});

const cartStore = store({
  name: "cart",
  state: { items: [] as CartItem[] },
  setup: () => ({}),
});

// Mutation that uses data from multiple stores
const checkout = async(async (ctx, paymentMethod: string) => {
  // Access other stores via ctx.get()
  const [user] = ctx.get(userStore);
  const [cart] = ctx.get(cartStore);

  const res = await fetch("/api/checkout", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${user.token}`,
    },
    body: JSON.stringify({
      userId: user.id,
      items: cart.items,
      paymentMethod,
    }),
    signal: ctx.signal,
  });

  if (!res.ok) throw new Error("Checkout failed");
  return res.json();
});

// Usage in component
function CheckoutButton() {
  const { status, submit } = useStore(({ mixin }) => {
    const [state, actions] = mixin(checkout);
    return { status: state.status, submit: actions.dispatch };
  });

  return (
    <button onClick={() => submit("card")} disabled={status === "pending"}>
      {status === "pending" ? "Processing..." : "Pay Now"}
    </button>
  );
}
```

This is useful for mutations that need to gather data from multiple stores before submission, like checkout flows, form submissions with user context, or any operation that combines state from different sources.

### Key Benefits

| Feature | Description |
|---------|-------------|
| **Component-local** | Each component gets its own async state |
| **Auto-disposed** | State is cleaned up on unmount |
| **No store boilerplate** | No need to define a store for simple mutations |
| **Cancellation** | Auto-cancel on new dispatch or store dispose |
| **Type-safe** | Full TypeScript inference for args and result |
| **Store access** | `ctx.get()` allows reading other stores' state |

### Mixin vs Store-bound

| Use Case | Approach |
|----------|----------|
| Shared data (users, products) | Store-bound with `focus()` |
| Form submission | Mixin (component-local) |
| Delete/Update mutation | Mixin (component-local) |
| Paginated lists | Store-bound with `focus()` |
| Search with cache | Store-bound with `focus()` |
| One-off API call | Mixin (component-local) |

## See Also

- [trigger()](/api/trigger) - Triggering async actions
- [scoped()](/api/use-store#component-local-stores-with-scoped) - Component-local stores
- [Async Guide](/guide/async) - Deep dive into async patterns

