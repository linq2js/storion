# effect()

Creates a reactive effect that automatically tracks dependencies and re-runs when they change.

## Signature

```ts
function effect(
  callback: (ctx: EffectContext) => void,
  options?: EffectOptions
): VoidFunction;
```

## Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `callback` | `(ctx: EffectContext) => void` | The effect function. **Must be synchronous**. |
| `options` | `EffectOptions` | Optional configuration for error handling. |

## Returns

`VoidFunction` — A dispose function that stops the effect.

---

## EffectContext

The context object passed to the effect callback.

```ts
interface EffectContext {
  /** Run count (1-indexed), increments each time effect executes */
  readonly nth: number;

  /** AbortSignal aborted when effect is cleaned up or re-runs */
  readonly signal: AbortSignal;

  /** Register cleanup function (executed in LIFO order) */
  onCleanup(listener: VoidFunction): VoidFunction;

  /** Wrap promise - never resolves if effect becomes stale */
  safe<T>(promise: Promise<T>): Promise<T>;

  /** Call function with args, wrap result if promise */
  safe<TArgs extends any[], TResult>(
    fn: (...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult extends Promise<infer U> ? Promise<U> : TResult;

  /** Manually trigger re-run of this effect */
  refresh(): void;
}
```

### ctx.nth

The execution count, starting at 1:

```ts
effect((ctx) => {
  console.log(`Effect run #${ctx.nth}`);
  // First run: "Effect run #1"
  // After dependency change: "Effect run #2"
});
```

### ctx.signal

AbortSignal that's aborted when the effect is cleaned up:

```ts
effect((ctx) => {
  fetch('/api/data', { signal: ctx.signal })
    .then((res) => res.json())
    .then((data) => { state.data = data; })
    .catch((err) => {
      if (err.name !== 'AbortError') throw err;
    });
});
```

### ctx.onCleanup()

Register cleanup functions. Multiple calls are supported; they execute in reverse order (LIFO):

```ts
effect((ctx) => {
  const handler = () => console.log('clicked');
  document.addEventListener('click', handler);
  
  // Cleanup runs:
  // 1. Before effect re-executes (when deps change)
  // 2. When effect is disposed
  ctx.onCleanup(() => {
    document.removeEventListener('click', handler);
  });
});
```

### ctx.safe()

Wrap async operations to prevent stale updates:

```ts
effect((ctx) => {
  // If effect re-runs before this completes, promise never resolves
  ctx.safe(fetchData()).then((data) => {
    if (data !== undefined) {
      state.data = data;
    }
  });
});
```

**Overloads:**

```ts
// Wrap a promise
ctx.safe(promise)

// Call function with args, wrap if result is a promise
ctx.safe(fn, arg1, arg2)

// Call abortable function with auto-injected signal
ctx.safe(abortableFn, arg1)
```

### ctx.refresh()

Manually trigger the effect to re-run:

```ts
effect((ctx) => {
  console.log('Current value:', state.value);
  
  // Force refresh after 5 seconds
  const timer = setTimeout(() => ctx.refresh(), 5000);
  ctx.onCleanup(() => clearTimeout(timer));
});
```

---

## EffectOptions

```ts
interface EffectOptions {
  /** Error handling strategy */
  onError?: EffectErrorStrategy;
}
```

### Error Strategies

```ts
type EffectErrorStrategy =
  | 'failFast'           // Stop effect, incomplete deps
  | 'keepAlive'          // Keep last dependencies (default)
  | EffectRetryConfig    // Retry with configuration
  | ErrorHandler;        // Custom handler function

interface EffectRetryConfig {
  /** Number of retry attempts */
  count: number;
  
  /** Delay strategy or milliseconds */
  delay?: number 
       | 'backoff'    // Exponential backoff (default)
       | 'linear'     // Linear increase
       | 'fixed'      // Same delay each time
       | 'fibonacci'  // Fibonacci sequence
       | 'immediate'  // No delay
       | ((attempt: number) => number);  // Custom function
}

type ErrorHandler = (ctx: EffectErrorContext) => void;

interface EffectErrorContext {
  error: unknown;
  retry: () => void;
  retryCount: number;
}
```

---

## Basic Example

```ts
import { effect } from 'storion';

const instance = container.get(userStore);

// Effect automatically tracks state.name
const dispose = effect(() => {
  console.log('User name:', instance.state.name);
});

// Change name → effect re-runs
instance.actions.setName('Alice');
// Output: "User name: Alice"

// Stop the effect
dispose();
```

---

## Cleanup Pattern

Use `ctx.onCleanup()` to register cleanup logic:

```ts
effect((ctx) => {
  const handler = () => console.log('Window resized');
  window.addEventListener('resize', handler);
  
  // Cleanup runs before re-execution and on dispose
  ctx.onCleanup(() => {
    window.removeEventListener('resize', handler);
  });
});
```

::: warning NOT like React's useEffect
Do NOT return a cleanup function. Use `ctx.onCleanup()` instead:

```ts
// ❌ WRONG - returning cleanup function (won't work!)
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
:::

---

## Async Operations

Effects must be synchronous. Use `ctx.safe()` for async operations:

```ts
// ❌ WRONG - async effects throw error
effect(async () => {
  const data = await fetchData();
  state.data = data;
});

// ✅ CORRECT - use ctx.safe() for async
effect((ctx) => {
  ctx.safe(fetchData()).then((data) => {
    if (data !== undefined) {
      state.data = data;
    }
  });
});
```

**Why `ctx.safe()`?**

- Prevents race conditions: if effect re-runs, old promises are ignored
- Returns `undefined` for cancelled promises
- Prevents stale data from updating state

---

## Conditional Dependencies

Effects only track what's actually accessed:

```ts
effect(() => {
  // Only tracks state.user when state.isLoggedIn is true
  if (state.isLoggedIn) {
    console.log('Welcome,', state.user.name);
  } else {
    console.log('Please log in');
  }
});
```

---

## Multiple Dependencies

```ts
effect(() => {
  // Tracks both firstName and lastName
  const fullName = `${state.firstName} ${state.lastName}`;
  document.title = `Hello, ${fullName}`;
});
```

---

## Error Handling Examples

### Retry with Backoff

```ts
effect(
  () => {
    if (state.shouldFail) throw new Error('Failed');
    console.log('Success');
  },
  { onError: { count: 3, delay: 'backoff' } }
);
```

### Retry with Fixed Delay

```ts
effect(
  () => { /* ... */ },
  { onError: { count: 5, delay: 1000 } }  // 1 second between retries
);
```

### Custom Error Handler

```ts
effect(
  () => { /* ... */ },
  {
    onError: ({ error, retry, retryCount }) => {
      console.error(`Attempt ${retryCount + 1} failed:`, error);
      
      if (retryCount < 3) {
        setTimeout(retry, 1000 * (retryCount + 1));
      } else {
        // Give up after 3 retries
        state.error = error;
      }
    },
  }
);
```

### Fail Fast (Stop on Error)

```ts
effect(
  () => { /* ... */ },
  { onError: 'failFast' }
);
```

---

## In Store Setup

Effects are commonly used inside store `setup()`:

```ts
const userStore = store({
  name: 'user',
  state: { name: '', lastSaved: null as Date | null },
  setup({ state, onDispose }) {
    // Auto-save effect
    const dispose = effect((ctx) => {
      // Debounce saves
      const timeoutId = setTimeout(() => {
        ctx.safe(api.saveUser({ name: state.name })).then(() => {
          state.lastSaved = new Date();
        });
      }, 1000);
      
      ctx.onCleanup(() => clearTimeout(timeoutId));
    });
    
    // Clean up effect when store is disposed
    onDispose(dispose);
    
    return {
      setName: (name: string) => { state.name = name; },
    };
  },
});
```

---

## Comparison with React useEffect

| Aspect | `effect()` | `useEffect` |
|--------|------------|-------------|
| Dependency tracking | Automatic | Manual deps array |
| Cleanup registration | `ctx.onCleanup()` | Return function |
| Async support | Via `ctx.safe()` | Direct (with issues) |
| Location | Anywhere | Inside components |
| Cancellation | Automatic via signal | Manual |

---

## See Also

- **[Effects Guide](/guide/effects)** — Deep dive into effect patterns
- **[Reactivity Guide](/guide/reactivity)** — How dependency tracking works
- **[Stores](/guide/stores)** — Using effects in stores
