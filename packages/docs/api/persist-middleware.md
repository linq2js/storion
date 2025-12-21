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
  filter?: (spec: StoreSpec) => boolean;
  
  // Load persisted state (sync or async)
  load?: (spec: StoreSpec) => unknown | Promise<unknown>;
  
  // Save state changes
  save?: (spec: StoreSpec, state: unknown) => void | Promise<void>;
  
  // Handle errors
  onError?: (spec: StoreSpec, error: unknown, operation: 'load' | 'save') => void;
  
  // Force overwrite dirty state during hydration
  force?: boolean;
}
```

## Basic Example

```ts
import { container } from 'storion';
import { persistMiddleware } from 'storion/persist';

const app = container({
  middleware: [
    persistMiddleware({
      load: (spec) => {
        const key = `app:${spec.displayName}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
      },
      save: (spec, state) => {
        const key = `app:${spec.displayName}`;
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
  filter: (spec) => spec.displayName === 'user' || spec.displayName === 'settings',
  load: (spec) => /* ... */,
  save: (spec, state) => /* ... */,
})
```

Or use the `applyFor` helper:

```ts
import { applyFor } from 'storion';

container({
  middleware: [
    applyFor('user', 'settings', persistMiddleware({
      load: /* ... */,
      save: /* ... */,
    })),
  ],
});
```

## Async Loading

```ts
persistMiddleware({
  load: async (spec) => {
    const db = await openDB('app-storage');
    return db.get('stores', spec.displayName);
  },
  save: async (spec, state) => {
    const db = await openDB('app-storage');
    await db.put('stores', state, spec.displayName);
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
  load: (spec) => /* ... */,
  save: (spec, state) => /* ... */,
  onError: (spec, error, operation) => {
    console.error(`Persist ${operation} failed for ${spec.displayName}:`, error);
    
    if (operation === 'load') {
      // Maybe clear corrupted data
      localStorage.removeItem(`app:${spec.displayName}`);
    }
  },
})
```

## Force Hydration

By default, hydration skips "dirty" properties (modified since initialization). Use `force: true` to always overwrite:

```ts
persistMiddleware({
  load: (spec) => /* ... */,
  save: (spec, state) => /* ... */,
  force: true,  // Always use persisted values
})
```

## Debouncing Saves

The middleware doesn't include built-in debouncing. Implement it in your save function:

```ts
import { debounce } from 'lodash-es';

const debouncedSaves = new Map<string, (state: unknown) => void>();

persistMiddleware({
  load: (spec) => /* ... */,
  save: (spec, state) => {
    let save = debouncedSaves.get(spec.displayName);
    if (!save) {
      save = debounce((s: unknown) => {
        localStorage.setItem(`app:${spec.displayName}`, JSON.stringify(s));
      }, 300);
      debouncedSaves.set(spec.displayName, save);
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
  load: async (spec) => {
    const db = await dbPromise;
    return db.get('stores', spec.displayName);
  },
  save: async (spec, state) => {
    const db = await dbPromise;
    await db.put('stores', state, spec.displayName);
  },
})
```

## See Also

- [notPersisted](/api/not-persisted) - Meta for excluding from persistence
- [container()](/api/container) - Container with middleware
- [Persistence Guide](/guide/persistence) - Deep dive into persistence

