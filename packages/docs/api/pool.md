# pool()

A lazy-instantiation Map with factory function. Items are created on-demand via `get()`.

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

Returns a `Pool<TKey, TValue>` with these methods:

| Method | Description |
|--------|-------------|
| `get(key)` | Get or create item by key |
| `has(key)` | Check if key exists (doesn't create) |
| `set(key, value)` | Explicitly set an item |
| `delete(key)` | Remove item (calls dispose if enabled) |
| `clear()` | Remove all items (calls dispose if enabled) |
| `tap(key, fn)` | Call fn if key exists (doesn't create) |
| `size` | Number of items |
| `keys()` | Iterator over keys |
| `values()` | Iterator over values |
| `entries()` | Iterator over [key, value] pairs |

## Examples

### Basic Usage

```ts
import { pool } from "storion";

// Simple string keys
const emitters = pool((key: string) => emitter<void>());

const countEmitter = emitters.get("count"); // Creates emitter
const sameEmitter = emitters.get("count"); // Returns same instance

console.log(emitters.size); // 1
```

### Dynamic Store Creation

```ts
import { store, pool } from "storion/react";

// Pool of chat room stores
const chatRoomPool = pool((roomId: string) =>
  store({
    name: `chat:${roomId}`,
    state: { messages: [] as Message[] },
    setup({ state }) {
      return {
        addMessage: (msg: Message) => {
          state.messages = [...state.messages, msg];
        },
      };
    },
  })
);

// Use in component
function ChatRoom({ roomId }: { roomId: string }) {
  const { messages } = useStore(({ get }) => {
    const roomStore = chatRoomPool.get(roomId);
    const [state] = get(roomStore);
    return { messages: state.messages };
  });

  return <MessageList messages={messages} />;
}
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

- [Sharing Logic Guide](/guide/sharing-logic) - Patterns for reusing store logic
- [`store()`](/api/store) - Create store specs for use with pools

