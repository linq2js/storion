# effect()

Creates a reactive effect that automatically tracks dependencies and re-runs when they change.

## Signature

```ts
function effect(
  callback: (ctx: EffectContext) => void | (() => void),
  options?: EffectOptions
): () => void
```

## Parameters

### callback

The effect function that runs reactively. Must be **synchronous**.

- Receives an `EffectContext` for handling async operations safely
- Can return a cleanup function

### options

Optional configuration.

```ts
interface EffectOptions {
  /** Error handling strategy */
  onError?: EffectErrorStrategy;
}

type EffectErrorStrategy =
  | "failFast"    // Stop effect, incomplete deps
  | "keepAlive"   // Keep last dependencies (default)
  | EffectRetryConfig
  | ((ctx: EffectErrorContext) => void);

interface EffectRetryConfig {
  /** Number of retry attempts */
  count: number;
  /** Delay: ms, strategy name, or custom function (default: "backoff") */
  delay?: number | "backoff" | "linear" | "fixed" | "fibonacci" | "immediate"
        | ((attempt: number) => number);
}
```

## Effect Context

```ts
interface EffectContext {
  /** Run number (1-indexed), increments each time effect runs */
  readonly nth: number;

  /** AbortSignal that is aborted when effect is cleaned up */
  readonly signal: AbortSignal;

  /** Register cleanup function (LIFO order) */
  onCleanup(listener: VoidFunction): VoidFunction;

  /** Wrap promise to never resolve if stale */
  safe<T>(promise: Promise<T>): Promise<T>;

  /** Call function with args, wrap result if promise */
  safe<TArgs extends any[], TResult>(
    fn: (...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult extends Promise<infer U> ? Promise<U> : TResult;

  /** Manually trigger re-run */
  refresh(): void;
}
```

## Basic Example

```ts
import { effect } from 'storion';

const instance = container.get(userStore);

// Effect tracks state.name automatically
const dispose = effect(() => {
  console.log('User name changed:', instance.state.name);
});

// Later: stop the effect
dispose();
```

## Cleanup Function

Use `ctx.onCleanup()` to register cleanup logic:

```ts
effect((ctx) => {
  const handler = () => console.log('clicked');
  document.addEventListener('click', handler);
  
  // Cleanup runs before re-execution and on dispose
  ctx.onCleanup(() => {
    document.removeEventListener('click', handler);
  });
});
```

**Note:** Do NOT return a cleanup function (unlike React's `useEffect`):

```ts
// ❌ WRONG - returning cleanup function
effect(() => {
  const handler = () => {};
  document.addEventListener('click', handler);
  return () => document.removeEventListener('click', handler);
});

// ✅ CORRECT - use ctx.onCleanup()
effect((ctx) => {
  const handler = () => {};
  document.addEventListener('click', handler);
  ctx.onCleanup(() => document.removeEventListener('click', handler));
});
```

## Async Operations

Effects must be synchronous, but you can safely handle async operations:

```ts
// ❌ WRONG - async effects are not allowed
effect(async () => {
  const data = await fetchData();
  state.data = data;
});

// ✅ CORRECT - use ctx.safe() for async
effect((ctx) => {
  ctx.safe(fetchData()).then(data => {
    if (data !== undefined) {
      state.data = data;
    }
  });
});
```

The `ctx.safe()` wrapper ensures:
- Promise is cancelled if effect re-runs
- Returns `undefined` if cancelled
- Prevents stale updates

## Conditional Effects

```ts
effect(() => {
  // Only tracks state.user when state.isLoggedIn is true
  if (state.isLoggedIn) {
    console.log('Logged in as:', state.user.name);
  }
});
```

## Multiple Dependencies

```ts
effect(() => {
  // Tracks both firstName and lastName
  const fullName = `${state.firstName} ${state.lastName}`;
  document.title = fullName;
});
```

## Error Handling

```ts
// Retry 3 times with default backoff strategy
effect(
  () => {
    if (state.shouldFail) throw new Error("Failed");
  },
  { onError: { count: 3 } }
);

// Retry with named strategy
effect(fn, { onError: { count: 5, delay: "linear" } });

// Retry with fixed delay
effect(fn, { onError: { count: 3, delay: 1000 } });

// Custom error handler
effect(fn, {
  onError: ({ error, retry, retryCount }) => {
    if (retryCount < 3) retry();
    else console.error(error);
  },
});

// Ignore errors
effect(fn, { onError: "failFast" });
```

## See Also

- [Reactivity Guide](/guide/reactivity) - How reactivity works
- [Effects Guide](/guide/effects) - Deep dive into effects

