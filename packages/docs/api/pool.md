# pool()

A lazy-instantiation cache with factory function. Items are created on first access and reused thereafter.

## When to Use

Use `pool` when you need **keyed singletons** — the same key always returns the same instance:

- **Services by endpoint**: API clients, database connections
- **Resource management**: WebSocket connections, workers
- **Cached objects**: Expensive computations, parsed configurations
- **Keyed singletons**: Loggers per module, validators per schema

```ts
// ✅ Good: Same key = same instance
const loggerPool = pool((module: string) => createLogger(module));
loggerPool("auth"); // Creates logger
loggerPool("auth"); // Returns same logger

// ❌ Not for: Per-call instances (just use a function)
const createForm = (id: string) => new Form(id);
```

## Signature

```ts
function pool<TValue, TKey = unknown>(
  createItem: (key: TKey) => TValue,
  options?: PoolOptions<TKey, TValue> | readonly [TKey, TValue][]
): Pool<TKey, TValue>
```

## Options

### initial

Pre-populate the pool with items.

- **Type:** `readonly [TKey, TValue][]`
- **Required:** No

### keyOf

Hash function for O(1) lookups with complex keys.

- **Type:** `(key: TKey) => string | number`
- **Required:** No

```ts
// Object keys - hash by id
const userPool = pool(createUser, {
  keyOf: (user) => user.id,
});

// Array keys - hash by JSON
const coordPool = pool(createTile, {
  keyOf: JSON.stringify,
});
```

### equality

Custom equality function for key comparison. Uses O(n) linear scan.

- **Type:** `Equality<TKey>` (`"strict"` | `"shallow"` | `"deep"` | `(a, b) => boolean`)
- **Required:** No
- **Default:** Strict equality (`===`)

::: tip
Prefer `keyOf` over `equality` for better performance.
:::

### autoDispose

Automatically call `dispose()` on items when removed.

- **Type:** `boolean | AutoDisposeOptions`
- **Required:** No
- **Default:** `false`

```ts
const formPool = pool(createForm, { autoDispose: true });

formPool.get("checkout"); // Creates form
formPool.delete("checkout"); // Calls form.dispose()
```

## Return Value

Returns a `Pool<TKey, TValue>` that is **callable** and has these methods:

| Method | Description |
|--------|-------------|
| `(key)` | **Callable** - same as `get(key)` |
| `get(key)` | Get or create item by key |
| `has(key)` | Check if key exists (doesn't create) |
| `set(key, value)` | Explicitly set an item |
| `delete(key)` | Remove item (calls dispose if enabled) |
| `clear()` | Remove all items (calls dispose if enabled) |
| `tap(key, fn)` | Call fn if key exists (doesn't create) |
| `size()` | Number of items |
| `keys()` | Iterator over keys |
| `values()` | Iterator over values |
| `entries()` | Iterator over [key, value] pairs |

## Examples

### API Clients by Endpoint

```ts
import { pool } from "storion";

// One client per base URL
const apiClientPool = pool((baseUrl: string) => ({
  baseUrl,
  fetch: async (path: string, options?: RequestInit) => {
    const res = await fetch(`${baseUrl}${path}`, options);
    return res.json();
  },
}));

// Usage
const github = apiClientPool("https://api.github.com");
const gitlab = apiClientPool("https://gitlab.com/api/v4");
const github2 = apiClientPool("https://api.github.com"); // Same instance
```

### WebSocket Connections

```ts
const wsPool = pool(
  (channel: string) => {
    const socket = new WebSocket(`wss://api.example.com/${channel}`);
    return {
      socket,
      send: (data: unknown) => socket.send(JSON.stringify(data)),
      dispose() {
        socket.close();
      },
    };
  },
  { autoDispose: true }
);

// Connect to channels
wsPool("notifications").socket.onmessage = handleNotification;
wsPool("chat").send({ type: "join" });

// Cleanup
wsPool.delete("chat"); // Closes WebSocket
```

### Loggers by Module

```ts
const loggerPool = pool((module: string) => ({
  module,
  log: (msg: string) => console.log(`[${module}] ${msg}`),
  error: (msg: string) => console.error(`[${module}] ${msg}`),
}));

// Different modules, separate loggers
const authLogger = loggerPool("auth");
const dbLogger = loggerPool("database");

authLogger.log("User logged in"); // [auth] User logged in
dbLogger.log("Query executed"); // [database] Query executed
```

### With Complex Keys

```ts
type CacheKey = { userId: string; resource: string };

const cachePool = pool(
  (key: CacheKey) => ({
    data: null,
    fetchedAt: null as Date | null,
  }),
  {
    keyOf: (key) => `${key.userId}:${key.resource}`,
  }
);

// Different object, same hash = same item
cachePool.get({ userId: "1", resource: "profile" });
cachePool.get({ userId: "1", resource: "profile" }); // Same item
```

### With Auto-Dispose

```ts
const connectionPool = pool(
  (endpoint: string) => ({
    socket: new WebSocket(endpoint),
    dispose() {
      this.socket.close();
    },
  }),
  { autoDispose: true }
);

connectionPool.get("wss://api.example.com");
connectionPool.delete("wss://api.example.com"); // Closes WebSocket
```

### IIFE for Shared Closure

```ts
const counterPool = pool(
  (() => {
    // Shared across all items in this pool
    let globalIdCounter = 0;

    return (key: string) => ({
      id: globalIdCounter++,
      key,
      count: 0,
    });
  })()
);

counterPool.get("a").id; // 0
counterPool.get("b").id; // 1
counterPool.get("a").id; // Still 0 (same item)
```

### tap() for Conditional Operations

```ts
const formPool = pool(createForm);

// Only save if form exists
formPool.tap("checkout", (form) => {
  form.save();
});

// Chain multiple taps
formPool
  .tap("billing", (form) => form.validate())
  .tap("shipping", (form) => form.validate())
  .tap("payment", (form) => form.submit());
```

## Performance

| Operation | Without `keyOf` | With `keyOf` |
|-----------|-----------------|--------------|
| get/has/delete | O(1) or O(n)* | O(1) |
| set | O(1) or O(n)* | O(1) |
| clear | O(n) | O(n) |

\* O(n) when using custom `equality`, O(1) with default strict equality.

## Related

- [`container()`](/api/container) - Global store container
- [`store()`](/api/store) - Create reactive stores

