# Effects

Effects are reactive side effects that automatically re-run when their dependencies change.

## Basic Usage

```ts
import { effect } from 'storion/react';

const userStore = store({
  state: { name: '', theme: 'light' },
  setup({ state }) {
    // Auto-runs when state.theme changes
    effect((ctx) => {
      document.body.className = state.theme;
    });

    return { /* actions */ };
  },
});
```

## Effect Context

```ts
effect((ctx) => {
  // Access reactive state
  const theme = state.theme;
  
  // Cleanup on re-run or disposal
  ctx.cleanup(() => {
    console.log('Cleaning up');
  });
  
  // Safe async operations
  ctx.safe(fetchData()).then(data => {
    state.data = data;
  });
  
  // Manual refresh
  // ctx.refresh(); // Re-run the effect
});
```

## Important Rules

::: danger Effects Must Be Synchronous
```ts
// ❌ WRONG - async effect
effect(async (ctx) => {
  const data = await fetchData();
  state.data = data;
});

// ✅ CORRECT - use ctx.safe()
effect((ctx) => {
  ctx.safe(fetchData()).then(data => {
    state.data = data;
  });
});
```
:::

## Options

```ts
effect(fn, {
  // When to run
  immediate: true,  // Run immediately (default: true)
  
  // Error handling
  onError: 'throw',  // 'throw' | 'ignore' | { retry: config }
  
  // Debounce/throttle
  debounce: 100,     // Debounce in ms
  throttle: 100,     // Throttle in ms
});
```

## Error Handling

### Throw (Default)

```ts
effect(fn, { onError: 'throw' });
```

### Ignore

```ts
effect(fn, { onError: 'ignore' });
```

### Retry

```ts
effect(fn, {
  onError: {
    retry: {
      maxAttempts: 3,
      delay: 1000,
      backoff: 'exponential',
    },
  },
});
```

## Cleanup

Cleanup runs:
1. Before effect re-runs
2. When store disposes

```ts
effect((ctx) => {
  const timer = setInterval(() => {
    state.count++;
  }, 1000);

  ctx.cleanup(() => {
    clearInterval(timer);
  });
});
```

## Nested Effects

Effects can be nested:

```ts
effect((ctx) => {
  if (state.enabled) {
    // Inner effect, disposed when outer re-runs
    effect((innerCtx) => {
      console.log('Inner effect:', state.value);
    });
  }
});
```

