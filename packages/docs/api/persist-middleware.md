# persistMiddleware()

Middleware for persisting store state to storage (localStorage, IndexedDB, etc.).

## Signature

```ts
function persistMiddleware(options: PersistOptions): StoreMiddleware
```

## Options

```ts
interface PersistContext extends StoreMiddlewareContext {
  store: StoreInstance;  // The created store instance
}

interface PersistHandler {
  load?: () => unknown | Promise<unknown>;
  save?: (state: Record<string, unknown>) => void;
}

interface PersistOptions {
  // Filter which stores to persist
  filter?: (context: StoreMiddlewareContext) => boolean;
  
  // Filter which fields to persist (for multi-storage patterns)
  fields?: (context: StoreMiddlewareContext) => string[];
  
  // Handler factory - creates load/save for each store
  handler: (context: PersistContext) => PersistHandler | Promise<PersistHandler>;
  
  // Handle errors during init, load, or save
  onError?: (error: unknown, operation: 'init' | 'load' | 'save') => void;
  
  // Force overwrite dirty state during hydration
  force?: boolean;
}
```

The `PersistContext` provides access to:
- `spec` - The store specification
- `meta` - MetaQuery for querying store metadata
- `displayName` - The store's display name
- `store` - The created store instance

## Basic Example

```ts
import { container, forStores } from 'storion';
import { persistMiddleware } from 'storion/persist';

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
  filter: (ctx) => ctx.displayName === 'user' || ctx.displayName === 'settings',
  handler: (ctx) => {
    const key = `app:${ctx.displayName}`;
    return {
      load: () => JSON.parse(localStorage.getItem(key) || 'null'),
      save: (state) => localStorage.setItem(key, JSON.stringify(state)),
    };
  },
})
```

Or use the `applyFor` helper:

```ts
import { applyFor } from 'storion';

container({
  middleware: [
    applyFor('user', persistMiddleware({
      handler: (ctx) => ({
        load: () => JSON.parse(localStorage.getItem('user') || 'null'),
        save: (state) => localStorage.setItem('user', JSON.stringify(state)),
      }),
    })),
  ],
});
```

## Async Handler (IndexedDB)

The handler can be async for initialization that requires async setup:

```ts
import { openDB } from 'idb';

persistMiddleware({
  handler: async (ctx) => {
    // Async initialization - opens DB once per store
    const db = await openDB('app-db', 1, {
      upgrade(db) {
        db.createObjectStore('stores');
      },
    });
    
    return {
      load: () => db.get('stores', ctx.displayName),
      save: (state) => db.put('stores', state, ctx.displayName),
    };
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
import { debounce } from 'lodash-es';

persistMiddleware({
  handler: (ctx) => {
    const key = `app:${ctx.displayName}`;
    
    // Debounced save - created once per store
    const debouncedSave = debounce(
      (state: unknown) => localStorage.setItem(key, JSON.stringify(state)),
      300
    );
    
    return {
      load: () => JSON.parse(localStorage.getItem(key) || 'null'),
      save: debouncedSave,
    };
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
    sessionStore.for(['accessToken', 'lastActivity']),
    localStore.for(['refreshToken', 'userId']),
  ],
});

// Session storage middleware
const sessionMiddleware = persistMiddleware({
  filter: ({ meta }) => meta.any(sessionStore),
  fields: ({ meta }) => meta.fields(sessionStore),
  handler: (ctx) => {
    const key = `session:${ctx.displayName}`;
    return {
      load: () => JSON.parse(sessionStorage.getItem(key) || 'null'),
      save: (state) => sessionStorage.setItem(key, JSON.stringify(state)),
    };
  },
});

// Local storage middleware
const localMiddleware = persistMiddleware({
  filter: ({ meta }) => meta.any(localStore),
  fields: ({ meta }) => meta.fields(localStore),
  handler: (ctx) => {
    const key = `local:${ctx.displayName}`;
    return {
      load: () => JSON.parse(localStorage.getItem(key) || 'null'),
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
