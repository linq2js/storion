# persistMiddleware()

Middleware for persisting store state to storage (localStorage, IndexedDB, etc.).

## Signature

```ts
function persistMiddleware(options: PersistOptions): StoreMiddleware;
```

## Options

```ts
interface PersistContext extends StoreMiddlewareContext {
  store: StoreInstance; // The created store instance
}

interface PersistHandler {
  load?: () => unknown | Promise<unknown>;
  save?: (state: Record<string, unknown>) => void;
}

interface PersistOptions {
  // Filter which stores to persist
  filter?: (context: PersistContext) => boolean;

  // Filter which fields to persist (for multi-storage patterns)
  fields?: (context: PersistContext) => string[];

  // Handler factory - creates load/save for each store
  handler: (
    context: PersistContext
  ) => PersistHandler | Promise<PersistHandler>;

  // Handle errors during init, load, or save
  onError?: (error: unknown, operation: "init" | "load" | "save") => void;

  // Force overwrite dirty state during hydration
  force?: boolean;
}
```

The `PersistContext` provides access to:

- `spec` - The store specification
- `meta` - MetaQuery for querying store metadata
- `displayName` - The store's display name
- `store` - The created store instance

## Design Philosophy

Storion's `persistMiddleware` takes a **minimal, composable approach** compared to other state management libraries. It provides the essential building blocks while letting you control the implementation details.

### What persistMiddleware Does

| Feature              | Description                                                |
| -------------------- | ---------------------------------------------------------- |
| **Load on init**     | Calls your `load()` when a store is created                |
| **Save on change**   | Calls your `save()` whenever store state changes           |
| **Field filtering**  | Filter which fields to persist via `fields` option         |
| **Store filtering**  | Skip stores via `filter` option or `notPersisted` meta     |
| **Meta integration** | Query store metadata for conditional persistence           |
| **Async init**       | Handler can be async (for IndexedDB, remote storage, etc.) |
| **Error handling**   | Unified `onError` callback for all operations              |
| **Force hydration**  | Option to overwrite "dirty" state during load              |

### What You Control

| Feature            | Your Responsibility        | Why                                                   |
| ------------------ | -------------------------- | ----------------------------------------------------- |
| **Storage engine** | Implement in `handler`     | You choose: localStorage, IndexedDB, remote API, etc. |
| **Serialization**  | Implement in `load`/`save` | You control: JSON, superjson, custom transforms       |
| **Debouncing**     | Wrap `save` with debounce  | Different stores may need different delays            |
| **Throttling**     | Wrap `save` with throttle  | Control save frequency per your needs                 |
| **Purge/Clear**    | Call storage APIs directly | No hidden state to manage                             |
| **Flush**          | Not needed                 | Saves are synchronous to your handler                 |
| **Migrations**     | Transform in `load`        | You know your schema best                             |
| **Encryption**     | Implement in `load`/`save` | Security requirements vary                            |

### Comparison with Other Libraries

#### Redux Persist

```ts
// Redux Persist - declarative config with built-in features
import { persistStore, persistReducer } from "redux-persist";
import storage from "redux-persist/lib/storage";

const persistConfig = {
  key: "root",
  storage,
  whitelist: ["user", "settings"],
  blacklist: ["temp"],
  transforms: [encryptTransform],
  migrate: createMigrate(migrations),
  throttle: 1000,
  // Many more options...
};

const persistedReducer = persistReducer(persistConfig, rootReducer);
const persistor = persistStore(store);

// To purge: persistor.purge()
// To flush: persistor.flush()
```

**Redux Persist** provides:

- Built-in storage engines (localStorage, AsyncStorage, etc.)
- Transforms pipeline for serialization
- Migration system with versioning
- Throttling built-in
- `persistor` object for purge/flush/pause

#### Zustand Persist

```ts
// Zustand - middleware wrapping with options
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const useStore = create(
  persist(
    (set) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 })),
    }),
    {
      name: "counter",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ count: state.count }),
      onRehydrateStorage: () => (state, error) => {
        /* ... */
      },
      version: 1,
      migrate: (persisted, version) => {
        /* ... */
      },
      // skipHydration, merge options...
    }
  )
);

// Access: useStore.persist.clearStorage()
// Access: useStore.persist.rehydrate()
```

**Zustand Persist** provides:

- Storage abstraction with `createJSONStorage`
- `partialize` for field selection
- Migration with versioning
- Rehydration callbacks
- Methods on store for clear/rehydrate

#### Storion Persist

```ts
// Storion - handler pattern with full control
import { container, forStores, meta } from 'storion';
import { persistMiddleware, notPersisted } from 'storion/persist';
import { debounce } from 'lodash-es';

const inSession = meta();  // Fields to persist in sessionStorage

const userStore = store({
  name: 'user',
  state: { name: '', token: '', temp: '' },
  meta: [
    inSession.for(['name', 'token']),
    notPersisted.for('temp'),
  ],
  setup: /* ... */,
});

const app = container({
  middleware: forStores([
    persistMiddleware({
      filter: ({ meta }) => meta.any(inSession),
      fields: ({ meta }) => meta.fields(inSession),
      handler: (ctx) => {
        const key = `app:${ctx.displayName}`;
        const debouncedSave = debounce(
          (s) => localStorage.setItem(key, JSON.stringify(s)),
          300
        );
        return {
          load: () => {
            const data = localStorage.getItem(key);
            if (!data) return null;
            // Migration logic here if needed
            return JSON.parse(data);
          },
          save: debouncedSave,
        };
      },
      onError: (err, op) => console.error(`${op} failed:`, err),
    }),
  ]),
});

// To purge: localStorage.removeItem('app:user')
// To clear all: localStorage.clear() or iterate keys
```

### Summary

| Feature                | Redux Persist           | Zustand Persist         | Storion Persist      |
| ---------------------- | ----------------------- | ----------------------- | -------------------- |
| **Philosophy**         | Feature-rich            | Balanced                | Minimal core         |
| **Storage engines**    | Built-in adapters       | `createJSONStorage`     | You implement        |
| **Debounce/Throttle**  | Built-in `throttle`     | Not built-in            | You implement        |
| **Migrations**         | Built-in system         | Built-in `migrate`      | You implement        |
| **Field selection**    | `whitelist`/`blacklist` | `partialize`            | `fields` + meta      |
| **Purge/Flush**        | `persistor` methods     | `persist` methods       | Direct storage calls |
| **Async storage**      | AsyncStorage adapter    | `async getItem/setItem` | Async `handler`      |
| **Bundle size impact** | Larger                  | Medium                  | Minimal              |
| **Learning curve**     | Higher                  | Medium                  | Lower                |
| **Flexibility**        | Configured              | Moderate                | Maximum              |

**Choose Storion's approach when you:**

- Want full control over storage implementation
- Need different strategies per store (debounce times, storage backends)
- Prefer explicit code over configuration
- Want minimal abstraction overhead
- Have specific serialization/encryption needs

## Basic Example

```ts
import { container, forStores } from "storion";
import { persistMiddleware } from "storion/persist";

const app = container({
  middleware: forStores([
    persistMiddleware({
      handler: (ctx) => {
        const key = `app:${ctx.displayName}`;
        return {
          load: () => {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
          },
          save: (state) => {
            localStorage.setItem(key, JSON.stringify(state));
          },
        };
      },
    }),
  ]),
});
```

## Filtering Stores

Only persist specific stores:

```ts
persistMiddleware({
  filter: (ctx) => ctx.displayName === "user" || ctx.displayName === "settings",
  handler: (ctx) => {
    const key = `app:${ctx.displayName}`;
    return {
      load: () => JSON.parse(localStorage.getItem(key) || "null"),
      save: (state) => localStorage.setItem(key, JSON.stringify(state)),
    };
  },
});
```

Or use the `applyFor` helper:

```ts
import { applyFor } from "storion";

container({
  middleware: [
    applyFor(
      "user",
      persistMiddleware({
        handler: (ctx) => ({
          load: () => JSON.parse(localStorage.getItem("user") || "null"),
          save: (state) => localStorage.setItem("user", JSON.stringify(state)),
        }),
      })
    ),
  ],
});
```

## Async Handler (IndexedDB)

The handler can be async for initialization that requires async setup:

```ts
import { openDB } from "idb";

persistMiddleware({
  handler: async (ctx) => {
    // Async initialization - opens DB once per store
    const db = await openDB("app-db", 1, {
      upgrade(db) {
        db.createObjectStore("stores");
      },
    });

    return {
      load: () => db.get("stores", ctx.displayName),
      save: (state) => db.put("stores", state, ctx.displayName),
    };
  },
});
```

## Using notPersisted Meta

Exclude stores or fields from persistence:

```ts
import { store } from 'storion';
import { notPersisted } from 'storion/persist';

// Exclude entire store
const sessionStore = store({
  name: 'session',
  state: { token: '', expiry: 0 },
  meta: [notPersisted()],  // Won't be persisted
  setup: /* ... */,
});

// Exclude specific fields
const userStore = store({
  name: 'user',
  state: {
    name: '',
    email: '',
    password: '',         // Sensitive
    confirmPassword: '',  // Temporary
  },
  meta: [
    notPersisted.for(['password', 'confirmPassword']),
  ],
  setup: /* ... */,
});
```

## Error Handling

```ts
persistMiddleware({
  handler: (ctx) => ({
    load: () => /* ... */,
    save: (state) => /* ... */,
  }),
  onError: (error, operation) => {
    console.error(`Persist ${operation} failed:`, error);

    if (operation === 'init') {
      // Handler initialization failed (e.g., DB connection)
    } else if (operation === 'load') {
      // Loading persisted state failed
    } else {
      // Saving state failed
    }
  },
})
```

## Force Hydration

By default, hydration skips "dirty" properties (modified since initialization). Use `force: true` to always overwrite:

```ts
persistMiddleware({
  handler: (ctx) => ({
    load: () => /* ... */,
    save: (state) => /* ... */,
  }),
  force: true,  // Always use persisted values
})
```

## Debouncing Saves

Implement debouncing in the handler closure:

```ts
import { debounce } from "lodash-es";

persistMiddleware({
  handler: (ctx) => {
    const key = `app:${ctx.displayName}`;

    // Debounced save - created once per store
    const debouncedSave = debounce(
      (state: unknown) => localStorage.setItem(key, JSON.stringify(state)),
      300
    );

    return {
      load: () => JSON.parse(localStorage.getItem(key) || "null"),
      save: debouncedSave,
    };
  },
});
```

## Multi-Storage Patterns

Use the `fields` option combined with custom meta types to split store state across different storage backends:

```ts
import { store, container, forStores, meta } from "storion";
import { persistMiddleware } from "storion/persist";

// Define meta types for different storage targets
const inSession = meta(); // Fields for sessionStorage
const inLocal = meta(); // Fields for localStorage

// Store with fields split between storage types
const authStore = store({
  name: "auth",
  state: {
    accessToken: "", // Expires with browser session
    refreshToken: "", // Persists across sessions
    userId: "", // Persists across sessions
    lastActivity: 0, // Track for this session only
  },
  setup: ({ state }) => ({
    setTokens: (access: string, refresh: string) => {
      state.accessToken = access;
      state.refreshToken = refresh;
    },
    setUserId: (id: string) => {
      state.userId = id;
    },
    updateActivity: () => {
      state.lastActivity = Date.now();
    },
  }),
  meta: [
    inSession.for(["accessToken", "lastActivity"]),
    inLocal.for(["refreshToken", "userId"]),
  ],
});

// Session storage middleware
const sessionMiddleware = persistMiddleware({
  filter: ({ meta }) => meta.any(inSession),
  fields: ({ meta }) => meta.fields(inSession),
  handler: (ctx) => {
    const key = `session:${ctx.displayName}`;
    return {
      load: () => JSON.parse(sessionStorage.getItem(key) || "null"),
      save: (state) => sessionStorage.setItem(key, JSON.stringify(state)),
    };
  },
});

// Local storage middleware
const localMiddleware = persistMiddleware({
  filter: ({ meta }) => meta.any(inLocal),
  fields: ({ meta }) => meta.fields(inLocal),
  handler: (ctx) => {
    const key = `local:${ctx.displayName}`;
    return {
      load: () => JSON.parse(localStorage.getItem(key) || "null"),
      save: (state) => localStorage.setItem(key, JSON.stringify(state)),
    };
  },
});

// Apply both middlewares
const app = container({
  middleware: forStores([sessionMiddleware, localMiddleware]),
});
```

This pattern enables:

- **Security**: Store sensitive tokens in sessionStorage (cleared on browser close)
- **User experience**: Keep refresh tokens in localStorage for seamless re-authentication
- **Flexibility**: Each middleware only handles its designated fields
- **Composability**: Same store can have fields persisted to different backends

### Combining with notPersisted

The `fields` option works alongside `notPersisted` meta. Fields marked as `notPersisted` are excluded even if they match the `fields` filter:

```ts
const mixedStore = store({
  name: "mixed",
  state: {
    publicData: "",
    sensitiveData: "",
  },
  meta: [
    inSession.for(["publicData", "sensitiveData"]),
    notPersisted.for("sensitiveData"), // Excluded despite being in inSession
  ],
});
// Only publicData will be persisted
```

## See Also

- [notPersisted](/api/not-persisted) - Meta for excluding from persistence
- [container()](/api/container) - Container with middleware
- [Persistence Guide](/guide/persistence) - Deep dive into persistence
