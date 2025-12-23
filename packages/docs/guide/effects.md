# Effects

Effects are reactive side effects that automatically re-run when their dependencies change. They're the Storion equivalent of React's `useEffect`, but they work at the store level and track dependencies automatically.

## The Problem

In React, `useEffect` requires manual dependency arrays that are easy to get wrong:

```tsx
// ❌ React useEffect - manual dependencies, easy to forget
useEffect(() => {
  document.title = `${user.name} - ${count} items`;
}, [user.name, count]); // Did we forget any deps?
```

Storion effects track dependencies automatically:

```ts
// ✅ Storion effect - automatic tracking
effect(() => {
  document.title = `${state.user.name} - ${state.count} items`;
  // Dependencies tracked automatically from state reads
});
```

## Basic Usage

Effects are typically defined in store setup:

```ts
import { store, effect } from "storion/react";

const userStore = store({
  name: "user",
  state: { name: "", theme: "light" },
  setup({ state }) {
    // This effect auto-runs when state.theme changes
    effect(() => {
      document.body.className = state.theme;
    });

    // This effect auto-runs when state.name changes
    effect(() => {
      document.title = `Welcome, ${state.name}`;
    });

    return {
      setName: (name: string) => {
        state.name = name;
      },
      setTheme: (theme: string) => {
        state.theme = theme;
      },
    };
  },
});
```

**What happens:**

1. Effect runs immediately on store creation
2. Storion tracks which state properties were read (`theme`, `name`)
3. When those properties change, the effect re-runs automatically
4. No manual dependency array needed

## Effect Context

Every effect receives a context object with useful utilities:

```ts
effect((ctx) => {
  // ctx.nth - Run number (1-indexed)
  console.log(`Effect run #${ctx.nth}`);

  // ctx.signal - AbortSignal for cancellation
  fetch("/api/data", { signal: ctx.signal });

  // ctx.onCleanup() - Register cleanup callbacks
  ctx.onCleanup(() => {
    console.log("Cleaning up before next run");
  });

  // ctx.safe() - Safe async operations
  ctx.safe(fetchData()).then((data) => {
    state.data = data;
  });

  // ctx.refresh() - Manually trigger re-run (async only)
  setTimeout(() => ctx.refresh(), 5000);
});
```

## Cleanup

Effects often need to clean up resources (timers, subscriptions, event listeners). Use `ctx.onCleanup()`:

```ts
effect((ctx) => {
  // Set up a timer
  const timer = setInterval(() => {
    state.tick++;
  }, 1000);

  // Clean up when effect re-runs or store disposes
  ctx.onCleanup(() => {
    clearInterval(timer);
  });
});
```

**When cleanup runs:**

1. **Before effect re-runs** — when dependencies change
2. **When store is disposed** — final cleanup

::: warning Not Like React useEffect
In React, you return a cleanup function. In Storion, you call `ctx.onCleanup()`:

```ts
// ❌ Wrong - React pattern doesn't work
effect(() => {
  const timer = setInterval(/*...*/);
  return () => clearInterval(timer); // Won't be called!
});

// ✅ Correct - use ctx.onCleanup()
effect((ctx) => {
  const timer = setInterval(/*...*/);
  ctx.onCleanup(() => clearInterval(timer));
});
```

:::

### Why `onCleanup()` Over Return?

The `ctx.onCleanup()` pattern handles **partial failure** correctly:

```ts
// React pattern - cleanup doesn't run if setup fails midway
useEffect(() => {
  const ws = new WebSocket(url); // ✅ Created
  const timer = setInterval(/*...*/); // ✅ Created
  const result = riskyOperation(); // ❌ Throws!

  return () => {
    // Never runs! WebSocket and timer leak.
    ws.close();
    clearInterval(timer);
  };
}, []);

// Storion pattern - each cleanup registered immediately
effect((ctx) => {
  const ws = new WebSocket(url);
  ctx.onCleanup(() => ws.close()); // ✅ Registered

  const timer = setInterval(/*...*/);
  ctx.onCleanup(() => clearInterval(timer)); // ✅ Registered

  riskyOperation(); // ❌ Throws!

  // WebSocket and timer are still cleaned up!
});
```

**Key advantage:** Register cleanup immediately after each resource is created. If later setup steps fail, earlier cleanups still run.

## Async Operations

::: danger Effects Must Be Synchronous
Effect callbacks cannot be `async`. This is intentional - async effects make dependency tracking unreliable.

```ts
// ❌ WRONG - async effect
effect(async (ctx) => {
  const data = await fetchData();
  state.data = data;
});

// ✅ CORRECT - use ctx.safe() for async
effect((ctx) => {
  ctx.safe(fetchData()).then((data) => {
    state.data = data;
  });
});
```

:::

### Why ctx.safe()?

`ctx.safe()` wraps promises to handle stale results:

```ts
effect((ctx) => {
  // If effect re-runs before fetchData() resolves,
  // the old promise's .then() callback is ignored
  ctx.safe(fetchData()).then((data) => {
    // Only runs if this is still the current effect run
    state.data = data;
  });
});
```

Without `ctx.safe()`, you risk race conditions where old responses overwrite newer ones.

### Using ctx.signal

For fetch requests, use the built-in abort signal:

```ts
effect((ctx) => {
  fetch("/api/data", { signal: ctx.signal })
    .then((res) => res.json())
    .then((data) => {
      state.data = data;
    })
    .catch((err) => {
      if (err.name !== "AbortError") {
        state.error = err;
      }
    });
});
```

## Derived State

Effects are perfect for computed/derived values:

```ts
const userStore = store({
  name: "user",
  state: {
    firstName: "",
    lastName: "",
    fullName: "", // Derived
  },
  setup({ state }) {
    // Auto-updates fullName when firstName or lastName changes
    effect(() => {
      state.fullName = `${state.firstName} ${state.lastName}`.trim();
    });

    return {
      setFirstName: (name: string) => {
        state.firstName = name;
      },
      setLastName: (name: string) => {
        state.lastName = name;
      },
    };
  },
});
```

## Effect Options

```ts
effect(fn, {
  // Error handling strategy
  onError: "throw", // 'throw' | 'ignore' | 'keepAlive' | { retry: config }
});
```

The only option is `onError` for controlling how errors are handled.

## Error Handling

### Default: Throw

Errors propagate to the store's `onError` handler:

```ts
const myStore = store({
  onError: (error) => {
    console.error("Store error:", error);
    Sentry.captureException(error);
  },
  setup({ state }) {
    effect(() => {
      if (state.invalid) {
        throw new Error("Invalid state!");
      }
    });
  },
});
```

### Ignore Errors

```ts
effect(fn, { onError: "ignore" });
```

### Retry on Error

```ts
// Retry with default backoff strategy (1s, 2s, 4s...)
effect(fn, {
  onError: { count: 3 },
});

// Retry with fixed delay
effect(fn, {
  onError: { count: 3, delay: 1000 },
});

// Retry with named strategy: "backoff" | "linear" | "fixed" | "fibonacci" | "immediate"
effect(fn, {
  onError: { count: 5, delay: "linear" }, // 1s, 2s, 3s, 4s, 5s
});

// Retry with custom delay function
effect(fn, {
  onError: {
    count: 3,
    delay: (attempt) => Math.min(100 * 2 ** attempt, 5000),
  },
});
```

::: tip Unified with async module
Effect retry uses the same delay strategies as `abortable` wrappers: `"backoff"`, `"linear"`, `"fixed"`, `"fibonacci"`, `"immediate"`.
:::

## Manual Refresh

Sometimes you need to re-run an effect manually:

```ts
effect((ctx) => {
  // Set up polling
  const timer = setTimeout(() => {
    ctx.refresh(); // Trigger re-run
  }, 5000);

  ctx.onCleanup(() => clearTimeout(timer));

  // Do the actual work
  state.data = await fetchLatestData();
});
```

::: warning Cannot Refresh Synchronously
Calling `ctx.refresh()` during effect execution throws an error to prevent infinite loops:

```ts
// ❌ WRONG - throws error
effect((ctx) => {
  ctx.refresh(); // Error!
});

// ✅ CORRECT - async refresh
effect((ctx) => {
  setTimeout(() => ctx.refresh(), 1000);
});
```

:::

## Common Patterns

### Syncing to External Systems

```ts
effect((ctx) => {
  // Sync state to localStorage
  localStorage.setItem("user", JSON.stringify(state.user));
});
```

### WebSocket Connections

```ts
effect((ctx) => {
  if (!state.userId) return;

  const ws = new WebSocket(`/ws?user=${state.userId}`);

  ws.onmessage = (event) => {
    state.messages.push(JSON.parse(event.data));
  };

  ctx.onCleanup(() => {
    ws.close();
  });
});
```

### Event Listeners

```ts
effect((ctx) => {
  const handler = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      state.modalOpen = false;
    }
  };

  document.addEventListener("keydown", handler);
  ctx.onCleanup(() => {
    document.removeEventListener("keydown", handler);
  });
});
```

### Conditional Effects

```ts
effect(() => {
  // Only track state.theme when darkMode is enabled
  if (state.settings.darkMode) {
    document.body.classList.add("dark");
    document.body.style.setProperty("--bg", state.theme.background);
  } else {
    document.body.classList.remove("dark");
  }
});
```

## Best Practices

1. **Keep effects focused** — One effect per concern
2. **Always clean up resources** — Use `ctx.onCleanup()` for timers, subscriptions, listeners
3. **Use ctx.safe() for async** — Prevents race conditions
4. **Don't return cleanup functions** — Use `ctx.onCleanup()` instead
5. **Avoid expensive computations** — Effects run synchronously and can block

## Next Steps

- **[Reactivity](/guide/reactivity)** — How dependency tracking works
- **[Stores](/guide/stores)** — Where effects live
- **[effect() API](/api/effect)** — Complete API reference
