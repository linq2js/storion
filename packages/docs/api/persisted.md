# persisted

Meta type for marking stores or fields for opt-in persistence.

## Signature

```ts
import { persisted } from 'storion/persist';

// Store-level - mark entire store for persistence
persisted()

// Field-level - mark specific fields for persistence
persisted.for('fieldName')
persisted.for(['field1', 'field2'])
```

## Usage

The `persisted` meta works with `persistedOnly: true` option in [`persist()`](/api/persist-middleware) middleware. When opt-in mode is enabled, only stores/fields with `persisted` meta are persisted.

### Store-Level Persistence

Mark the entire store for persistence:

```ts
import { store } from 'storion';
import { persisted } from 'storion/persist';

const userStore = store({
  name: 'user',
  state: { name: '', email: '', avatar: '' },
  meta: persisted(),  // All fields will be persisted
  setup: () => ({}),
});
```

### Field-Level Persistence

Mark only specific fields for persistence:

```ts
import { store } from 'storion';
import { persisted } from 'storion/persist';

const settingsStore = store({
  name: 'settings',
  state: { 
    theme: 'light',      // Will be persisted
    fontSize: 14,        // Will be persisted
    cache: {},           // Will NOT be persisted
  },
  meta: persisted.for(['theme', 'fontSize']),
  setup: () => ({}),
});
```

## Enable Opt-In Mode

The `persisted` meta only has effect when `persistedOnly: true` is set:

```ts
import { container, forStores } from 'storion';
import { persist, persisted } from 'storion/persist';

const app = container({
  middleware: forStores([
    persist({
      persistedOnly: true,  // Enable opt-in mode
      handler: (ctx) => ({
        load: () => JSON.parse(localStorage.getItem(ctx.displayName) || 'null'),
        save: (state) => localStorage.setItem(ctx.displayName, JSON.stringify(state)),
      }),
    }),
  ]),
});
```

## Priority with notPersisted

When both `persisted` and `notPersisted` are present, `notPersisted` always takes priority:

```ts
import { persisted, notPersisted } from 'storion/persist';

const userStore = store({
  name: 'user',
  state: { name: '', password: '', token: '' },
  meta: meta.of(
    persisted(),                          // All fields opted in
    notPersisted.for(['password', 'token']), // But these are excluded
  ),
});
// Result: Only 'name' is persisted
```

**Filtering priority (highest to lowest):**

1. `notPersisted` — Always excludes
2. `persistedOnly` — Requires `persisted` meta
3. `filter` option — Custom filter function

## When to Use

| Scenario | Recommendation |
|----------|----------------|
| Large app with many stores | Use `persistedOnly: true` + `persisted` |
| Most stores need persistence | Use default + `notPersisted` for exceptions |
| Security/compliance requirements | Use `persistedOnly: true` for explicit opt-in |
| Simple app | Use default mode (simpler) |

## See Also

- [persist()](/api/persist-middleware) - Persistence middleware
- [notPersisted](/api/not-persisted) - Excluding from persistence
- [Persistence Guide](/guide/persistence) - Complete persistence guide

