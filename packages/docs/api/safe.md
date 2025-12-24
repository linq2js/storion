# safe

Safe execution utilities for handling cancellation-aware async operations.

## Overview

The `safe` function wraps async operations to respect cancellation/staleness. When the context is cancelled (e.g., effect disposed, component unmounted), wrapped promises never resolve or reject—they simply stay pending, preventing stale updates.

Additionally, `safe` provides utility methods for concurrent operations: `safe.all`, `safe.race`, `safe.settled`, and `safe.any`.

## Import

```ts
import { createSafe, toPromise, isPromiseLike } from "storion/async";
```

::: tip
You typically don't need to import these directly—`safe` is available via `ctx.safe` in effects and async handlers.
:::

---

## createSafe()

Creates a safe function with cancellation awareness.

### Signature

```ts
function createSafe(
  getSignal: () => AbortSignal | undefined,
  isCancelled: () => boolean
): SafeFnWithUtils;
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `getSignal` | `() => AbortSignal \| undefined` | Returns the current AbortSignal |
| `isCancelled` | `() => boolean` | Returns true if context is cancelled |

### Returns

`SafeFnWithUtils` — A safe function with utility methods.

---

## safe()

The base safe function wraps promises and functions to respect cancellation.

### Overloads

```ts
// Wrap a promise
safe<T>(promise: PromiseLike<T>): Promise<T>;

// Call function with args, wrap result if promise
safe<TArgs, TResult>(
  fn: (...args: TArgs) => TResult,
  ...args: TArgs
): TResult extends PromiseLike<infer U> ? Promise<U> : TResult;

// Call abortable function with signal
safe<TArgs, TResult>(
  fn: Abortable<TArgs, TResult>,
  ...args: TArgs
): TResult extends PromiseLike<infer U> ? Promise<U> : TResult;
```

### Examples

```ts
effect((ctx) => {
  // Wrap promise - never resolves if effect becomes stale
  ctx.safe(fetchData()).then((data) => {
    state.data = data; // Only runs if effect still active
  });

  // Call function with args
  ctx.safe(processData, arg1, arg2);

  // Call abortable with auto-injected signal
  ctx.safe(userService.getUser, userId).then((user) => {
    state.user = user;
  });
});
```

---

## safe.all()

Wait for all inputs to complete. Like `Promise.all` but cancellation-aware.

### Signature

```ts
// Array syntax
safe.all<T extends SafeInput[]>(inputs: [...T]): Promise<Results>;

// Object syntax
safe.all<T extends Record<string, SafeInput>>(inputs: T): Promise<{ [K in keyof T]: Result }>;
```

### Input Types

`SafeInput<T>` accepts:
- **Values**: `T` (sync values like numbers, strings)
- **Promises**: `Promise<T>` or `PromiseLike<T>`
- **Functions**: `() => T` or `() => Promise<T>` (parameterless, will be invoked)

### Examples

#### Array Syntax

```ts
const [user, posts, settings] = await safe.all([
  fetchUser(userId),              // Promise
  () => fetchPosts(userId),       // Function (invoked)
  { theme: "dark" },              // Sync value
]);
```

#### Object Syntax

```ts
const { user, posts, config } = await safe.all({
  user: fetchUser(userId),
  posts: () => fetchPosts(userId),
  config: loadConfig(),
});
```

#### Mixed Inputs

```ts
const result = await safe.all({
  // Sync value
  version: "1.0.0",
  
  // Promise
  user: fetchUser(),
  
  // Function returning sync value
  timestamp: () => Date.now(),
  
  // Function returning Promise
  posts: () => fetchPosts(),
  
  // Thenable
  legacy: legacyThenable,
});
```

### Cancellation Behavior

If cancelled before or during execution, the promise never resolves:

```ts
effect((ctx) => {
  ctx.safe.all([fetchA(), fetchB()]).then((results) => {
    // Never runs if effect is disposed before completion
    state.results = results;
  });
});
```

---

## safe.race()

Race inputs, return the first to resolve. Like `Promise.race` but cancellation-aware.

### Signature

```ts
// Array syntax - returns winning value
safe.race<T extends SafeInput[]>(inputs: [...T]): Promise<Value>;

// Object syntax - returns [winnerKey, value] tuple
safe.race<T extends Record<string, SafeInput>>(inputs: T): Promise<[Key, Value]>;
```

### Examples

#### Array Syntax

```ts
// Returns the fastest result
const fastest = await safe.race([
  fetchFromCDN(url),
  fetchFromOrigin(url),
  fetchFromCache(url),
]);
```

#### Object Syntax

```ts
// Returns [key, value] tuple identifying the winner
const [winner, data] = await safe.race({
  cdn: fetchFromCDN(url),
  origin: fetchFromOrigin(url),
  cache: fetchFromCache(url),
});

console.log(`Winner: ${winner}`); // "cdn" | "origin" | "cache"
console.log(`Data:`, data);
```

#### Timeout Pattern

```ts
const result = await safe.race({
  data: fetchData(),
  timeout: () => new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Timeout")), 5000)
  ),
});
```

---

## safe.any()

Return the first successful result. Like `Promise.any` but cancellation-aware.

Ignores rejections until all fail. If all fail, throws `AggregateError`.

### Signature

```ts
// Array syntax - returns first success
safe.any<T extends SafeInput[]>(inputs: [...T]): Promise<Value>;

// Object syntax - returns [winnerKey, value] tuple
safe.any<T extends Record<string, SafeInput>>(inputs: T): Promise<[Key, Value]>;
```

### Examples

#### Array Syntax

```ts
// Returns first successful result, ignores failures
const data = await safe.any([
  fetchFromPrimary(),    // May fail
  fetchFromSecondary(),  // May fail
  fetchFromFallback(),   // May fail
]);
```

#### Object Syntax

```ts
const [source, data] = await safe.any({
  primary: fetchFromPrimary(),
  secondary: fetchFromSecondary(),
  fallback: fetchFromFallback(),
});

console.log(`Got data from: ${source}`);
```

#### Fallback Pattern

```ts
try {
  const user = await safe.any([
    cache.get(userId),
    api.fetchUser(userId),
    defaults.getUser(),
  ]);
} catch (error) {
  if (error instanceof AggregateError) {
    console.error("All sources failed:", error.errors);
  }
}
```

---

## safe.settled()

Wait for all inputs to settle (resolve or reject). Like `Promise.allSettled` but cancellation-aware.

### Signature

```ts
// Array syntax
safe.settled<T extends SafeInput[]>(inputs: [...T]): Promise<PromiseSettledResult[]>;

// Object syntax
safe.settled<T extends Record<string, SafeInput>>(
  inputs: T
): Promise<{ [K in keyof T]: PromiseSettledResult }>;
```

### Examples

#### Array Syntax

```ts
const results = await safe.settled([
  fetchUser(),
  fetchPosts(),
  fetchComments(),
]);

results.forEach((result, index) => {
  if (result.status === "fulfilled") {
    console.log(`Success ${index}:`, result.value);
  } else {
    console.error(`Failed ${index}:`, result.reason);
  }
});
```

#### Object Syntax

```ts
const { user, posts, comments } = await safe.settled({
  user: fetchUser(),
  posts: fetchPosts(),
  comments: fetchComments(),
});

if (user.status === "fulfilled") {
  state.user = user.value;
} else {
  state.userError = user.reason;
}

if (posts.status === "fulfilled") {
  state.posts = posts.value;
}
```

#### Partial Success Pattern

```ts
const results = await safe.settled({
  required: fetchRequiredData(),
  optional: fetchOptionalData(),
});

// Always have required data if it succeeded
if (results.required.status === "rejected") {
  throw results.required.reason;
}

const data = {
  ...results.required.value,
  // Include optional data only if available
  ...(results.optional.status === "fulfilled" 
    ? results.optional.value 
    : {}),
};
```

---

## safe.callback()

Wrap a callback function to only execute if not cancelled. If cancelled, the callback becomes a no-op.

### Signature

```ts
safe.callback<TArgs>(
  callback: (...args: TArgs) => void
): (...args: TArgs) => void;
```

### Examples

#### Event Handlers

```ts
effect((ctx) => {
  const handleClick = ctx.safe.callback((e: MouseEvent) => {
    state.lastClick = { x: e.clientX, y: e.clientY };
  });

  document.addEventListener("click", handleClick);
  ctx.onCleanup(() => document.removeEventListener("click", handleClick));
});
```

#### Callbacks in Async Operations

```ts
effect((ctx) => {
  const onProgress = ctx.safe.callback((progress: number) => {
    state.progress = progress;
  });

  const onComplete = ctx.safe.callback((result: Data) => {
    state.data = result;
  });

  startLongRunningTask({
    onProgress,
    onComplete,
  });
});
```

#### setTimeout/setInterval

```ts
effect((ctx) => {
  const tick = ctx.safe.callback(() => {
    state.counter++;
  });

  const id = setInterval(tick, 1000);
  ctx.onCleanup(() => clearInterval(id));
});
```

### Comparison with safe()

| Feature | `safe(fn, ...args)` | `safe.callback(fn)` |
|---------|---------------------|---------------------|
| Execution | Immediate | Returns wrapped function |
| Arguments | Passed at call time | Passed when wrapper is called |
| Use case | One-time call | Reusable callback |
| Async wrapping | Yes (wraps promises) | No (sync return) |

---

## Utility Functions

### isPromiseLike()

Check if a value is a PromiseLike (has a `.then` method).

```ts
function isPromiseLike(value: unknown): value is PromiseLike<unknown>;
```

#### Examples

```ts
isPromiseLike(Promise.resolve(1));     // true
isPromiseLike({ then: () => {} });     // true
isPromiseLike(42);                     // false
isPromiseLike({ then: "not fn" });     // false
```

### toPromise()

Convert a value or parameterless function to a Promise.

```ts
function toPromise<T>(value: T | (() => T)): Promise<Awaited<T>>;
```

#### Examples

```ts
await toPromise(42);                        // 42
await toPromise(Promise.resolve("hello"));  // "hello"
await toPromise(() => 42);                  // 42
await toPromise(() => fetchData());         // fetched data
await toPromise(customThenable);            // thenable result
```

#### Error Handling

```ts
// Sync function throw → rejected promise
await toPromise(() => { throw new Error("oops"); });
// Rejects with Error("oops")

// Async function rejection
await toPromise(() => Promise.reject(new Error("async error")));
// Rejects with Error("async error")
```

---

## Type Definitions

### SafeInput

```ts
/**
 * Input that safe utilities accept.
 * - T: sync value
 * - PromiseLike<T>: promise or thenable
 * - () => T: parameterless function (invoked)
 * - () => PromiseLike<T>: async function (invoked)
 */
type SafeInput<T> = T | (() => T);
```

### SafeInputResult

```ts
/**
 * Extract resolved type from SafeInput.
 */
type SafeInputResult<T> = T extends () => infer R
  ? Awaited<R>
  : Awaited<T>;
```

### SafeFnWithUtils

```ts
interface SafeFnWithUtils extends SafeFn {
  all: SafeAll;
  race: SafeRace;
  settled: SafeSettled;
  any: SafeAny;
  callback: SafeCallback;
}
```

### SafeCallback

```ts
interface SafeCallback {
  <TArgs extends any[]>(
    callback: (...args: TArgs) => void
  ): (...args: TArgs) => void;
}
```

---

## Comparison with Native Promise Methods

| Method | Native | safe.* | Difference |
|--------|--------|--------|------------|
| `all` | `Promise.all()` | `safe.all()` | Never resolves if cancelled; accepts functions |
| `race` | `Promise.race()` | `safe.race()` | Object syntax returns `[key, value]` tuple |
| `any` | `Promise.any()` | `safe.any()` | Object syntax returns `[key, value]` tuple |
| `allSettled` | `Promise.allSettled()` | `safe.settled()` | Object syntax preserves keys |
| — | — | `safe.callback()` | Wrap callbacks to be cancellation-aware |

---

## Best Practices

### Use in Effects

```ts
effect((ctx) => {
  // ✅ Good - uses ctx.safe for cancellation awareness
  ctx.safe.all([fetchA(), fetchB()]).then(([a, b]) => {
    state.data = { a, b };
  });

  // ❌ Bad - no cancellation handling
  Promise.all([fetchA(), fetchB()]).then(([a, b]) => {
    state.data = { a, b }; // May update stale state!
  });
});
```

### Use Functions for Lazy Evaluation

```ts
// ✅ Good - functions are only invoked when safe.all runs
const result = await safe.all({
  user: () => fetchUser(userId),
  posts: () => fetchPosts(userId),
});

// ⚠️ Note - promises start immediately when created
const result = await safe.all({
  user: fetchUser(userId),    // Already started!
  posts: fetchPosts(userId),  // Already started!
});
```

### Object Syntax for Debugging

```ts
// Object syntax makes debugging easier
const [winner, value] = await safe.race({
  api1: fetchFromApi1(),
  api2: fetchFromApi2(),
  cache: fetchFromCache(),
});

console.log(`Fastest source: ${winner}`); // More informative than array index
```

### Use callback for Event Handlers

```ts
effect((ctx) => {
  // ✅ Good - callback won't execute after effect is disposed
  const handleClick = ctx.safe.callback((e: MouseEvent) => {
    state.clicks++;
  });

  document.addEventListener("click", handleClick);
  ctx.onCleanup(() => document.removeEventListener("click", handleClick));
});
```

