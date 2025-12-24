# abortable()

Create async functions with full lifecycle control: cancellation, pause/resume, external events, and composable wrappers.

## Why abortable()?

You can handle cancellation without `abortable()`, but you need to manually pass the signal through every async call:

```ts
// ❌ Without abortable - manual signal threading
async function getUserWithPosts(signal: AbortSignal, userId: string) {
  // Must pass signal to EVERY async call
  const userRes = await fetch(`/api/users/${userId}`, { signal });
  const user = await userRes.json();

  const postsRes = await fetch(`/api/posts?userId=${userId}`, { signal });
  const posts = await postsRes.json();

  // If you call another function, it needs signal too
  const enriched = await enrichUser(signal, user);

  return { user: enriched, posts };
}

// Every helper function needs signal parameter
async function enrichUser(signal: AbortSignal, user: User) {
  const prefsRes = await fetch(`/api/preferences/${user.id}`, { signal });
  return { ...user, preferences: await prefsRes.json() };
}

// Calling requires creating AbortController
const controller = new AbortController();
const result = await getUserWithPosts(controller.signal, "123");
```

With `abortable()`, the signal is managed automatically:

```ts
// ✅ With abortable - automatic signal management
const getUserWithPosts = abortable(async ({ signal, safe }, userId: string) => {
  // signal is provided automatically
  const userRes = await fetch(`/api/users/${userId}`, { signal });
  const user = await userRes.json();

  const postsRes = await fetch(`/api/posts?userId=${userId}`, { signal });
  const posts = await postsRes.json();

  // safe() auto-injects signal to other abortable functions
  const enriched = await safe(enrichUser, user);

  return { user: enriched, posts };
});

const enrichUser = abortable(async ({ signal }, user: User) => {
  const prefsRes = await fetch(`/api/preferences/${user.id}`, { signal });
  return { ...user, preferences: await prefsRes.json() };
});

// Direct call - AbortController created automatically
const result = await getUserWithPosts("123");

// Or pass to async.action() for automatic cancellation on re-fetch
const userQuery = async.action(focus("user"), getUserWithPosts);
```

## Overview

`abortable()` wraps async functions to provide:

- **Automatic `AbortSignal`** - Each call gets a cancellation signal
- **Chainable wrappers** - Compose retry, timeout, caching, and more with `.use()`
- **Integration with `async.action()`** - Pass directly to store-bound async state
- **Type safety** - Full TypeScript inference through wrapper chains

## Signature

```ts
function abortable<
  TArgs extends any[],
  TResult,
  TYield extends void | object = void
>(
  fn: (ctx: AbortableContext<TYield>, ...args: TArgs) => Promise<TResult>
): Abortable<TArgs, TResult, TYield>;

interface AbortableContext<TYield extends void | object = void> {
  /** AbortSignal for cancellation */
  signal: AbortSignal;
  /** Safe execution utility */
  safe: SafeFn;
  /** Wait for external event */
  take: AbortableTake<TYield>;
  /** Check if aborted */
  aborted(): boolean;
  /** Abort from inside */
  abort(): boolean;
  /** Manual pause point */
  checkpoint(): Promise<void>;
}

interface AbortableResult<TResult, TYield> extends Promise<TResult> {
  /** Send event to the function */
  send: AbortableSend<TYield>;
  /** Control methods */
  pause(): boolean;
  resume(): boolean;
  abort(): boolean;
  /** Status checks */
  status(): "running" | "success" | "error" | "paused" | "waiting" | "aborted";
  running(): boolean;
  waiting(): boolean;
  paused(): boolean;
  succeeded(): boolean;
  failed(): boolean;
  aborted(): boolean;
  completed(): boolean;
  /** Result accessors */
  result(): Awaited<TResult> | undefined;
  error(): Error | undefined;
}

interface Abortable<TArgs, TResult, TYield> {
  /** Call without signal (creates new AbortController) */
  (...args: TArgs): AbortableResult<TResult, TYield>;

  /** Call with parent signal (parent abort → this aborts) */
  withSignal(
    signal: AbortSignal | undefined,
    ...args: TArgs
  ): AbortableResult<TResult, TYield>;

  /** Apply wrapper, returns new Abortable */
  use<TNewArgs, TNewResult>(
    wrapper: AbortableWrapper
  ): Abortable<TNewArgs, TNewResult, TYield>;

  /** Type assertion for return type */
  as<T>(): Abortable<TArgs, T, TYield>;
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
const result = userService.getUser("123");
const user = await result;

// 2. With parent signal (parent abort → this aborts)
const controller = new AbortController();
const result = userService.getUser.withSignal(controller.signal, "123");

// 3. Pass directly to async.action() - signal auto-injected
const userQuery = async.action(focus("user"), userService.getUser);

// 4. Via ctx.safe() in async handler
const userQuery = async.action(focus("user"), (ctx, id: string) =>
  ctx.safe(userService.getUser, id)
);
```

## Lifecycle Control

Every call returns an `AbortableResult` with control methods:

```ts
const result = userService.getUser("123");

// Status checks
result.status(); // "running" | "success" | "error" | "paused" | "waiting" | "aborted"
result.running(); // boolean
result.waiting(); // boolean (waiting for event or async op)
result.paused(); // boolean
result.succeeded(); // boolean
result.failed(); // boolean
result.aborted(); // boolean
result.completed(); // boolean (success | error | aborted)

// Control
result.pause(); // Pause at next checkpoint (returns false if already paused)
result.resume(); // Resume execution (returns false if not paused)
result.abort(); // Abort execution (returns false if already completed)

// Result access
result.result(); // Get result if succeeded, undefined otherwise
result.error(); // Get error if failed, undefined otherwise
```

### Pause/Resume Behavior

Pause is automatically checked at three points:

| Method         | Pause Check            |
| -------------- | ---------------------- |
| `checkpoint()` | Explicit pause point   |
| `safe()`       | After promise resolves |
| `take()`       | After event arrives    |

This means any `await safe(...)` or `await take(...)` call is a potential pause point:

```ts
const processFiles = abortable(async (ctx, files: File[]) => {
  for (const file of files) {
    // safe() checks pause AFTER the upload completes
    await ctx.safe(uploadFile, file);
  }
  return "done";
});

const result = processFiles(files);

// Pause - will take effect after current upload finishes
result.pause();

// Resume later
result.resume();
await result;
```

Use `checkpoint()` when you need an explicit pause point without an async operation:

```ts
const compute = abortable(async (ctx, items: Item[]) => {
  for (const item of items) {
    processSync(item); // Synchronous work
    await ctx.checkpoint(); // Allow pause between sync operations
  }
  return "done";
});
```

## External Events (take/send)

Use the `TYield` type parameter to define events that can be sent to the function:

```ts
// Define event types
type CheckoutEvents = {
  paymentMethod: PaymentMethod;
  confirm: boolean;
};

const checkout = abortable<[Cart], Receipt, CheckoutEvents>(
  async ({ signal, safe, take }, cart) => {
    // Validate cart
    await safe(validateCart, cart);

    // Wait for payment method selection
    const payment = await take("paymentMethod");

    // Wait for confirmation
    const confirmed = await take("confirm");
    if (!confirmed) throw new Error("Cancelled by user");

    // Process payment
    return await safe(processPayment, cart, payment);
  }
);

// Usage
const result = checkout(cart);

// Send events from UI
onPaymentSelected((method) => result.send("paymentMethod", method));
onConfirmClicked(() => result.send("confirm", true));

const receipt = await result;
```

### Checkpoint Pattern (void events)

When `TYield` is `void`, `take()` acts as a checkpoint that waits for `send()`:

```ts
const wizard = abortable(async (ctx) => {
  // Step 1
  doStep1();
  await ctx.take(); // Wait for send()

  // Step 2
  doStep2();
  await ctx.take(); // Wait for send()

  // Step 3
  doStep3();
  return "completed";
});

const result = wizard();

// Allow step 1 to execute and reach take()
await new Promise((r) => setTimeout(r, 10));
result.send(); // Complete step 1

// Allow step 2 to execute and reach take()
await new Promise((r) => setTimeout(r, 10));
result.send(); // Complete step 2

await result; // "completed"
```

::: tip
`send()` only resolves if there's a pending `take()` waiting. If called before execution reaches `take()`, the send is a no-op.
:::

## Signal Relationship

When using `withSignal(parentSignal)`:

- **Parent abort → This aborts**: If the parent signal aborts, this abortable aborts too
- **This abort → Parent unaffected**: Aborting this abortable does NOT abort the parent

```ts
const parent = new AbortController();
const result = myFn.withSignal(parent.signal, args);

// Parent abort propagates to child
parent.abort();
result.aborted(); // true

// But child abort doesn't affect parent
const result2 = myFn.withSignal(parent.signal, args);
result2.abort();
parent.signal.aborted; // false (parent unaffected)
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

## Using Promise.all/Promise.race with safe()

Use `ctx.safe()` to wrap `Promise.all()` or `Promise.race()` - it respects abort signal and allows pausing:

```ts
const myFn = abortable(async ({ signal, safe }) => {
  // Parallel fetching with abort support
  const [user, posts] = await safe(
    Promise.all([fetchUser(signal), fetchPosts(signal)])
  );

  // Racing with abort support
  const result = await safe(
    Promise.race([fetchData(signal), timeout(5000, signal)])
  );

  return { user, posts, result };
});
```

## With async.action() Directly

The cleanest pattern - pass `Abortable` directly to `async.action()`:

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
  fn.withSignal(signal, ...args);
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
  circuitBreaker,
  cache,
  fallback,
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
| `map()`            | Transform args/result                  |

## Wrapper Execution Order

::: warning Order Matters
The order in which you chain wrappers significantly affects behavior. Wrappers execute in **reverse order** — the last `.use()` runs first, wrapping the previous ones.
:::

```ts
fn.use(wrapperA).use(wrapperB);
// Execution order: wrapperB → wrapperA → fn
// wrapperB is the outermost, fn is the innermost
```

### Why Order Matters

Think of wrappers as layers around your function. The outer layer handles things first:

```
┌─────────────────────────────────────────┐
│  wrapperB (outermost - runs first)      │
│  ┌───────────────────────────────────┐  │
│  │  wrapperA                         │  │
│  │  ┌─────────────────────────────┐  │  │
│  │  │  fn (your function)         │  │  │
│  │  └─────────────────────────────┘  │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

### Practical Examples

**Retry + Timeout:**

```ts
// ✅ CORRECT: timeout applies to each retry attempt
fn.use(retry(3)).use(timeout(5000));
// Each attempt has 5s to complete, 3 attempts total

// ❌ WRONG: timeout applies to all retries combined
fn.use(timeout(5000)).use(retry(3));
// All 3 attempts must complete within 5s total
```

**Retry + Logging:**

```ts
// Log every attempt (including retries)
fn.use(logging("api")).use(retry(3));
// Logs: attempt 1, attempt 2 (if retry), attempt 3 (if retry)

// Log only final result
fn.use(retry(3)).use(logging("api"));
// Logs: only the final success or failure after all retries
```

**Retry + Network Awareness:**

```ts
// ✅ RECOMMENDED: retry → offlineRetry (offlineRetry is outer)
fn.use(retry(3)).use(network.offlineRetry());
```

Why this order?

1. `fn` executes, fails
2. `retry` catches error, retries up to 3 times (handles transient server errors)
3. If ALL retries exhausted AND final error is network + offline:
   - `offlineRetry` waits for reconnection
   - Retries once after network returns

This is **simple and predictable**: quick retries for transient errors, then one final chance after network returns.

```ts
// ❌ AVOID: offlineRetry → retry (retry is outer)
fn.use(network.offlineRetry()).use(retry(3));
```

Why avoid?

1. `fn` executes, fails
2. `offlineRetry` checks: network error + offline? Wait for network, retry
3. `retry` sees result, may trigger 3 more attempts
4. EACH attempt could trigger another network wait!

This creates **unpredictable timing**: if network is flaky, you could wait multiple times (once per retry attempt that fails while offline).

**Cache + Retry:**

```ts
// ✅ CORRECT: cache the successful result
fn.use(retry(3)).use(cache(60000));
// Retries happen, then successful result is cached

// ❌ WRONG: cache may store failed attempts
fn.use(cache(60000)).use(retry(3));
// Cache happens first, may interfere with retry logic
```

### Common Patterns

| Pattern             | Order                  | Reason                                   |
| ------------------- | ---------------------- | ---------------------------------------- |
| Timeout per attempt | `retry → timeout`      | Each retry gets fresh timeout            |
| Global timeout      | `timeout → retry`      | All retries must fit in timeout          |
| Log final result    | `retry → logging`      | See only final outcome                   |
| Log all attempts    | `logging → retry`      | Debug each try                           |
| Offline resilience  | `retry → offlineRetry` | Handle both transient and network errors |

## retry()

Retry on failure with configurable retries and delay strategy.

```ts
import { retry } from "storion/async";

// Retry 3 times with default backoff
fn.use(retry(3));

// Use named strategy
fn.use(retry("linear"));
fn.use(retry("backoff"));

// Retry 5 times with linear delay
fn.use(retry({ retries: 5, delay: "linear" }));

// Custom delay function
fn.use(retry({ retries: 3, delay: (attempt) => attempt * 1000 }));

// Wait for condition (Promise<void>)
fn.use(retry({ retries: 10, delay: () => waitForOnline() }));
```

**Retry Options:**

```ts
interface RetryOptions {
  /** Number of retry attempts (default: 3) */
  retries?: number;
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

Transform arguments or results with a simplified wrapper that hides `ctx`:

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

## Solution: `.as<T>()`

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

- [async](/api/async) - Async state management (`async.action()` and `async.mixin()`)
- [Network Layer Guide](/guide/network-layer) - Building resilient network services
- [Network Module](/api/network) - Network connectivity and offline retry
