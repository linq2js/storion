# Persistence

Storion provides a `persistMiddleware` for automatic state persistence.

## Installation

```ts
import { persistMiddleware, notPersisted } from 'storion/persist';
```

## Basic Usage

```ts
import { container } from 'storion/react';
import { persistMiddleware } from 'storion/persist';

const app = container({
  middleware: [
    persistMiddleware({
      load: (spec) => {
        const key = `storion:${spec.displayName}`;
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
      },
      save: (spec, state) => {
        const key = `storion:${spec.displayName}`;
        localStorage.setItem(key, JSON.stringify(state));
      },
    }),
  ],
});
```

## Options

```ts
interface PersistOptions {
  // Filter which stores to persist
  filter?: (spec: StoreSpec) => boolean;
  
  // Load persisted state (sync or async)
  load?: (spec: StoreSpec) => object | null | Promise<object | null>;
  
  // Save state to storage
  save?: (spec: StoreSpec, state: object) => void;
  
  // Handle errors
  onError?: (spec: StoreSpec, error: unknown, op: 'load' | 'save') => void;
  
  // Force hydration even for dirty state
  force?: boolean;
}
```

## Excluding Stores

### Using Filter

```ts
persistMiddleware({
  filter: (spec) => spec.displayName !== 'temporary',
  // ...
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

## Async Loading

`load` can return a Promise:

```ts
persistMiddleware({
  load: async (spec) => {
    const db = await openIndexedDB();
    return db.get('stores', spec.displayName);
  },
  save: (spec, state) => {
    openIndexedDB().then(db => {
      db.put('stores', state, spec.displayName);
    });
  },
});
```

## Handling Empty State

When all fields are excluded, `save` receives `{}`. Handle as needed:

```ts
persistMiddleware({
  save: (spec, state) => {
    const key = `storion:${spec.displayName}`;
    
    if (Object.keys(state).length === 0) {
      localStorage.removeItem(key);  // Clean up
      return;
    }
    
    localStorage.setItem(key, JSON.stringify(state));
  },
});
```

## Force Hydration

By default, `hydrate()` skips "dirty" fields (modified since init). Use `force: true` to override:

```ts
persistMiddleware({
  force: true,  // Always apply persisted state
  // ...
});
```

