# Persistence

Storion provides a `persistMiddleware` for automatic state persistence.

## Installation

```ts
import { persistMiddleware, notPersisted } from 'storion/persist';
```

## Basic Usage

```ts
import { container, forStores } from 'storion';
import { persistMiddleware } from 'storion/persist';

const app = container({
  middleware: forStores([
    persistMiddleware({
      handler: (ctx) => {
        const key = `storion:${ctx.displayName}`;
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
  filter?: (context: PersistContext) => boolean;
  
  // Filter which fields to persist
  fields?: (context: PersistContext) => string[];
  
  // Handler factory - creates load/save for each store
  handler: (context: PersistContext) => PersistHandler | Promise<PersistHandler>;
  
  // Handle errors during init, load, or save
  onError?: (error: unknown, op: 'init' | 'load' | 'save') => void;
  
  // Force hydration even for dirty state
  force?: boolean;
}
```

## Handler Pattern

The `handler` function receives a context and returns load/save operations. This enables:

1. **Shared closures** - Compute keys or open connections once per store
2. **Async initialization** - Open databases before creating handlers
3. **Encapsulation** - All persist logic in one place

```ts
persistMiddleware({
  handler: (ctx) => {
    // This runs once per store
    const key = `app:${ctx.displayName}`;
    
    return {
      load: () => JSON.parse(localStorage.getItem(key) || 'null'),
      save: (state) => localStorage.setItem(key, JSON.stringify(state)),
    };
  },
})
```

## Excluding Stores

### Using Filter

```ts
persistMiddleware({
  filter: (ctx) => ctx.displayName !== 'temporary',
  handler: (ctx) => ({ /* ... */ }),
});
```

### Using Meta

```ts
import { notPersisted } from 'storion/persist';

const tempStore = store({
  name: 'temp',
  state: { value: 0 },
  meta: [notPersisted()],  // Entire store excluded
});
```

## Excluding Fields

Use `notPersisted.for()` to exclude specific fields:

```ts
import { notPersisted } from 'storion/persist';

const userStore = store({
  name: 'user',
  state: {
    name: '',
    email: '',
    password: '',  // Sensitive!
    token: '',     // Sensitive!
  },
  meta: [
    notPersisted.for(['password', 'token']),  // Exclude these
  ],
});
```

## Async Handler (IndexedDB)

The handler can be async for database connections:

```ts
import { openDB } from 'idb';

persistMiddleware({
  handler: async (ctx) => {
    // Opens DB once per store
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
});
```

## Debouncing

Implement debouncing in the handler closure:

```ts
import { debounce } from 'lodash-es';

persistMiddleware({
  handler: (ctx) => {
    const key = `app:${ctx.displayName}`;
    const debouncedSave = debounce(
      (state) => localStorage.setItem(key, JSON.stringify(state)),
      300
    );
    
    return {
      load: () => JSON.parse(localStorage.getItem(key) || 'null'),
      save: debouncedSave,
    };
  },
});
```

## Error Handling

```ts
persistMiddleware({
  handler: (ctx) => ({ /* ... */ }),
  onError: (error, operation) => {
    if (operation === 'init') {
      console.error('Handler initialization failed:', error);
    } else if (operation === 'load') {
      console.error('Loading state failed:', error);
    } else {
      console.error('Saving state failed:', error);
    }
  },
});
```

## Force Hydration

By default, `hydrate()` skips "dirty" fields (modified since init). Use `force: true` to override:

```ts
persistMiddleware({
  handler: (ctx) => ({ /* ... */ }),
  force: true,  // Always apply persisted state
});
```
