# Persistence

Many apps need to persist state across sessions — user preferences, draft content, authentication tokens, or cached data. Storion provides a flexible persistence system that works with any storage backend.

## Why Persist State?

**What's this for?** Understand when and why you need persistence.

Persistence improves user experience by:

- **Preserving work** — Draft content, form progress, unsaved changes
- **Remembering preferences** — Theme, language, layout settings
- **Speeding up loads** — Cached data, prefetched content
- **Maintaining sessions** — Auth tokens, user context (with caution)

Without a persistence system, you end up with scattered, error-prone code:

```tsx
// ❌ Manual persistence - lots of boilerplate, easy to forget
function App() {
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem('settings', JSON.stringify(settings));
  }, [settings]);

  // What about:
  // - Handling parse errors?
  // - Complex types (Date, Map)?
  // - Excluding sensitive fields?
  // - Multiple stores?
}
```

Storion's persistence middleware handles all of this declaratively.

---

## Installation

```ts
import { persist, persisted, notPersisted } from 'storion/persist';
```

---

## Basic Usage

**What's this for?** Get persistence working quickly.

Add the `persist` middleware to your container:

```ts
import { container, forStores } from 'storion';
import { persist } from 'storion/persist';

const app = container({
  middleware: forStores([
    persist({
      handler: (ctx) => {
        // ctx.displayName is the store's name
        const key = `storion:${ctx.displayName}`;
        
        return {
          // Called when store is created - return saved state or null
          load: () => {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
          },
          
          // Called when state changes - save the new state
          save: (state) => {
            localStorage.setItem(key, JSON.stringify(state));
          },
        };
      },
    }),
  ]),
});
```

**What happens:**

1. When a store is created, `load()` retrieves any saved state
2. The store hydrates with the loaded data (merges with initial state)
3. When state changes, `save()` persists the new state
4. Each store gets its own storage key based on `displayName`

---

## The Handler Pattern

**What's this for?** Understand the flexible handler architecture.

The `handler` function receives a context and returns load/save operations:

```ts
persist({
  handler: (ctx) => {
    // ctx contains:
    // - displayName: store name
    // - getMeta(type): query meta entries
    // - store: the store instance (after creation)
    
    return {
      load: () => { /* return saved state or null */ },
      save: (state) => { /* persist state */ },
    };
  },
});
```

### Shared Closures

Compute keys or initialize connections once per store:

```ts
persist({
  handler: (ctx) => {
    // This runs ONCE per store - great for setup
    const key = `app:${ctx.displayName}`;
    console.log(`Setting up persistence for ${ctx.displayName}`);

    return {
      load: () => JSON.parse(localStorage.getItem(key) || 'null'),
      save: (state) => localStorage.setItem(key, JSON.stringify(state)),
    };
  },
});
```

### Async Initialization

Open databases before creating handlers:

```ts
import { openDB } from 'idb';

persist({
  // Handler can be async - database opens before store is ready
  handler: async (ctx) => {
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

### Debounced Saves

Prevent excessive writes during rapid updates:

```ts
import { debounce } from 'lodash-es';

persist({
  handler: (ctx) => {
    const key = `app:${ctx.displayName}`;

    // Save at most once every 300ms
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

---

## Excluding Stores

**What's this for?** Keep certain stores from being persisted at all.

### Using Filter

Exclude stores based on name or other criteria:

```ts
persist({
  filter: (ctx) => {
    // Don't persist temporary stores
    if (ctx.displayName.startsWith('temp')) return false;
    // Don't persist UI-only stores
    if (ctx.displayName.endsWith('UI')) return false;
    return true;
  },
  handler: (ctx) => ({ /* ... */ }),
});
```

### Using Meta

Mark individual stores as not persisted:

```ts
import { notPersisted } from 'storion/persist';

// This entire store is excluded from persistence
const modalStore = store({
  name: 'modal',
  state: { isOpen: false, content: null },
  meta: notPersisted(),  // Entire store excluded
  setup({ state }) {
    return {
      open: (content: any) => { state.isOpen = true; state.content = content; },
      close: () => { state.isOpen = false; state.content = null; },
    };
  },
});
```

---

## Excluding Fields

**What's this for?** Persist most of a store but exclude sensitive or computed fields.

Some fields shouldn't be persisted (passwords, tokens, computed values). Use `notPersisted.for()`:

```ts
import { notPersisted } from 'storion/persist';

const userStore = store({
  name: 'user',
  state: {
    name: '',           // ✅ Persist
    email: '',          // ✅ Persist
    password: '',       // ❌ Sensitive - don't persist!
    token: '',          // ❌ Sensitive - don't persist!
    lastLogin: null,    // ❌ Computed - don't persist!
  },
  // Exclude these fields from persistence
  meta: notPersisted.for(['password', 'token', 'lastLogin']),
  setup({ state }) {
    return { /* actions */ };
  },
});
```

**How it works:**

1. Persistence middleware reads the `notPersisted` meta
2. When saving, excluded fields are stripped from the state
3. When loading, excluded fields keep their initial values

---

## Opt-In Persistence

**What's this for?** Only persist stores that explicitly request it.

By default, all stores are persisted. In large apps, you may want the opposite: only persist stores that explicitly opt in using `persisted` meta.

### Enable Opt-In Mode

```ts
import { persist, persisted } from 'storion/persist';

const app = container({
  middleware: forStores([
    persist({
      persistedOnly: true,  // Only persist stores with `persisted` meta
      handler: (ctx) => ({
        load: () => JSON.parse(localStorage.getItem(ctx.displayName) || 'null'),
        save: (state) => localStorage.setItem(ctx.displayName, JSON.stringify(state)),
      }),
    }),
  ]),
});
```

### Mark Stores for Persistence

```ts
import { persisted, notPersisted } from 'storion/persist';

// ✅ This store WILL be persisted (store-level opt-in)
const userStore = store({
  name: 'user',
  state: { name: '', email: '', avatar: '' },
  meta: persisted(),  // All fields persisted
  setup: () => ({}),
});

// ✅ This store WILL be persisted (field-level opt-in)
const settingsStore = store({
  name: 'settings',
  state: { theme: 'light', fontSize: 14, cache: {} },
  meta: persisted.for(['theme', 'fontSize']),  // Only these fields
  setup: () => ({}),
});

// ❌ This store will NOT be persisted (no persisted meta)
const uiStore = store({
  name: 'ui',
  state: { sidebarOpen: true, modal: null },
  setup: () => ({}),
});
```

### Filtering Priority

When both `persisted` and `notPersisted` are present, `notPersisted` always wins:

```ts
const mixedStore = store({
  name: 'mixed',
  state: { name: '', password: '', token: '' },
  meta: meta.of(
    persisted(),                          // All fields should persist
    notPersisted.for(['password', 'token']), // Except these!
  ),
});
// Result: Only 'name' is persisted
```

**Full priority order:**

1. `notPersisted` — Always excludes (highest priority)
2. `persistedOnly` — Skips stores without `persisted` meta
3. `filter` option — Your custom filter function

### When to Use Opt-In Mode

| Scenario | Approach |
|----------|----------|
| Large app, few stores need persistence | Use `persistedOnly: true` |
| Most stores need persistence | Use default + `notPersisted` for exceptions |
| Security/compliance requires explicit marking | Use `persistedOnly: true` |
| Simple app with few stores | Use default (simpler) |

---

## Complex Types

**What's this for?** Handle types that don't serialize to JSON.

JavaScript has types that don't survive `JSON.stringify`: `Date`, `Map`, `Set`, class instances. Use `normalize` and `denormalize` in your store:

```ts
const sessionStore = store({
  name: 'session',
  state: {
    lastLogin: null as Date | null,
    cache: new Map<string, unknown>(),
    permissions: new Set<string>(),
  },

  // Transform to JSON-safe format BEFORE saving
  normalize: (state) => ({
    lastLogin: state.lastLogin?.toISOString() ?? null,
    cache: Object.fromEntries(state.cache),
    permissions: Array.from(state.permissions),
  }),

  // Transform from JSON-safe format AFTER loading
  denormalize: (data) => ({
    lastLogin: data.lastLogin ? new Date(data.lastLogin as string) : null,
    cache: new Map(Object.entries(data.cache as Record<string, unknown>)),
    permissions: new Set(data.permissions as string[]),
  }),

  setup({ state }) {
    return {
      login: () => { state.lastLogin = new Date(); },
      addPermission: (perm: string) => { state.permissions.add(perm); },
    };
  },
});
```

**Common type transformations:**

| Type | Normalize | Denormalize |
|------|-----------|-------------|
| `Date` | `.toISOString()` | `new Date(str)` |
| `Map` | `Object.fromEntries()` | `new Map(Object.entries())` |
| `Set` | `Array.from()` | `new Set(arr)` |
| `BigInt` | `.toString()` | `BigInt(str)` |
| Class | `{ ...instance }` | `Object.assign(new Class(), data)` |

---

## Error Handling

**What's this for?** Handle storage failures gracefully.

Storage operations can fail (quota exceeded, storage disabled, corrupt data):

```ts
persist({
  handler: (ctx) => ({ /* ... */ }),
  
  onError: (error, operation) => {
    switch (operation) {
      case 'init':
        // Handler initialization failed
        console.error('Persistence init failed:', error);
        break;
        
      case 'load':
        // Loading saved state failed
        console.error('Loading state failed:', error);
        // Could show user notification or use defaults
        break;
        
      case 'save':
        // Saving state failed
        console.error('Saving state failed:', error);
        // Could queue for retry or warn user
        break;
    }
  },
});
```

**Common error scenarios:**

| Operation | Common Causes |
|-----------|---------------|
| `init` | Database connection failed, permissions denied |
| `load` | Corrupt data, schema mismatch, storage cleared |
| `save` | Quota exceeded, storage disabled, network failure |

---

## Force Hydration

**What's this for?** Control how persisted state merges with current state.

By default, `hydrate()` won't overwrite fields that have been modified since store creation (dirty fields). Use `force: true` to always apply persisted state:

```ts
persist({
  handler: (ctx) => ({ /* ... */ }),
  force: true,  // Always apply persisted state, even over dirty fields
});
```

**When to use `force: true`:**

- Syncing state from a server
- Restoring from a backup
- When persisted state should always win

---

## Storage Backends

**What's this for?** Choose the right storage for your use case.

### localStorage (Browser)

```ts
persist({
  handler: (ctx) => {
    const key = `app:${ctx.displayName}`;
    return {
      load: () => JSON.parse(localStorage.getItem(key) || 'null'),
      save: (state) => localStorage.setItem(key, JSON.stringify(state)),
    };
  },
});
```

**Limits:** ~5MB, synchronous, string-only values.

### sessionStorage (Browser, per-tab)

```ts
persist({
  handler: (ctx) => {
    const key = `session:${ctx.displayName}`;
    return {
      load: () => JSON.parse(sessionStorage.getItem(key) || 'null'),
      save: (state) => sessionStorage.setItem(key, JSON.stringify(state)),
    };
  },
});
```

**Limits:** ~5MB, cleared when tab closes.

### IndexedDB (Browser, larger data)

```ts
import { openDB } from 'idb';

persist({
  handler: async (ctx) => {
    const db = await openDB('app', 1, {
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

**Limits:** Usually 50MB+, async, structured data.

### AsyncStorage (React Native)

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

persist({
  handler: (ctx) => {
    const key = `@app:${ctx.displayName}`;
    return {
      load: async () => {
        const data = await AsyncStorage.getItem(key);
        return data ? JSON.parse(data) : null;
      },
      save: async (state) => {
        await AsyncStorage.setItem(key, JSON.stringify(state));
      },
    };
  },
});
```

---

## Common Mistakes

**What's this for?** Avoid frequent pitfalls with persistence.

### 1. Persisting Sensitive Data

```ts
// ❌ Wrong - token persisted in localStorage (visible to any script)
const authStore = store({
  name: 'auth',
  state: { user: null, token: '' },
});

// ✅ Correct - exclude sensitive fields
const authStore = store({
  name: 'auth',
  state: { user: null, token: '' },
  meta: notPersisted.for('token'),
});
```

### 2. Forgetting normalize/denormalize for Complex Types

```ts
// ❌ Wrong - Date becomes string after load
const store = store({
  state: { createdAt: new Date() },
});
// After load: createdAt is "2024-01-01T00:00:00.000Z" (string!)

// ✅ Correct - transform on load
const store = store({
  state: { createdAt: new Date() },
  normalize: (s) => ({ createdAt: s.createdAt.toISOString() }),
  denormalize: (d) => ({ createdAt: new Date(d.createdAt as string) }),
});
```

### 3. Not Handling Schema Changes

```ts
// User updates app, but old data has different structure
// ✅ Defensive denormalize
const store = store({
  state: { items: [], version: 2 },
  denormalize: (data) => {
    // Handle missing or old fields
    if (!data.version || data.version < 2) {
      // Migrate old data or return defaults
      return { items: [], version: 2 };
    }
    return data;
  },
});
```

### 4. Excessive Saves

```ts
// ❌ Wrong - saves on every keystroke
persist({
  handler: (ctx) => ({
    save: (state) => localStorage.setItem(key, JSON.stringify(state)),
  }),
});

// ✅ Correct - debounce saves
import { debounce } from 'lodash-es';

persist({
  handler: (ctx) => ({
    save: debounce((state) => 
      localStorage.setItem(key, JSON.stringify(state)), 
      300
    ),
  }),
});
```

---

## Recipes: Persistence Patterns

**What's this for?** Copy-paste solutions for common scenarios.

### Recipe: Versioned State

Handle schema migrations:

```ts
const CURRENT_VERSION = 3;

const settingsStore = store({
  name: 'settings',
  state: {
    version: CURRENT_VERSION,
    theme: 'light',
    fontSize: 14,
    notifications: { email: true, push: true },
  },
  
  denormalize: (data) => {
    const version = (data.version as number) || 1;
    
    // Migrate from v1
    if (version < 2) {
      data.notifications = { email: true, push: true };
    }
    
    // Migrate from v2
    if (version < 3) {
      data.fontSize = 14;
    }
    
    return { ...data, version: CURRENT_VERSION };
  },
});
```

### Recipe: Encrypted Storage

Encrypt sensitive data before persisting:

```ts
import CryptoJS from 'crypto-js';

const SECRET_KEY = process.env.ENCRYPTION_KEY!;

persist({
  handler: (ctx) => {
    const key = `secure:${ctx.displayName}`;
    
    return {
      load: () => {
        const encrypted = localStorage.getItem(key);
        if (!encrypted) return null;
        
        const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
        const decrypted = bytes.toString(CryptoJS.enc.Utf8);
        return JSON.parse(decrypted);
      },
      
      save: (state) => {
        const encrypted = CryptoJS.AES.encrypt(
          JSON.stringify(state),
          SECRET_KEY
        ).toString();
        localStorage.setItem(key, encrypted);
      },
    };
  },
});
```

### Recipe: Cross-Tab Sync

Sync state across browser tabs:

```ts
persist({
  handler: (ctx) => {
    const key = `sync:${ctx.displayName}`;
    
    // Listen for changes from other tabs
    window.addEventListener('storage', (e) => {
      if (e.key === key && e.newValue) {
        ctx.store.hydrate(JSON.parse(e.newValue), { force: true });
      }
    });
    
    return {
      load: () => JSON.parse(localStorage.getItem(key) || 'null'),
      save: (state) => localStorage.setItem(key, JSON.stringify(state)),
    };
  },
});
```

---

## Complete Example

```ts
import { container, forStores } from 'storion';
import { persist, notPersisted } from 'storion/persist';
import { debounce } from 'lodash-es';

const app = container({
  middleware: forStores([
    persist({
      // Skip stores marked with notPersisted()
      filter: (ctx) => !ctx.getMeta(notPersisted),

      handler: (ctx) => {
        const key = `myapp:${ctx.displayName}`;

        // Debounce saves to max once per 500ms
        const debouncedSave = debounce((state) => {
            try {
              localStorage.setItem(key, JSON.stringify(state));
            } catch (e) {
            console.warn('Storage quota exceeded');
            }
        }, 500);

        return {
          load: () => {
            try {
              const data = localStorage.getItem(key);
              return data ? JSON.parse(data) : null;
            } catch (e) {
              console.warn('Failed to load state:', e);
              return null;
            }
          },
          save: debouncedSave,
        };
      },

      onError: (error, op) => {
        console.error(`Persistence ${op} failed:`, error);
      },
    }),
  ]),
});

// User store with selective persistence
const userStore = store({
  name: 'user',
  state: {
    name: '',
    email: '',
    token: '',  // Excluded below
    preferences: { theme: 'light', language: 'en' },
  },
  meta: notPersisted.for('token'),  // Don't persist auth token
  setup({ state }) {
    return {
      setName: (name: string) => { state.name = name; },
      setTheme: (theme: string) => { state.preferences.theme = theme; },
    };
  },
});
```

---

## See Also

- **[store() API](/api/store)** — Store options including `normalize`/`denormalize`
- **[persist() API](/api/persist-middleware)** — Middleware options reference
- **[persisted](/api/persisted)** — Opt-in persistence meta
- **[notPersisted](/api/not-persisted)** — Excluding stores and fields
- **[Meta](/guide/meta)** — How meta entries work
- **[Middleware](/guide/middleware)** — How middleware works
