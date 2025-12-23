# async()

Creates an async state manager for handling loading, success, and error states.

## Naming Convention

| Type             | Pattern     | Example                                    |
| ---------------- | ----------- | ------------------------------------------ |
| Read operations  | `*Query`    | `userQuery`, `postsQuery`                  |
| Write operations | `*Mutation` | `createUserMutation`, `submitFormMutation` |

## Signatures

### Store-bound (with focus)

```ts
function async<TData, TArgs extends unknown[]>(
  focus: Focus<AsyncState<TData>>,
  handler: (ctx: AsyncContext, ...args: TArgs) => Promise<TData>,
  options?: AsyncOptions
): AsyncActions<TData, TArgs>;
```

### Selector Mixin (component-local)

```ts
function async<TData, TArgs extends unknown[]>(
  handler: (ctx: AsyncContext, ...args: TArgs) => Promise<TData>,
  options?: AsyncMixinOptions<TData>
): SelectorMixin<[AsyncState<TData>, AsyncActions<TData, TArgs>]>;
```

The mixin overload is ideal for **mutations** and **form submissions** where state should be component-local and auto-disposed.

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
    const profileQuery = async(
      focus("profile"),
      async (ctx, userId: string) => {
        const res = await fetch(`/api/users/${userId}`, {
          signal: ctx.signal, // Cancellation support
        });
        return res.json();
      }
    );

    const postsQuery = async(focus("posts"), async (ctx, userId: string) => {
      const res = await fetch(`/api/users/${userId}/posts`, {
        signal: ctx.signal,
      });
      return res.json();
    });

    return {
      fetchProfile: profileQuery.dispatch,
      fetchPosts: postsQuery.dispatch,
      refreshPosts: postsQuery.refresh,
    };
  },
});
```

## AsyncManager Methods

### dispatch()

Triggers the async operation.

```ts
actions.fetchProfile("user-123");
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

| Status    | Fresh Mode                     | Stale Mode               |
| --------- | ------------------------------ | ------------------------ |
| `idle`    | ❌ Throws `AsyncNotReadyError` | ✅ Returns initial data  |
| `pending` | ❌ Throws promise (Suspense)   | ✅ Returns previous data |
| `success` | ✅ Returns data                | ✅ Returns data          |
| `error`   | ❌ Throws error                | ✅ Returns previous data |

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
    return { user: state.profile.wait() };
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
      posts: state.posts.wait(),
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
const profileQuery = async(focus("profile"), async (ctx, userId: string) => {
  // Use signal for fetch - automatically cancelled on new request or dispose
  const res = await fetch(`/api/users/${userId}`, {
    signal: ctx.signal,
  });

  // Check if cancelled before expensive operations
  if (ctx.signal.aborted) return;

  return res.json();
});

// Disable auto-cancel for concurrent requests
const multiQuery = async(
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

For retry, error handling, timeout, and other cross-cutting concerns, use wrapper utilities with the `.use()` pattern. See [Wrappers](#wrappers) below.

## Wrappers

Built-in wrapper utilities for composing cross-cutting behavior on `abortable()` functions. Use the `.use()` method to chain wrappers:

```ts
import {
  abortable,
  retry,
  timeout,
  fallback,
  cache,
  circuitBreaker,
  logging,
} from "storion/async";

const getUser = abortable(async ({ signal }, id: string) => {
  const res = await fetch(`/api/users/${id}`, { signal });
  return res.json();
});

// Chain wrappers for resilient API calls
const robustGetUser = getUser
  .use(retry(3)) // Retry up to 3 times
  .use(timeout(5000)) // Abort after 5s
  .use(circuitBreaker()) // Fail fast after repeated errors
  .use(cache(60000)) // Cache for 1 minute
  .use(fallback(null)) // Return null on error
  .use(logging("getUser")); // Log calls for debugging

// Use with async()
const userQuery = async(focus("user"), robustGetUser);
```

**Available Wrappers:**

| Wrapper            | Purpose                                |
| ------------------ | -------------------------------------- |
| `retry()`          | Retry on failure with delay strategies |
| `timeout()`        | Abort after timeout                    |
| `catchError()`     | Handle errors without swallowing       |
| `logging()`        | Log calls for debugging                |
| `debounce()`       | Execute after delay with no new calls  |
| `throttle()`       | Execute once per time window           |
| `fallback()`       | Return default on error                |
| `cache()`          | Memoize results with TTL               |
| `rateLimit()`      | Queue excess calls                     |
| `circuitBreaker()` | Fail fast after repeated errors        |
| `map()`            | Simplified arg/result transformation   |

### retry()

Retry on failure with configurable count and delay strategy.

```ts
import { retry } from "storion/async";

// Retry 3 times with default backoff
fn.use(retry(3));

// Retry 5 times with linear delay
fn.use(retry({ count: 5, delay: "linear" }));

// Custom delay function
fn.use(retry({ count: 3, delay: (attempt) => attempt * 1000 }));

// Wait for condition (Promise<void>)
fn.use(retry({ count: 10, delay: () => waitForOnline() }));
```

**Retry Options:**

```ts
interface RetryOptions {
  /** Number of retry attempts (default: 3) */
  count?: number;
  /** Delay strategy or custom function */
  delay?:
    | "backoff"
    | "linear"
    | "fixed"
    | "fibonacci"
    | "immediate"
    | AsyncRetryDelayFn;
}
```

**Built-in delay strategies:**

| Strategy    | Formula              | Example delays (ms)    |
| ----------- | -------------------- | ---------------------- |
| `backoff`   | 1000 \* 2^attempt    | 1000, 2000, 4000, 8000 |
| `linear`    | 1000 \* attempt      | 1000, 2000, 3000, 4000 |
| `fixed`     | 1000                 | 1000, 1000, 1000, 1000 |
| `fibonacci` | 1000 \* fib(attempt) | 1000, 1000, 2000, 3000 |
| `immediate` | 0                    | 0, 0, 0, 0             |

### catchError()

Catch and handle errors with a callback (without swallowing them).

```ts
import { catchError } from "storion/async";

fn.use(
  catchError((error, ctx, ...args) => {
    console.error("Failed:", error.message);
    analytics.track("api_error", { error: error.message });
  })
);
```

### timeout()

Abort after specified milliseconds.

```ts
import { timeout } from "storion/async";

// Abort after 5 seconds
fn.use(timeout(5000));

// With custom error message
fn.use(timeout(5000, "Request timed out"));
```

### logging()

Log function calls for debugging.

```ts
import { logging } from "storion/async";

fn.use(logging("getUser"));
// Logs: [getUser] calling with: ["123"]
// Logs: [getUser] success: { id: "123", name: "John" }
// Or:   [getUser] error: Error: Not found

// Custom logger
fn.use(logging("getUser", customLogger));
```

### debounce()

Only execute after delay with no new calls.

```ts
import { debounce } from "storion/async";

const debouncedSearch = search.use(debounce(300));
```

### throttle()

Only execute once per time window.

```ts
import { throttle } from "storion/async";

const throttledSave = save.use(throttle(1000));
```

### fallback()

Return a fallback value on error instead of throwing.

```ts
import { fallback } from "storion/async";

// Return null on error
fn.use(fallback(null));

// Return empty array on error
fn.use(fallback([]));

// Dynamic fallback based on error
fn.use(fallback((error, ctx, ...args) => ({ error: error.message })));
```

::: tip
Aborted operations (via `ctx.signal`) are **not** caught by fallback - cancellation errors are always propagated.
:::

### cache()

Cache results with TTL. Results are cached by serialized arguments.

```ts
import { cache } from "storion/async";

// Cache for 5 minutes
fn.use(cache(5 * 60 * 1000));

// Cache with custom key function
fn.use(cache({ ttl: 60000, key: (user) => user.id }));
```

**Cache Options:**

```ts
interface CacheOptions {
  /** Time-to-live in milliseconds */
  ttl: number;
  /** Custom key function (default: JSON.stringify of args) */
  key?: (...args: any[]) => string;
}
```

::: warning Shared State
Cache is shared across all calls to the same cached function. Multiple components using the same cached function will share the same cache.
:::

### rateLimit()

Rate limit calls - queue excess calls beyond the limit.

```ts
import { rateLimit } from "storion/async";

// Max 10 calls per second
fn.use(rateLimit({ limit: 10, window: 1000 }));

// Max 100 calls per minute
fn.use(rateLimit({ limit: 100, window: 60000 }));
```

**Rate Limit Options:**

```ts
interface RateLimitOptions {
  /** Maximum number of calls allowed in the window */
  limit: number;
  /** Time window in milliseconds */
  window: number;
}
```

Requests that exceed the limit are **queued** and executed when slots become available. Queued requests respect abort signals - if aborted while waiting, they're removed from the queue.

### circuitBreaker()

Fail fast after repeated errors to prevent cascading failures.

```ts
import { circuitBreaker } from "storion/async";

// Open after 5 failures, try again after 30s (defaults)
fn.use(circuitBreaker());

// Custom threshold and reset timeout
fn.use(circuitBreaker({ threshold: 3, resetTimeout: 10000 }));
```

**Circuit Breaker Options:**

```ts
interface CircuitBreakerOptions {
  /** Number of failures before opening circuit (default: 5) */
  threshold?: number;
  /** Time in ms before attempting to close circuit (default: 30000) */
  resetTimeout?: number;
}
```

**Circuit States:**

| State       | Behavior                                     |
| ----------- | -------------------------------------------- |
| `closed`    | Normal operation, requests pass through      |
| `open`      | Circuit tripped, requests fail immediately   |
| `half-open` | Testing recovery, allows one request through |

**State Transitions:**

```
closed → (failures >= threshold) → open
open → (resetTimeout elapsed) → half-open
half-open → (success) → closed
half-open → (failure) → open
```

::: tip
Aborted operations (via `ctx.signal`) are **not** counted as failures.
:::

### map()

Create a simplified wrapper for argument/result transformations. Unlike regular wrappers, `map()` hides the `ctx` parameter, providing a simple `next(...args)` function.

```ts
import { map } from "storion/async";

// Transform return type: User → string
const getUserName = getUser.use(
  map(async (next, id: string) => {
    const user = await next(id);
    return user.name;
  })
);

// Change argument signature
const getUserByEmail = getUser.use(
  map(async (next, email: string) => {
    const id = await lookupUserId(email);
    return next(id);
  })
);

// Combine multiple calls
const getUserWithPosts = getUser.use(
  map(async (next, id: string) => {
    const [user, posts] = await Promise.all([next(id), fetchPosts(id)]);
    return { ...user, posts };
  })
);
```

::: warning
`map()` does not expose `ctx.signal`. If you need cancellation support inside the wrapper, use a regular wrapper instead.
:::

### Custom Wrappers

Create your own wrappers using the `AbortableWrapper` type:

```ts
import type { AbortableWrapper, AbortableContext } from "storion/async";

// Custom wrapper that adds authentication header
function withAuth<TArgs extends any[], TResult>(
  getToken: () => string
): AbortableWrapper<TArgs, TResult> {
  return (next) =>
    async (ctx, ...args) => {
      // Modify context or args before calling next
      const token = getToken();
      // ... use token somehow
      return next(ctx, ...args);
    };
}

// Use it
const authFn = fn.use(withAuth(() => localStorage.getItem("token")!));
```

### Wrapper Execution Order

Wrappers are applied in reverse order (last `.use()` runs first):

```ts
fn.use(wrapperA).use(wrapperB);
// Execution: wrapperB → wrapperA → fn
```

This allows outer wrappers to catch errors from inner wrappers:

```ts
fn.use(retry(3)).use(logging("fn")); // logging sees retry errors
fn.use(logging("fn")).use(retry(3)); // logging sees final success/error
```

## AsyncContext

The context object passed to async handler functions (store-bound mode).

### signal

`AbortSignal` for cancellation. When `autoCancel: true` (default), automatically aborted when:

- A new request starts (previous request is cancelled)
- The store is disposed (cleanup registered via `focus.context.onDispose`)

```ts
async(focus("user"), async (ctx, userId: string) => {
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
async(focus("data"), async (ctx) => {
  // If cancelled, these promises will never resolve
  const data1 = await ctx.safe(fetch("/api/1").then((r) => r.json()));
  const data2 = await ctx.safe(fetch("/api/2").then((r) => r.json()));

  return { data1, data2 };
});
```

#### safe(fn, ...args)

Call a function with arguments. If the result is a promise, wrap it.

```ts
async(focus("data"), async (ctx) => {
  // Call function with args, wrap result if promise
  const result = await ctx.safe(fetchUser, userId);

  // Works with sync functions too
  const computed = ctx.safe(processData, rawData);

  return result;
});
```

#### safe(Abortable, ...args)

Call an [abortable function](#abortable) with the context's signal automatically injected.

```ts
import { abortable } from "storion/async";

// Define abortable function
const fetchUser = abortable(async ({ signal }, id: string) => {
  const res = await fetch(`/api/users/${id}`, { signal });
  return res.json();
});

// In async handler - signal is auto-injected
async(focus("user"), async (ctx, id: string) => {
  const user = await ctx.safe(fetchUser, id);
  return user;
});
```

### cancel()

Manually cancel the current async operation. Useful for implementing custom timeouts.

```ts
async(focus("data"), async (ctx) => {
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
const checkoutMutation = async(async (ctx, paymentMethod: string) => {
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
const submitOrder = async(async (ctx, order: Order) => {
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

## abortable()

Create a function that receives an `AbortableContext` with `signal` and `safe` utilities.

### Signature

```ts
function abortable<TArgs extends any[], TResult>(
  fn: (ctx: AbortableContext, ...args: TArgs) => Promise<TResult>
): Abortable<TArgs, TResult>;

interface AbortableContext {
  /** AbortSignal for cancellation */
  signal: AbortSignal;
  /** Safe execution utility (same as AsyncContext.safe) */
  safe: SafeFn;
}

interface Abortable<TArgs, TResult> {
  /** Call without signal (creates new AbortController) */
  (...args: TArgs): Promise<TResult>;

  /** Call with explicit signal */
  with(signal: AbortSignal | undefined, ...args: TArgs): Promise<TResult>;

  /** Apply wrapper, returns new Abortable */
  use<TNewArgs, TNewResult>(
    wrapper: (next: Handler) => Handler
  ): Abortable<TNewArgs, TNewResult>;
}
```

### Usage

```ts
import { abortable } from "storion/async";

// Define abortable service methods
const userService = {
  getUser: abortable(async ({ signal }, id: string) => {
    const res = await fetch(`/api/users/${id}`, { signal });
    return res.json();
  }),

  createUser: abortable(async ({ signal }, data: CreateUserDto) => {
    const res = await fetch("/api/users", {
      method: "POST",
      body: JSON.stringify(data),
      signal,
    });
    return res.json();
  }),
};
```

### Four Ways to Use

```ts
// 1. Direct call (creates new AbortController)
const user = await userService.getUser("123");

// 2. With explicit signal
const controller = new AbortController();
const user = await userService.getUser.with(controller.signal, "123");

// 3. Pass directly to async() - signal auto-injected
const userQuery = async(focus("user"), userService.getUser);

// 4. Via ctx.safe() in async handler
const userQuery = async(focus("user"), (ctx, id: string) =>
  ctx.safe(userService.getUser, id)
);
```

### Chainable Wrappers with use()

Apply wrappers that preserve the `Abortable` interface:

```ts
// Define reusable wrapper
const withRetry =
  <TArgs extends any[], TResult>(count = 3) =>
  (next: (ctx: AbortableContext, ...args: TArgs) => Promise<TResult>) =>
  async (ctx: AbortableContext, ...args: TArgs): Promise<TResult> => {
    let lastError: Error;
    for (let i = 0; i < count; i++) {
      try {
        return await next(ctx, ...args);
      } catch (e) {
        lastError = e as Error;
        if (ctx.signal.aborted) throw e;
      }
    }
    throw lastError!;
  };

// Apply wrapper
const getUserWithRetry = userService.getUser.use(withRetry(3));

// Chain multiple wrappers
const getUser = userService.getUser
  .use(withRetry(3))
  .use(withLogging("getUser"));

// Still has Abortable interface
await getUser("123");
await getUser.with(controller.signal, "123");
```

### Nested Abortable Calls

Use `ctx.safe` to call other abortable functions:

```ts
const getUserWithPosts = abortable(async ({ signal, safe }, userId: string) => {
  // safe() auto-injects signal to abortable functions
  const user = await safe(userService.getUser, userId);
  const posts = await safe(postService.getPosts, userId);

  return { user, posts };
});
```

### With async() Directly

The cleanest pattern - pass `Abortable` directly to `async()`:

```ts
const userStore = store({
  name: "user",
  state: { user: async.fresh<User>() },
  setup({ focus }) {
    // Abortable passed directly - signal auto-injected
    const userQuery = async(focus("user"), userService.getUser);

    return {
      fetchUser: userQuery.dispatch,
    };
  },
});
```

### Type Checking

Use `isAbortable()` to check if a function is abortable:

```ts
import { isAbortable } from "storion/async";

if (isAbortable(fn)) {
  fn.with(signal, ...args);
} else {
  fn(...args);
}
```

## Component-Local Async (Mixin Pattern)

The mixin overload creates **component-local async state** using `scoped()` internally. Perfect for:

- Form submissions
- Mutations (create, update, delete)
- One-off API calls
- Any async operation that doesn't need global state

### Form Submission

```ts
import { async } from "storion/async";

// Use *Mutation for write operations
const submitFormMutation = async(async (ctx, data: FormData) => {
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
const deleteItemMutation = async(async (ctx, itemId: string) => {
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
const checkoutMutation = async(async (ctx, paymentMethod: string) => {
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

### Mixin vs Store-bound

| Use Case                      | Approach                   |
| ----------------------------- | -------------------------- |
| Shared data (users, products) | Store-bound with `focus()` |
| Form submission               | Mixin (component-local)    |
| Delete/Update mutation        | Mixin (component-local)    |
| Paginated lists               | Store-bound with `focus()` |
| Search with cache             | Store-bound with `focus()` |
| One-off API call              | Mixin (component-local)    |

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
const userQuery = async(focus("user"), async (ctx, userId: string) => {
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
const dashboardQuery = async(focus("dashboard"), async (ctx) => {
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
const deleteItemMutation = async(async (ctx, id: string) => {
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
    const itemsQuery = async(focus("items"), () => api.getItems());
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
import { networkService } from "storion/network";

const dataQuery = async(focus("data"), fetchData, {
  // Automatically waits for reconnection on network errors
  // Uses backoff strategy for other errors
  retry: networkRetry.delay("backoff"),
});
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

- [trigger()](/api/trigger) - Triggering async actions
- [scoped()](/api/use-store#component-local-stores-with-scoped) - Component-local stores
- [Async Guide](/guide/async) - Deep dive into async patterns
- [Network Module](/api/network) - Network connectivity and retry
