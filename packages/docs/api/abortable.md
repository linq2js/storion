# abortable()

Create cancellable async functions with automatic signal management and composable wrappers.

## Overview

`abortable()` wraps async functions to provide:

- **Automatic `AbortSignal`** - Each call gets a cancellation signal
- **Chainable wrappers** - Compose retry, timeout, caching, and more with `.use()`
- **Integration with `async()`** - Pass directly to store-bound async state
- **Type safety** - Full TypeScript inference through wrapper chains

## Signature

```ts
function abortable<TArgs extends any[], TResult>(
  fn: (ctx: AbortableContext, ...args: TArgs) => Promise<TResult>
): Abortable<TArgs, TResult>;

interface AbortableContext {
  /** AbortSignal for cancellation */
  signal: AbortSignal;
  /** Safe execution utility */
  safe: SafeFn;
  /** Get store or service instance */
  get: ContainerContext["get"];
}

interface Abortable<TArgs, TResult> {
  /** Call without signal (creates new AbortController) */
  (...args: TArgs): Promise<TResult>;

  /** Call with explicit signal */
  with(signal: AbortSignal | undefined, ...args: TArgs): Promise<TResult>;

  /** Apply wrapper, returns new Abortable */
  use<TNewArgs, TNewResult>(
    wrapper: AbortableWrapper
  ): Abortable<TNewArgs, TNewResult>;

  /** Type assertion for return type */
  as<T>(): Abortable<TArgs, T>;
}
```

## Basic Usage

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

## Four Ways to Call

```ts
// 1. Direct call (creates new AbortController)
const user = await userService.getUser("123");

// 2. With explicit signal
const controller = new AbortController();
const user = await userService.getUser.with(controller.signal, "123");

// 3. Pass directly to async.action() - signal auto-injected
const userQuery = async.action(focus("user"), userService.getUser);

// 4. Via ctx.safe() in async handler
const userQuery = async.action(focus("user"), (ctx, id: string) =>
  ctx.safe(userService.getUser, id)
);
```

## Nested Abortable Calls

Use `ctx.safe` to call other abortable functions with shared cancellation:

```ts
const getUserWithPosts = abortable(async ({ signal, safe }, userId: string) => {
  // safe() auto-injects signal to abortable functions
  const user = await safe(userService.getUser, userId);
  const posts = await safe(postService.getPosts, userId);

  return { user, posts };
});
```

## With async() Directly

The cleanest pattern - pass `Abortable` directly to `async()`:

```ts
const userStore = store({
  name: "user",
  state: { user: async.fresh<User>() },
  setup({ focus }) {
    // Abortable passed directly - signal auto-injected
    const userQuery = async.action(focus("user"), userService.getUser);

    return {
      fetchUser: userQuery.dispatch,
    };
  },
});
```

## Type Checking

Use `isAbortable()` to check if a function is abortable:

```ts
import { isAbortable } from "storion/async";

if (isAbortable(fn)) {
  fn.with(signal, ...args);
} else {
  fn(...args);
}
```

---

# Wrappers

Built-in wrapper utilities for composing cross-cutting behavior. Use the `.use()` method to chain wrappers:

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

// Use with async.action()
const userQuery = async.action(focus("user"), robustGetUser);
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

## Wrapper Execution Order

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

## retry()

Retry on failure with configurable count and delay strategy.

```ts
import { retry } from "storion/async";

// Retry 3 times with default backoff
fn.use(retry(3));

// Use named strategy
fn.use(retry("linear"));
fn.use(retry("backoff"));

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

## timeout()

Abort after specified milliseconds.

```ts
import { timeout } from "storion/async";

// Abort after 5 seconds
fn.use(timeout(5000));

// With custom error message
fn.use(timeout(5000, "Request timed out"));
```

## catchError()

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

## logging()

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

## debounce()

Only execute after delay with no new calls.

```ts
import { debounce } from "storion/async";

const debouncedSearch = search.use(debounce(300));
```

## throttle()

Only execute once per time window.

```ts
import { throttle } from "storion/async";

const throttledSave = save.use(throttle(1000));
```

## fallback()

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

## cache()

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

## rateLimit()

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

## circuitBreaker()

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

## map()

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

## Custom Wrappers

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

---

# Type Safety

## TypeScript Limitation

TypeScript cannot infer generic types through wrapper chains. When you chain multiple `.use()` calls, the generic type parameter gets lost:

```ts
// ❌ TypeScript loses the generic - result is `unknown`
const getData = baseFetch.use(retry(3)).use(timeout(5000));
```

## Solution: .as<T>()

Use `.as<T>()` at the domain layer for explicit type assertions:

```ts
// ✅ Type assertion at domain layer
const getUser = rest.get
  .use(map((fetch, id: string) => fetch(`/users/${id}`)))
  .as<User>(); // Now returns Promise<User>
```

## Alternative: Type the `next` Function

For stronger compile-time safety, explicitly type the `next` function in `map()`:

```ts
type QueryFn<TVariables, TResult> = (
  document: unknown,
  variables?: TVariables
) => Promise<TResult>;

type SearchVariables = { keyword: string };
type SearchResult = { results: { id: string; name: string }[] };

const searchQuery = baseQuery.use(
  map(
    (
      // Explicitly type the next function
      query: QueryFn<SearchVariables, SearchResult>,
      variables: SearchVariables
    ) => query(SEARCH_DOCUMENT, variables)
  )
);

// ✅ Fully typed
const result = await searchQuery({ keyword: "test" });
```

**When to use each approach:**

| Approach                | Use Case                                         |
| ----------------------- | ------------------------------------------------ |
| `.as<T>()`              | Simple type assertion, most common case          |
| Typed `next` in `map()` | Need compile-time checks on inner function calls |

---

## See Also

- [async()](/api/async) - Store-bound async state management
- [Network Layer Guide](/guide/network-layer) - Building resilient network services
- [Network Module](/api/network) - Network connectivity and offline retry

