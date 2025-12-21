# persistMiddleware()

Middleware for persisting store state to storage (localStorage, IndexedDB, etc.).

## Signature

```ts
function persistMiddleware(options: PersistOptions): StoreMiddleware
```

## Options

```ts
interface PersistOptions {
  // Filter which stores to persist
  filter?: (context: StoreMiddlewareContext) => boolean;
  
  // Filter which fields to persist (for multi-storage patterns)
  fields?: (context: StoreMiddlewareContext) => string[];
  
  // Load persisted state (sync or async)
  load?: (context: StoreMiddlewareContext) => unknown | Promise<unknown>;
  
  // Save state changes
  save?: (context: StoreMiddlewareContext, state: unknown) => void | Promise<void>;
  
  // Handle errors
  onError?: (context: StoreMiddlewareContext, error: unknown, operation: 'load' | 'save') => void;
  
  // Force overwrite dirty state during hydration
  force?: boolean;
}
```

The `StoreMiddlewareContext` provides access to:
- `spec` - The store specification
- `meta` - MetaQuery for querying store metadata
- `displayName` - The store's display name

## Basic Example

```ts
import { container } from 'storion';
import { persistMiddleware } from 'storion/persist';

const app = container({
  middleware: [
    persistMiddleware({
      load: (ctx) => {
        const key = `app:${ctx.spec.displayName}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
      },
      save: (ctx, state) => {
        const key = `app:${ctx.spec.displayName}`;
        localStorage.setItem(key, JSON.stringify(state));
      },
    }),
  ],
});
```

## Filtering Stores

Only persist specific stores:

```ts
persistMiddleware({
  filter: (ctx) => ctx.displayName === 'user' || ctx.displayName === 'settings',
  load: (ctx) => /* ... */,
  save: (ctx, state) => /* ... */,
})
```

Or use the `forStores` helper:

```ts
import { forStores } from 'storion';

container({
  middleware: forStores([
    persistMiddleware({
      filter: (ctx) => ctx.displayName === 'user',
      load: /* ... */,
      save: /* ... */,
    }),
  ]),
});
```

## Async Loading

```ts
persistMiddleware({
  load: async (ctx) => {
    const db = await openDB('app-storage');
    return db.get('stores', ctx.spec.displayName);
  },
  save: async (ctx, state) => {
    const db = await openDB('app-storage');
    await db.put('stores', state, ctx.spec.displayName);
  },
})
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
    notPersisted.for('password'),
    notPersisted.for('confirmPassword'),
  ],
  setup: /* ... */,
});
```

## Error Handling

```ts
persistMiddleware({
  load: (ctx) => /* ... */,
  save: (ctx, state) => /* ... */,
  onError: (ctx, error, operation) => {
    console.error(`Persist ${operation} failed for ${ctx.displayName}:`, error);
    
    if (operation === 'load') {
      // Maybe clear corrupted data
      localStorage.removeItem(`app:${ctx.displayName}`);
    }
  },
})
```

## Force Hydration

By default, hydration skips "dirty" properties (modified since initialization). Use `force: true` to always overwrite:

```ts
persistMiddleware({
  load: (ctx) => /* ... */,
  save: (ctx, state) => /* ... */,
  force: true,  // Always use persisted values
})
```

## Debouncing Saves

The middleware doesn't include built-in debouncing. Implement it in your save function:

```ts
import { debounce } from 'lodash-es';

const debouncedSaves = new Map<string, (state: unknown) => void>();

persistMiddleware({
  load: (ctx) => /* ... */,
  save: (ctx, state) => {
    let save = debouncedSaves.get(ctx.displayName);
    if (!save) {
      save = debounce((s: unknown) => {
        localStorage.setItem(`app:${ctx.displayName}`, JSON.stringify(s));
      }, 300);
      debouncedSaves.set(ctx.displayName, save);
    }
    save(state);
  },
})
```

## With IndexedDB

```ts
import { openDB } from 'idb';

const dbPromise = openDB('app-db', 1, {
  upgrade(db) {
    db.createObjectStore('stores');
  },
});

persistMiddleware({
  load: async (ctx) => {
    const db = await dbPromise;
    return db.get('stores', ctx.spec.displayName);
  },
  save: async (ctx, state) => {
    const db = await dbPromise;
    await db.put('stores', state, ctx.spec.displayName);
  },
})
```

## Multi-Storage Patterns

Use the `fields` option combined with custom meta types to split store state across different storage backends:

```ts
import { store, container, forStores, meta } from 'storion';
import { persistMiddleware } from 'storion/persist';

// Define meta types for different storage targets
const sessionStore = meta();  // Fields for sessionStorage
const localStore = meta();    // Fields for localStorage

// Store with fields split between storage types
const authStore = store({
  name: 'auth',
  state: {
    accessToken: '',    // Expires with browser session
    refreshToken: '',   // Persists across sessions
    userId: '',         // Persists across sessions
    lastActivity: 0,    // Track for this session only
  },
  setup: ({ state }) => ({
    setTokens: (access: string, refresh: string) => {
      state.accessToken = access;
      state.refreshToken = refresh;
    },
    setUserId: (id: string) => { state.userId = id; },
    updateActivity: () => { state.lastActivity = Date.now(); },
  }),
  meta: [
    // Mark which fields go where
    sessionStore.for(['accessToken', 'lastActivity']),
    localStore.for(['refreshToken', 'userId']),
  ],
});

// Session storage middleware - clears when browser closes
const sessionMiddleware = persistMiddleware({
  filter: ({ meta }) => meta.any(sessionStore),
  fields: ({ meta }) => meta.fields(sessionStore),
  load: (ctx) => {
    const data = sessionStorage.getItem(`session:${ctx.displayName}`);
    return data ? JSON.parse(data) : null;
  },
  save: (ctx, state) => {
    sessionStorage.setItem(`session:${ctx.displayName}`, JSON.stringify(state));
  },
});

// Local storage middleware - persists across sessions
const localMiddleware = persistMiddleware({
  filter: ({ meta }) => meta.any(localStore),
  fields: ({ meta }) => meta.fields(localStore),
  load: (ctx) => {
    const data = localStorage.getItem(`local:${ctx.displayName}`);
    return data ? JSON.parse(data) : null;
  },
  save: (ctx, state) => {
    localStorage.setItem(`local:${ctx.displayName}`, JSON.stringify(state));
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
  name: 'mixed',
  state: {
    publicData: '',
    sensitiveData: '',
  },
  meta: [
    sessionStore.for(['publicData', 'sensitiveData']),
    notPersisted.for('sensitiveData'),  // Excluded despite being in sessionStore
  ],
});
// Only publicData will be persisted
```

## See Also

- [notPersisted](/api/not-persisted) - Meta for excluding from persistence
- [container()](/api/container) - Container with middleware
- [Persistence Guide](/guide/persistence) - Deep dive into persistence

