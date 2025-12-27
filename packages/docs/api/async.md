# async

Creates async state managers for handling loading, success, and error states.

## Overview

The async module provides two distinct APIs:

| API              | Use Case                                     | State Scope   |
| ---------------- | -------------------------------------------- | ------------- |
| `async.action()` | Store-bound async operations (queries)       | Global/shared |
| `async.mixin()`  | Component-local async operations (mutations) | Per-component |

## Naming Convention

| Type             | Pattern     | Example                                    |
| ---------------- | ----------- | ------------------------------------------ |
| Read operations  | `*Query`    | `userQuery`, `postsQuery`                  |
| Write operations | `*Mutation` | `createUserMutation`, `submitFormMutation` |
| Other operations | `*Action`   | `uploadAction`, `downloadAction`           |

---

## async.action()

Create async actions bound to a focus (lens) for **store-bound** async state management.

### Signature

```ts
function async.action<TData, TArgs extends unknown[]>(
  focus: Focus<AsyncState<TData>>,
  handler: (ctx: AsyncContext, ...args: TArgs) => Promise<TData>,
  options?: AsyncOptions
): AsyncActions<TData, TArgs>;
```

### Example

```ts
import { store } from "storion";
import { async } from "storion/async";

const userStore = store({
  name: "user",
  state: { user: async.fresh<User>() },
  setup({ focus }) {
    const userQuery = async.action(focus("user"), async (ctx, id: string) => {
      const res = await fetch(`/api/users/${id}`, { signal: ctx.signal });
      return res.json();
    });

    return { fetchUser: userQuery.dispatch };
  },
});
```

---

## async.mixin()

Create an async selector mixin for **component-local** async state. Uses `scoped()` internally, so state is isolated per component and auto-disposed on unmount.

### Signature

```ts
function async.mixin<TData, TArgs extends unknown[]>(
  handler: (ctx: AsyncContext, ...args: TArgs) => Promise<TData>,
  options?: AsyncMixinOptions<TData>
): SelectorMixin<[AsyncState<TData>, AsyncActions<TData, TArgs>]>;
```

### Example

```ts
import { async } from "storion/async";

const submitMutation = async.mixin(async (ctx, data: FormData) => {
  const res = await fetch("/api/submit", {
    method: "POST",
    body: JSON.stringify(data),
    signal: ctx.signal,
  });
  return res.json();
});

function ContactForm() {
  const [state, { dispatch }] = useStore(({ mixin }) => mixin(submitMutation));

  return (
    <button
      onClick={() => dispatch(formData)}
      disabled={state.status === "pending"}
    >
      {state.status === "pending" ? "Submitting..." : "Submit"}
    </button>
  );
}
```

---

## Async State Types

```ts
// Fresh mode - throws during pending/error
type AsyncFresh<T> = {
  status: "idle" | "pending" | "success" | "error";
  data: T | undefined;
  error: unknown;
};

// Stale mode - keeps previous data
type AsyncStale<T> = {
  status: "idle" | "pending" | "success" | "error";
  data: T; // Always has data (initial or previous)
  error: unknown;
};
```

## Creating Async State

```ts
import { store } from "storion";
import { async } from "storion/async";

const userStore = store({
  name: "user",
  state: {
    // Fresh: undefined until loaded
    profile: async.fresh<User>(),

    // Stale: keeps previous data during refresh
    posts: async.stale<Post[]>([]),
  },
  setup({ focus }) {
    // Use *Query for read operations
    const profileQuery = async.action(
      focus("profile"),
      async (ctx, userId: string) => {
        const res = await fetch(`/api/users/${userId}`, {
          signal: ctx.signal, // Cancellation support
        });
        return res.json();
      }
    );

    const postsQuery = async.action(
      focus("posts"),
      async (ctx, userId: string) => {
        const res = await fetch(`/api/users/${userId}/posts`, {
          signal: ctx.signal,
        });
        return res.json();
      }
    );

    return {
      fetchProfile: profileQuery.dispatch,
      fetchPosts: postsQuery.dispatch,
      refreshPosts: postsQuery.refresh,
    };
  },
});
```

## AsyncActions Methods

The object returned by `async.action()` or `async.mixin()` includes these methods:

### dispatch(...args)

Triggers the async operation with the given arguments. Returns a cancellable promise.

```ts
const promise = actions.fetchProfile("user-123");
// Can cancel later
promise.cancel();
```

### refresh()

Re-dispatches with the last used arguments. Returns `undefined` if no previous dispatch.

```ts
// Re-fetch with same userId
actions.refresh();
```

### cancel()

Cancels the current ongoing operation.

```ts
actions.cancel();
```

### reset()

Resets the state back to idle.

```ts
actions.reset();
```

## Usage in React

### With Status Checks

```tsx
function UserProfile({ userId }: { userId: string }) {
  const { profile } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    trigger(actions.fetchProfile, [userId], userId);
    return { profile: state.profile };
  });

  if (profile.status === "pending") return <Spinner />;
  if (profile.status === "error") return <Error error={profile.error} />;
  if (profile.status === "idle") return null;

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
    return { user: async.wait(state.profile) };
  });

  return <div>{user.name}</div>;
}

// Wrap with Suspense
<Suspense fallback={<Spinner />}>
  <UserProfile userId="123" />
</Suspense>;
```

### With Stale Data

```tsx
function PostList({ userId }: { userId: string }) {
  const { posts, isRefreshing } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    trigger(actions.fetchPosts, [userId], userId);

    return {
      // Always returns data (empty array initially)
      posts: async.wait(state.posts),
      isRefreshing: state.posts.status === "pending",
    };
  });

  return (
    <div>
      {isRefreshing && <RefreshIndicator />}
      <ul>
        {posts.map((post) => (
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
// Use *Query for read operations
const profileQuery = async.action(
  focus("profile"),
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
const multiQuery = async.action(
  focus("results"),
  async (ctx, id: string) => {
    /* ... */
  },
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

  if (profile.status === "error") {
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

## AsyncOptions

Configuration options for async operations.

```ts
interface AsyncOptions {
  /** Auto-cancel previous request on new dispatch (default: true) */
  autoCancel?: boolean;
}
```

For retry, error handling, timeout, and other cross-cutting concerns, use [abortable() wrappers](/api/abortable#wrappers).

## AsyncContext

The context object passed to async handler functions (store-bound mode).

### signal

`AbortSignal` for cancellation. When `autoCancel: true` (default), automatically aborted when:

- A new request starts (previous request is cancelled)
- The store is disposed (cleanup registered via `focus.context.onDispose`)

```ts
async.action(focus("user"), async (ctx, userId: string) => {
  // Pass signal to fetch for automatic cancellation
  const res = await fetch(`/api/users/${userId}`, {
    signal: ctx.signal,
  });

  // Check if cancelled before expensive operations
  if (ctx.signal.aborted) return;

  return res.json();
});
```

### safe()

Safely execute operations that should be cancelled together. Has multiple overloads:

#### safe(promise)

Wrap a promise to never resolve/reject if the async operation is cancelled.

```ts
async.action(focus("data"), async (ctx) => {
  // If cancelled, these promises will never resolve
  const data1 = await ctx.safe(fetch("/api/1").then((r) => r.json()));
  const data2 = await ctx.safe(fetch("/api/2").then((r) => r.json()));

  return { data1, data2 };
});
```

#### safe(fn, ...args)

Call a function with arguments. If the result is a promise, wrap it.

```ts
async.action(focus("data"), async (ctx) => {
  // Call function with args, wrap result if promise
  const result = await ctx.safe(fetchUser, userId);

  // Works with sync functions too
  const computed = ctx.safe(processData, rawData);

  return result;
});
```

#### safe(Abortable, ...args)

Call an [abortable function](/api/abortable) with the context's signal automatically injected.

```ts
import { abortable } from "storion/async";

// Define abortable function
const fetchUser = abortable(async ({ signal }, id: string) => {
  const res = await fetch(`/api/users/${id}`, { signal });
  return res.json();
});

// In async handler - signal is auto-injected
async.action(focus("user"), async (ctx, id: string) => {
  const user = await ctx.safe(fetchUser, id);
  return user;
});
```

### cancel()

Manually cancel the current async operation. Useful for implementing custom timeouts.

```ts
async.action(focus("data"), async (ctx) => {
  // Timeout after 5 seconds
  const timeoutId = setTimeout(ctx.cancel, 5000);

  try {
    const data = await ctx.safe(fetch("/api/slow"));
    return data.json();
  } finally {
    clearTimeout(timeoutId);
  }
});
```

### get(spec)

Get another store's state and actions. Same as `StoreContext.get()`. Useful for cross-store mutations.

```ts
const checkoutMutation = async.mixin(async (ctx, paymentMethod: string) => {
  // Access other stores
  const [user] = ctx.get(userStore);
  const [cart] = ctx.get(cartStore);

  const res = await fetch("/api/checkout", {
    method: "POST",
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
const submitOrder = async.mixin(async (ctx, order: Order) => {
  const api = ctx.get(apiService);
  const logger = ctx.get(loggerService);

  logger.info("Submitting order", order.id);
  return api.submitOrder(order);
});
```

### Full Interface

```ts
interface AsyncContext {
  /** AbortSignal for cancellation */
  signal: AbortSignal;

  /** Wrap promise to never resolve if cancelled */
  safe<T>(promise: Promise<T>): Promise<T>;

  /** Call function with args, wrap result if promise */
  safe<TArgs extends any[], TResult>(
    fn: (...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult extends Promise<infer U> ? Promise<U> : TResult;

  /** Cancel the current async operation */
  cancel(): void;

  /** Get store state/actions or service instance */
  get: StoreContext["get"];
}
```

::: tip
For creating standalone cancellable functions with wrappers (retry, timeout, caching), see [abortable()](/api/abortable).
:::

---

## Utility Functions

The `async` namespace provides utility functions for working with async states.

### async.wait()

Extract data from an async state, throwing if not ready. Designed for use with React Suspense or `async.derive()`.

```ts
function async.wait<T>(state: AsyncState<T>): T;
```

**Behavior:**

| Status    | Fresh Mode                     | Stale Mode                   |
| --------- | ------------------------------ | ---------------------------- |
| `idle`    | ❌ Throws `AsyncNotReadyError` | ✅ Returns stale data if any |
| `pending` | ❌ Throws promise (Suspense)   | ✅ Returns stale data if any |
| `success` | ✅ Returns data                | ✅ Returns data              |
| `error`   | ❌ Throws error                | ✅ Returns stale data if any |

**Example:**

```ts
import { async } from "storion/async";

// In fresh mode: throws if pending/error
const userData = async.wait(state.user);

// In stale mode: returns previous data during pending
const posts = async.wait(state.posts);

// With Suspense boundary
function UserProfile() {
  const user = useStore(({ get }) => {
    const [state] = get(userStore);
    return async.wait(state.user); // Suspends if pending
  });
  return <div>{user.name}</div>;
}
```

### async.all()

Wait for all async states to be ready. Supports both `AsyncState` and `PromiseWithState`, with array, record, or rest parameter syntax.

```ts
// Array form (recommended for type inference)
function async.all<T extends AsyncOrPromise[]>(states: T): MapData<T>;

// Record form
function async.all<T extends Record<string, AsyncOrPromise>>(
  states: T
): MapRecordData<T>;

// Rest params (backward compatible)
function async.all<T extends AsyncOrPromise[]>(...states: T): MapData<T>;
```

**Example:**

```ts
// Array form - tuple inference with const
const [user, posts, comments] = async.all([
  state.user,
  state.posts,
  state.comments,
]);

// Record form - named results
const { user, posts } = async.all({
  user: state.user,
  posts: state.posts,
});

// Rest params (backward compatible)
const [a, b, c] = async.all(state.a, state.b, state.c);

// Works with PromiseWithState too
const [userData, postsData] = async.all([
  async.state(fetchUser()),
  async.state(fetchPosts()),
]);

// Use in derive()
async.derive(focus("combined"), () => {
  const { user, posts } = async.all({
    user: state.user,
    posts: state.posts,
  });
  return { userName: user.name, postCount: posts.length };
});
```

### async.race()

Returns the first successful result from async states. Supports both `AsyncState` and `PromiseWithState`, with array or record syntax.

```ts
// Array form - returns [index, data]
function async.race<T extends AsyncOrPromise[]>(
  states: T
): [number, InferData<T[number]>];

// Record form - returns [key, data]
function async.race<T extends Record<string, AsyncOrPromise>>(
  states: T
): [keyof T, InferData<T[keyof T]>];
```

**Example:**

```ts
// Array form
const [index, data] = async.race([state.primary, state.fallback]);
console.log(`Winner at index ${index}:`, data);

// Record form
const [winner, data] = async.race({
  cache: state.cachedData,
  network: state.networkData,
  fallback: state.fallbackData,
});
console.log(`First ready: ${winner}`, data);

// With PromiseWithState
const [source, result] = async.race({
  api1: async.state(fetchFromApi1()),
  api2: async.state(fetchFromApi2()),
});
```

### async.any()

Returns the first ready data from multiple states (like `Promise.any`). Supports both `AsyncState` and `PromiseWithState`, with array, record, or rest parameter syntax.

```ts
// Array form
function async.any<T extends AsyncOrPromise[]>(states: T): InferData<T[number]>;

// Record form
function async.any<T extends Record<string, AsyncOrPromise>>(
  states: T
): InferData<T[keyof T]>;

// Rest params (backward compatible)
function async.any<T extends AsyncOrPromise[]>(
  ...states: T
): InferData<T[number]>;
```

**Example:**

```ts
// Array form
const userData = async.any([
  state.primarySource,
  state.secondarySource,
  state.fallbackSource,
]);

// Record form
const data = async.any({
  primary: state.primarySource,
  fallback: state.fallbackSource,
});

// Rest params (backward compatible)
const userData = async.any(
  state.primarySource,
  state.secondarySource,
  state.fallbackSource
);

// With PromiseWithState
const result = async.any([
  async.state(tryFastApi()),
  async.state(trySlowApi()),
]);
```

### async.settled()

Returns settled results for all states (never throws). Useful for handling mixed success/error states. Supports both `AsyncState` and `PromiseWithState`, with array, record, or rest parameter syntax.

```ts
// Result types differ by source:
// AsyncState → { status: "success"|"error"|"pending"|"idle", data?, error? }
// PromiseWithState → { status: "fulfilled"|"rejected"|"pending", value?, reason? }

// Array form
function async.settled<T extends AsyncOrPromise[]>(
  states: T
): CombinedSettledResult<InferData<T[number]>>[];

// Record form
function async.settled<T extends Record<string, AsyncOrPromise>>(
  states: T
): { [K in keyof T]: CombinedSettledResult<InferData<T[K]>> };

// Rest params (backward compatible)
function async.settled<T extends AsyncOrPromise[]>(
  ...states: T
): CombinedSettledResult<InferData<T[number]>>[];
```

**Example:**

```ts
// Array form
const results = async.settled([state.a, state.b, state.c]);

for (const result of results) {
  if (result.status === "success" || result.status === "fulfilled") {
    console.log("Data:", result.data ?? result.value);
  } else if (result.status === "error" || result.status === "rejected") {
    console.log("Error:", result.error ?? result.reason);
  }
}

// Record form - named results
const { user, posts } = async.settled({
  user: state.user,
  posts: state.posts,
});

if (user.status === "success") {
  console.log("User loaded:", user.data);
}
if (posts.status === "error") {
  console.log("Posts failed:", posts.error);
  // In stale mode, may still have data
  if (posts.data) console.log("Stale posts:", posts.data);
}

// Rest params (backward compatible)
const results = async.settled(state.a, state.b, state.c);

// With PromiseWithState
const [apiResult, dbResult] = async.settled([
  async.state(fetchFromApi()),
  async.state(fetchFromDb()),
]);

if (apiResult.status === "fulfilled") {
  console.log("API returned:", apiResult.value);
}
```

### async.delay()

Creates a cancellable promise that resolves after a delay.

```ts
function async.delay<T = void>(
  ms: number,
  resolvedValue?: T
): CancellablePromise<T>;
```

**Example:**

```ts
// Simple delay
await async.delay(1000);

// Delay with resolved value
const result = await async.delay(500, "done");

// Cancellable delay
const delayed = async.delay(5000);
delayed.cancel(); // Cancels the delay
```

### async.derive()

Derive an async state from other async states using a synchronous computation. The computation function uses `async.wait()` to extract data, which automatically handles pending states.

```ts
function async.derive<T>(
  focus: Focus<AsyncState<T>>,
  computeFn: () => T
): VoidFunction; // Returns dispose function
```

**Key behaviors:**

- If `computeFn` throws a promise (via `async.wait`), sets focus to pending
- If `computeFn` throws an error, sets focus to error state
- If `computeFn` returns a value, sets focus to success state
- Must be synchronous - do not use async/await inside

**Example:**

```ts
// Basic derivation
async.derive(focus("fullName"), () => {
  const user = async.wait(state.user);
  return `${user.firstName} ${user.lastName}`;
});

// Derive from multiple sources
async.derive(focus("summary"), () => {
  const [user, posts] = async.all([state.user, state.posts]);
  return {
    userName: user.name,
    postCount: posts.length,
  };
});

// Conditional dependencies
async.derive(focus("content"), () => {
  const type = async.wait(state.contentType);
  if (type === "article") {
    return async.wait(state.article);
  } else {
    return async.wait(state.video);
  }
});

// Cleanup when done
const dispose = async.derive(focus("derived"), () => {
  return async.wait(state.source) * 2;
});

// Later: stop the derivation
dispose();
```

---

## Component-Local Async (Mixin Pattern)

`async.mixin()` creates **component-local async state** using `scoped()` internally. Perfect for:

- Form submissions
- Mutations (create, update, delete)
- One-off API calls
- Any async operation that doesn't need global state

### Form Submission

```ts
import { async } from "storion/async";

// Use *Mutation for write operations
const submitFormMutation = async.mixin(async (ctx, data: FormData) => {
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
    const [state, actions] = mixin(submitFormMutation);
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
const deleteItemMutation = async.mixin(async (ctx, itemId: string) => {
  const res = await fetch(`/api/items/${itemId}`, {
    method: "DELETE",
    signal: ctx.signal,
  });
  if (!res.ok) throw new Error("Delete failed");
});

function ItemCard({ item }) {
  const { isDeleting, error, handleDelete } = useStore(({ mixin }) => {
    const [state, actions] = mixin(deleteItemMutation);
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

// Use *Mutation for write operations
const checkoutMutation = async.mixin(async (ctx, paymentMethod: string) => {
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
    const [state, actions] = mixin(checkoutMutation);
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

| Feature                  | Description                                    |
| ------------------------ | ---------------------------------------------- |
| **Component-local**      | Each component gets its own async state        |
| **Auto-disposed**        | State is cleaned up on unmount                 |
| **No store boilerplate** | No need to define a store for simple mutations |
| **Cancellation**         | Auto-cancel on new dispatch or store dispose   |
| **Type-safe**            | Full TypeScript inference for args and result  |
| **Store access**         | `ctx.get()` allows reading other stores' state |

### async.action() vs async.mixin()

| Use Case                      | API              | Scope         |
| ----------------------------- | ---------------- | ------------- |
| Shared data (users, products) | `async.action()` | Global/shared |
| Form submission               | `async.mixin()`  | Per-component |
| Delete/Update mutation        | `async.mixin()`  | Per-component |
| Paginated lists               | `async.action()` | Global/shared |
| Search with cache             | `async.action()` | Global/shared |
| One-off API call              | `async.mixin()`  | Per-component |

## Comparison with Other Libraries

### Feature Matrix

| Feature                       | Storion          | RTK Query             | React Query          | Apollo Client             |
| ----------------------------- | ---------------- | --------------------- | -------------------- | ------------------------- |
| Custom logic in handlers      | ✅ Full control  | ⚠️ Limited            | ⚠️ Limited           | ⚠️ Limited                |
| Multiple API calls per action | ✅ Native        | ❌ Separate endpoints | ❌ Separate queries  | ❌ Separate operations    |
| Works outside React           | ✅ Yes           | ⚠️ With toolkit       | ❌ React-only        | ⚠️ With client            |
| No hooks for combining logic  | ✅ Yes           | ❌ useQueries         | ❌ useQueries        | ❌ useQuery + useMutation |
| Component-local state         | ✅ Mixin pattern | ❌ Global cache       | ⚠️ With options      | ❌ Normalized cache       |
| Cancel on unmount             | ✅ Automatic     | ✅ Automatic          | ✅ Automatic         | ✅ Automatic              |
| Retry with strategies         | ✅ Built-in      | ✅ Built-in           | ✅ Built-in          | ⚠️ Via links              |
| Network-aware retry           | ✅ Built-in      | ⚠️ Manual             | ⚠️ Via onlineManager | ❌ Manual                 |
| TypeScript inference          | ✅ Full          | ✅ Full               | ✅ Full              | ✅ With codegen           |
| Bundle size                   | ~4KB             | ~12KB                 | ~13KB                | ~30KB+                    |
| GraphQL required              | ❌ No            | ❌ No                 | ❌ No                | ✅ Yes                    |
| Dependency injection          | ✅ Built-in      | ❌ No                 | ❌ No                | ❌ No                     |

### Key Advantages

#### 1. Full Control Over Async Logic

Unlike RTK Query, React Query, or Apollo where you define endpoints/queries declaratively, Storion lets you write any custom logic:

```ts
// RTK Query - limited to single endpoint transformation
const api = createApi({
  endpoints: (builder) => ({
    getUser: builder.query({
      query: (id) => `/users/${id}`,
      transformResponse: (res) => res.data, // Limited transformation
    }),
  }),
});

// React Query - logic scattered across hooks
function useUserWithPosts(userId) {
  const user = useQuery(["user", userId], () => fetchUser(userId));
  const posts = useQuery(["posts", userId], () => fetchPosts(userId), {
    enabled: !!user.data,
  });
  // Must manually combine in component
  return { user, posts };
}

// Storion - full control in one place
const userQuery = async.action(focus("user"), async (ctx, userId: string) => {
  // Any custom logic you need
  const user = await fetchUser(userId, { signal: ctx.signal });

  // Conditional fetching
  if (user.hasPremium) {
    user.subscription = await fetchSubscription(user.id);
  }

  // Transform, validate, combine
  return {
    ...user,
    displayName: `${user.firstName} ${user.lastName}`,
    isActive: user.lastSeen > Date.now() - 3600000,
  };
});
```

#### 2. Multiple API Calls Without Hook Composition

Other libraries require multiple hooks and manual state management:

```tsx
// React Query - requires multiple hooks
function Dashboard() {
  const user = useQuery(["user"], fetchUser);
  const posts = useQuery(["posts"], fetchPosts, { enabled: !!user.data });
  const stats = useQuery(["stats"], fetchStats, { enabled: !!user.data });

  // Manual loading/error combination
  const isLoading = user.isLoading || posts.isLoading || stats.isLoading;
  const error = user.error || posts.error || stats.error;

  if (isLoading) return <Spinner />;
  if (error) return <Error error={error} />;

  return (
    <DashboardView user={user.data} posts={posts.data} stats={stats.data} />
  );
}

// Storion - single action, unified state
const dashboardQuery = async.action(focus("dashboard"), async (ctx) => {
  const [user, posts, stats] = await Promise.all([
    fetchUser({ signal: ctx.signal }),
    fetchPosts({ signal: ctx.signal }),
    fetchStats({ signal: ctx.signal }),
  ]);

  return { user, posts, stats, loadedAt: Date.now() };
});

// Component is simple
function Dashboard() {
  const { dashboard, fetch } = useStore(({ get }) => {
    const [state, actions] = get(dashboardStore);
    trigger(actions.fetchDashboard, []);
    return { dashboard: state.dashboard, fetch: actions.fetchDashboard };
  });

  if (dashboard.status === "pending") return <Spinner />;
  if (dashboard.status === "error") return <Error error={dashboard.error} />;

  return <DashboardView {...dashboard.data} />;
}
```

#### 3. Works Outside React

Storion async actions work anywhere - Node.js, React Native, or vanilla JavaScript:

```ts
// Node.js script
import { container } from "storion";
import { userStore } from "./stores";

const app = container();
const { actions } = app.get(userStore);

// Use directly without React
await actions.fetchUsers();
await actions.syncData();
console.log(app.get(userStore).state.users);

// Background job
setInterval(() => {
  actions.refreshCache();
}, 60000);
```

```ts
// React Native with same stores
import { userStore } from "@myapp/stores"; // Shared package
import { container } from "storion";

// Use in native modules or background tasks
const app = container();
app.get(userStore).actions.syncOfflineData();
```

#### 4. Component-Local Mutations Without Boilerplate

RTK Query and React Query use global caches, requiring workarounds for component-local state:

```tsx
// React Query - workaround for local state
function DeleteButton({ itemId }) {
  // mutation state is shared globally by default
  const mutation = useMutation({
    mutationFn: (id) => deleteItem(id),
    // Must manually scope with mutationKey
    mutationKey: ["delete", itemId],
  });

  return <button onClick={() => mutation.mutate(itemId)}>Delete</button>;
}

// Storion - native component-local mutations
const deleteItemMutation = async.mixin(async (ctx, id: string) => {
  await fetch(`/api/items/${id}`, { method: "DELETE", signal: ctx.signal });
});

function DeleteButton({ itemId }) {
  // Each component instance has its own state - automatically
  const { isPending, remove } = useStore(({ mixin }) => {
    const [state, actions] = mixin(deleteItemMutation);
    return {
      isPending: state.status === "pending",
      remove: () => actions.dispatch(itemId),
    };
  });

  return (
    <button onClick={remove} disabled={isPending}>
      Delete
    </button>
  );
}
```

#### 5. Testable with Dependency Injection

```ts
// Production store
const dataStore = store({
  name: "data",
  state: { items: async.fresh<Item[]>() },
  setup({ get, focus }) {
    const api = get(apiService); // Injected dependency
    const itemsQuery = async.action(focus("items"), () => api.getItems());
    return { fetchItems: itemsQuery.dispatch };
  },
});

// Test with mock
const testContainer = container();
testContainer.set(apiService, () => ({
  getItems: async () => [{ id: "1", name: "Test" }],
}));

const { actions } = testContainer.get(dataStore);
await actions.fetchItems();
expect(testContainer.get(dataStore).state.items.data).toHaveLength(1);
```

#### 6. Network-Aware Retry Built-In

```ts
import { abortable, retry } from "storion/async";
import { networkService } from "storion/network";

setup({ get, focus }) {
  const network = get(networkService);

  // Define abortable function
  const fetchData = abortable(async ({ signal }) => {
    const res = await fetch("/api/data", { signal });
    return res.json();
  });

  // Chain wrappers: retry transient errors, then wait for network
  const robustFetch = fetchData
    .use(retry(3))              // Retry up to 3 times with backoff
    .use(network.offlineRetry()); // Wait for reconnection on network errors

  const dataQuery = async.action(focus("data"), robustFetch);

  return { fetchData: dataQuery.dispatch };
}
```

### When to Choose Storion

| Scenario                    | Best Choice             | Why                              |
| --------------------------- | ----------------------- | -------------------------------- |
| Complex data fetching logic | **Storion**             | Full control over async handlers |
| GraphQL API                 | Apollo Client           | Native GraphQL support           |
| Simple REST caching         | RTK Query / React Query | Battle-tested caching            |
| Cross-platform shared logic | **Storion**             | Framework-agnostic stores        |
| Component-local mutations   | **Storion**             | Native mixin pattern             |
| Server-side rendering       | All viable              | All support SSR                  |
| Offline-first apps          | **Storion**             | Built-in network module          |
| Micro-frontends             | **Storion**             | Dependency injection & isolation |

### Migration Patterns

#### From React Query

```tsx
// Before (React Query)
const { data, isLoading, error } = useQuery(["user", id], () => fetchUser(id));

// After (Storion)
const { user } = useStore(({ get }) => {
  const [state, actions] = get(userStore);
  trigger(actions.fetchUser, [id], id);
  return { user: state.user };
});
// status: user.status, data: user.data, error: user.error
```

#### From RTK Query

```tsx
// Before (RTK Query)
const { data, isLoading, error } = useGetUserQuery(id);

// After (Storion)
const { user, fetchUser } = useStore(({ get }) => {
  const [state, actions] = get(userStore);
  trigger(actions.fetchUser, [id], id);
  return { user: state.user, fetchUser: actions.fetchUser };
});
```

## See Also

- [abortable()](/api/abortable) - Cancellable functions with wrappers (retry, timeout, caching)
- [trigger()](/api/trigger) - Triggering async actions
- [scoped()](/api/use-store#component-local-stores-with-scoped) - Component-local stores
- [Async Guide](/guide/async) - Deep dive into async patterns
- [Network Module](/api/network) - Network connectivity and retry
