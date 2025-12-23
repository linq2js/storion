# Persistence

Many apps need to persist state across sessions — user preferences, draft content, authentication tokens, or cached data. Storion provides a flexible persistence system that works with any storage backend.

## The Problem

Implementing persistence manually is error-prone:

```tsx
// ❌ Manual persistence - lots of boilerplate
function App() {
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('settings');
    return saved ? JSON.parse(saved) : defaultSettings;
  });

  useEffect(() => {
    localStorage.setItem('settings', JSON.stringify(settings));
  }, [settings]);

  // What about handling errors? Complex types? Selective persistence?
}
```

Storion's persistence middleware handles:

- **Automatic save/load** — State persists without manual code
- **Selective persistence** — Choose which stores/fields to persist
- **Complex types** — Handle `Date`, `Map`, `Set`, class instances
- **Error handling** — Graceful recovery from storage failures
- **Multiple backends** — localStorage, IndexedDB, AsyncStorage, custom

## Installation

```ts
import { persist, notPersisted } from "storion/persist";
```

## Basic Usage

Add the `persist` middleware to your container:

```ts
import { container, forStores } from "storion";
import { persist } from "storion/persist";

const app = container({
  middleware: forStores([
    persist({
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

**What happens:**

1. When a store is created, `load()` retrieves any saved state
2. The store hydrates with the loaded data
3. When state changes, `save()` persists the new state
4. Each store gets its own storage key based on `displayName`

## The Handler Pattern

The `handler` function receives a context and returns load/save operations. This pattern enables:

### Shared Closures

Compute keys or initialize connections once per store:

```ts
persist({
  handler: (ctx) => {
    // Runs once per store - compute key here
    const key = `app:${ctx.displayName}`;

    return {
      load: () => JSON.parse(localStorage.getItem(key) || "null"),
      save: (state) => localStorage.setItem(key, JSON.stringify(state)),
    };
  },
});
```

### Async Initialization

Open databases before creating handlers:

```ts
import { openDB } from "idb";

persist({
  handler: async (ctx) => {
    // Opens IndexedDB once per store
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

### Debounced Saves

Prevent excessive writes:

```ts
import { debounce } from "lodash-es";

persist({
  handler: (ctx) => {
    const key = `app:${ctx.displayName}`;

    // Debounce saves to max once per 300ms
    const debouncedSave = debounce(
      (state) => localStorage.setItem(key, JSON.stringify(state)),
      300
    );

    return {
      load: () => JSON.parse(localStorage.getItem(key) || "null"),
      save: debouncedSave,
    };
  },
});
```

## Excluding Stores

### Using Filter

Exclude stores based on name or other criteria:

```ts
persist({
  filter: (ctx) => {
    // Don't persist temporary stores
    if (ctx.displayName.startsWith("temp")) return false;
    // Don't persist UI-only stores
    if (ctx.displayName.endsWith("UI")) return false;
    return true;
  },
  handler: (ctx) => ({ /* ... */ }),
});
```

### Using Meta

Mark individual stores as not persisted:

```ts
import { notPersisted } from "storion/persist";

// This entire store is excluded from persistence
const tempStore = store({
  name: "temp",
  state: { value: 0 },
  meta: [notPersisted()], // Entire store excluded
});
```

## Excluding Fields

Some fields shouldn't be persisted (passwords, tokens, computed values). Use `notPersisted.for()`:

```ts
import { notPersisted } from "storion/persist";

const userStore = store({
  name: "user",
  state: {
    name: "",
    email: "",
    password: "", // Sensitive - don't persist!
    token: "", // Sensitive - don't persist!
    lastLogin: null, // Computed - don't persist!
  },
  meta: [
    notPersisted.for(["password", "token", "lastLogin"]),
  ],
});
```

**How it works:**

1. Persistence middleware reads the `notPersisted` meta
2. When saving, excluded fields are stripped from the state
3. When loading, excluded fields keep their initial values

## Complex Types

JavaScript has types that don't serialize to JSON: `Date`, `Map`, `Set`, class instances. Use `normalize` and `denormalize` in your store:

```ts
const sessionStore = store({
  name: "session",
  state: {
    lastLogin: null as Date | null,
    cache: new Map<string, unknown>(),
    permissions: new Set<string>(),
  },

  // Transform to JSON-safe format before saving
  normalize: (state) => ({
    lastLogin: state.lastLogin?.toISOString() ?? null,
    cache: Object.fromEntries(state.cache),
    permissions: Array.from(state.permissions),
  }),

  // Transform from JSON-safe format after loading
  denormalize: (data) => ({
    lastLogin: data.lastLogin ? new Date(data.lastLogin as string) : null,
    cache: new Map(Object.entries(data.cache as Record<string, unknown>)),
    permissions: new Set(data.permissions as string[]),
  }),

  setup({ state }) {
    return {
      login: () => {
        state.lastLogin = new Date();
      },
    };
  },
});
```

**Common type transformations:**

| Type      | Normalize                  | Denormalize                         |
| --------- | -------------------------- | ----------------------------------- |
| `Date`    | `.toISOString()`           | `new Date(str)`                     |
| `Map`     | `Object.fromEntries()`     | `new Map(Object.entries())`         |
| `Set`     | `Array.from()`             | `new Set(arr)`                      |
| `BigInt`  | `.toString()`              | `BigInt(str)`                       |
| Class     | `{ ...instance }`          | `Object.assign(new Class(), data)`  |

## Error Handling

Storage operations can fail (quota exceeded, storage disabled, corrupt data). Handle errors gracefully:

```ts
persist({
  handler: (ctx) => ({ /* ... */ }),
  onError: (error, operation) => {
    switch (operation) {
      case "init":
        console.error("Handler initialization failed:", error);
        break;
      case "load":
        console.error("Loading state failed:", error);
        // Could show user notification
        break;
      case "save":
        console.error("Saving state failed:", error);
        // Could queue for retry or show warning
        break;
    }
  },
});
```

**Error scenarios:**

| Operation | Common causes                                     |
| --------- | ------------------------------------------------- |
| `init`    | Database connection failed, permissions denied    |
| `load`    | Corrupt data, schema mismatch, storage cleared    |
| `save`    | Quota exceeded, storage disabled, network failure |

## Force Hydration

By default, `hydrate()` won't overwrite fields that have been modified since store creation (dirty fields). Use `force: true` to always apply persisted state:

```ts
persist({
  handler: (ctx) => ({ /* ... */ }),
  force: true, // Always apply persisted state, even over dirty fields
});
```

**When to use `force: true`:**

- Syncing state from server
- Restoring from backup
- When persisted state should always win

## Storage Backends

### localStorage (Browser)

```ts
persist({
  handler: (ctx) => {
    const key = `app:${ctx.displayName}`;
    return {
      load: () => JSON.parse(localStorage.getItem(key) || "null"),
      save: (state) => localStorage.setItem(key, JSON.stringify(state)),
    };
  },
});
```

### IndexedDB (Browser, larger data)

```ts
import { openDB } from "idb";

persist({
  handler: async (ctx) => {
    const db = await openDB("app", 1, {
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

### AsyncStorage (React Native)

```ts
import AsyncStorage from "@react-native-async-storage/async-storage";

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

### sessionStorage (Browser, per-tab)

```ts
persist({
  handler: (ctx) => {
    const key = `session:${ctx.displayName}`;
    return {
      load: () => JSON.parse(sessionStorage.getItem(key) || "null"),
      save: (state) => sessionStorage.setItem(key, JSON.stringify(state)),
    };
  },
});
```

## Complete Example

```ts
import { container, forStores } from "storion";
import { persist, notPersisted } from "storion/persist";
import { debounce } from "lodash-es";

const app = container({
  middleware: forStores([
    persist({
      // Only persist stores with 'persist' in their meta
      filter: (ctx) => !ctx.getMeta(notPersisted),

      handler: (ctx) => {
        const key = `myapp:${ctx.displayName}`;

        // Debounce saves
        const debouncedSave = debounce(
          (state) => {
            try {
              localStorage.setItem(key, JSON.stringify(state));
            } catch (e) {
              console.warn("Storage quota exceeded");
            }
          },
          500
        );

        return {
          load: () => {
            try {
              const data = localStorage.getItem(key);
              return data ? JSON.parse(data) : null;
            } catch (e) {
              console.warn("Failed to load state:", e);
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
  name: "user",
  state: {
    name: "",
    email: "",
    token: "", // Excluded below
    preferences: { theme: "light", language: "en" },
  },
  meta: [
    notPersisted.for("token"), // Don't persist auth token
  ],
  normalize: (state) => ({
    ...state,
    // Could transform complex types here
  }),
  setup({ state }) {
    return {
      setName: (name: string) => { state.name = name; },
      setTheme: (theme: string) => { state.preferences.theme = theme; },
    };
  },
});
```

## See Also

- **[store() API](/api/store)** — Store options including `normalize`/`denormalize`
- **[persist() API](/api/persist-middleware)** — Middleware options reference
- **[notPersisted](/api/not-persisted)** — Excluding stores and fields
- **[Meta](/api/meta)** — How meta entries work
