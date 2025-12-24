# Stores

Stores are the core building block of Storion. They encapsulate related state and the actions that modify it, creating a self-contained unit of application logic.

**Time to read:** ~15 minutes

---

## The Problem Stores Solve

Traditional React state management often leads to:

| Problem               | What Happens                                         |
| --------------------- | ---------------------------------------------------- |
| **Scattered state**   | Related data spread across multiple `useState` hooks |
| **Prop drilling**     | Passing state through many component layers          |
| **Unclear ownership** | Who is responsible for updating what?                |
| **Difficult testing** | State tied to component lifecycle                    |

### Before: Scattered State

```tsx
// ❌ PROBLEM: State and logic scattered across components
function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Logic mixed with UI concerns
  const login = async (credentials) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.login(credentials);
      setUser(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Must pass everything down through props
  return <LoginForm onLogin={login} loading={loading} error={error} />;
}
```

### After: Self-Contained Store

```ts
// ✅ SOLUTION: Everything in one place
const userStore = store({
  name: "user",
  state: {
    user: null as User | null,
    loading: false,
    error: null as string | null,
  },
  setup({ state }) {
    return {
      login: async (credentials: Credentials) => {
        state.loading = true;
        state.error = null;
        try {
          state.user = await api.login(credentials);
        } catch (e) {
          state.error = e.message;
        } finally {
          state.loading = false;
        }
      },
    };
  },
});

// Component just uses it — no prop drilling!
function LoginForm() {
  const { login, loading, error } = useStore(({ get }) => {
    const [state, actions] = get(userStore);
    return {
      login: actions.login,
      loading: state.loading,
      error: state.error,
    };
  });

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className="error">{error}</p>}
      <button disabled={loading}>{loading ? "Logging in..." : "Login"}</button>
    </form>
  );
}
```

---

## Defining Your First Store

Here's the anatomy of a store with detailed explanations:

```ts
import { store } from "storion/react";

const userStore = store({
  // ═══════════════════════════════════════════════════════════════════════════
  // NAME (required)
  // ═══════════════════════════════════════════════════════════════════════════
  // Unique identifier for debugging. Shows in DevTools and error messages.
  // Convention: use camelCase + "Store" suffix
  name: "user",

  // ═══════════════════════════════════════════════════════════════════════════
  // STATE (required)
  // ═══════════════════════════════════════════════════════════════════════════
  // Initial data structure. Storion wraps this in a reactive Proxy.
  // Any changes to these properties notify subscribers.
  state: {
    /** User profile information */
    profile: null as User | null,

    /** Whether an async operation is in progress */
    loading: false,

    /** Last error message, if any */
    error: null as string | null,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SETUP (required)
  // ═══════════════════════════════════════════════════════════════════════════
  // Runs ONCE when the store is first accessed. Receives context with utilities.
  // Returns an object containing actions that can modify state.
  setup({ state, update, get, create, focus, onDispose }) {
    // ┌─────────────────────────────────────────────────────────────────────
    // │ state: Reactive proxy of your state. Mutations here trigger updates.
    // │ update: For nested mutations (Immer-style draft)
    // │ get: Access other stores and services (cached)
    // │ create: Create fresh service instances with parameters
    // │ focus: Create getter/setter for a specific state path
    // │ onDispose: Register cleanup callbacks
    // └─────────────────────────────────────────────────────────────────────

    return {
      // Actions are just functions that modify state
      /** Set the user profile */
      setProfile: (user: User) => {
        state.profile = user;
      },

      /** Clear all user data */
      logout: () => {
        state.profile = null;
        state.error = null;
      },
    };
  },
});
```

### Key Concepts

| Property | Type       | Purpose                                         |
| -------- | ---------- | ----------------------------------------------- |
| `name`   | `string`   | Debugging identifier (DevTools, error messages) |
| `state`  | `object`   | Initial data — becomes reactive automatically   |
| `setup`  | `function` | Runs once on creation, returns actions          |

---

## State and Initial Values

### Typing State

Let TypeScript infer types from your initial values:

```ts
const counterStore = store({
  name: "counter",
  state: {
    count: 0, // inferred as: number
    name: "", // inferred as: string
    items: [] as Item[], // type assertion for arrays
    user: null as User | null, // nullable types
    config: {
      // nested objects work too
      theme: "light" as "light" | "dark",
      fontSize: 14,
    },
  },
});
```

::: tip Use inline comments for documentation
JSDoc comments on state properties appear in autocomplete:

```ts
state: {
  /** Current counter value */
  count: 0,
  /** User's display name */
  name: '',
}
```

:::

---

## Actions (Functions that Change State)

Actions are returned from `setup()`. They're the only way to modify state.

### Basic Actions

```ts
setup({ state }) {
  return {
    // ┌─────────────────────────────────────────────────────────────────────
    // │ Simple setter: Just assign to state properties
    // │ Storion's Proxy intercepts this and notifies subscribers
    // └─────────────────────────────────────────────────────────────────────
    setName: (name: string) => {
      state.name = name
    },

    // ┌─────────────────────────────────────────────────────────────────────
    // │ Toggle: Read current value, write new value
    // └─────────────────────────────────────────────────────────────────────
    toggleDarkMode: () => {
      state.darkMode = !state.darkMode
    },

    // ┌─────────────────────────────────────────────────────────────────────
    // │ Reset: Set multiple properties at once
    // └─────────────────────────────────────────────────────────────────────
    reset: () => {
      state.name = ''
      state.count = 0
      state.items = []
    },
  }
}
```

### Actions with Parameters

```ts
setup({ state }) {
  return {
    // Single parameter
    setCount: (value: number) => {
      state.count = value
    },

    // Multiple parameters
    updateProfile: (name: string, email: string) => {
      state.name = name
      state.email = email
    },

    // Object parameter (for many values)
    setConfig: (config: Partial<Config>) => {
      state.theme = config.theme ?? state.theme
      state.fontSize = config.fontSize ?? state.fontSize
    },
  }
}
```

### Async Actions

```ts
setup({ state }) {
  return {
    // ┌─────────────────────────────────────────────────────────────────────
    // │ Async actions work naturally — just use async/await
    // │ State changes trigger re-renders immediately
    // └─────────────────────────────────────────────────────────────────────
    fetchUser: async (id: string) => {
      state.loading = true
      state.error = null

      try {
        const user = await api.getUser(id)
        state.user = user
      } catch (error) {
        state.error = error.message
      } finally {
        state.loading = false
      }
    },

    // ┌─────────────────────────────────────────────────────────────────────
    // │ Actions can call other actions
    // └─────────────────────────────────────────────────────────────────────
    refreshUser: async () => {
      const currentId = state.user?.id
      if (currentId) {
        await actions.fetchUser(currentId)
      }
    },
  }
}
```

---

## Direct Mutation vs `update()`

This is the most important concept to understand about Storion.

### Rule: Direct Mutation Only Works at First Level

```ts
setup({ state }) {
  return {
    // ✅ WORKS: First-level property assignment
    setName: (name: string) => {
      state.name = name  // Direct mutation — triggers reactivity
    },

    // ❌ BROKEN: Nested property assignment
    setProfileName: (name: string) => {
      state.profile.name = name  // Won't trigger re-renders!
    },

    // ❌ BROKEN: Array methods on nested arrays
    addItem: (item: Item) => {
      state.items.push(item)  // Won't trigger re-renders!
    },
  }
}
```

### Why This Happens

Storion tracks changes at the first level of your state object. When you write `state.name = 'Alice'`, Storion sees the assignment and notifies subscribers. But `state.profile.name = 'Alice'` modifies a nested object — Storion doesn't see it.

### Solution: Use `update()` for Nested Changes

```ts
setup({ state, update }) {
  return {
    // ✅ WORKS: Use update() for nested changes
    setProfileName: (name: string) => {
      update(draft => {
        draft.profile.name = name  // Immer-style draft
      })
    },

    // ✅ WORKS: Array modifications
    addItem: (item: Item) => {
      update(draft => {
        draft.items.push(item)
      })
    },

    // ✅ WORKS: Complex nested updates
    updateSettings: (settings: Partial<Settings>) => {
      update(draft => {
        Object.assign(draft.user.settings, settings)
      })
    },
  }
}
```

### `update()` Patterns

```ts
setup({ state, update }) {
  return {
    // ═══════════════════════════════════════════════════════════════════════
    // Pattern 1: Draft function (most common)
    // ═══════════════════════════════════════════════════════════════════════
    addTodo: (text: string) => {
      update(draft => {
        draft.todos.push({
          id: crypto.randomUUID(),
          text,
          done: false,
        })
      })
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Pattern 2: Partial object (shallow merge at root level)
    // ═══════════════════════════════════════════════════════════════════════
    resetDefaults: () => {
      update({
        count: 0,
        name: 'Default',
        items: [],
      })
    },

    // ═══════════════════════════════════════════════════════════════════════
    // Pattern 3: update.action() — creates a reusable action
    // ═══════════════════════════════════════════════════════════════════════
    increment: update.action(draft => {
      draft.count++
    }),

    // ═══════════════════════════════════════════════════════════════════════
    // Pattern 4: update.action() with parameters
    // ═══════════════════════════════════════════════════════════════════════
    setCount: update.action((draft, value: number) => {
      draft.count = value
    }),

    // ═══════════════════════════════════════════════════════════════════════
    // Pattern 5: Multiple mutations in one update (batched)
    // ═══════════════════════════════════════════════════════════════════════
    completeAll: () => {
      update(draft => {
        for (const todo of draft.todos) {
          todo.done = true
        }
      })
    },
  }
}
```

### When to Use Which

| Scenario                    | Use                                             |
| --------------------------- | ----------------------------------------------- |
| Simple first-level property | Direct mutation: `state.count = 5`              |
| Nested object property      | `update(draft => { draft.user.name = '...' })`  |
| Array push/pop/splice       | `update(draft => { draft.items.push(...) })`    |
| Multiple changes at once    | `update(draft => { ... multiple changes ... })` |

---

## Focus (Lens-like Access)

`focus()` creates a getter/setter pair for any state path. Useful when you frequently access the same nested path.

```ts
setup({ focus }) {
  // ┌─────────────────────────────────────────────────────────────────────
  // │ focus() returns [getter, setter] tuple for a path
  // │ Path is type-safe — TypeScript validates it matches your state shape
  // └─────────────────────────────────────────────────────────────────────
  const [getName, setName] = focus('profile.name')
  const [getItems, setItems] = focus('cart.items')

  return {
    // Use getter to read current value
    getName,

    // Use setter directly as an action
    setName,

    // Setter with transform function
    uppercaseName: () => {
      setName(current => current.toUpperCase())
    },

    // Setter with draft function (for objects/arrays)
    addItem: (item: Item) => {
      setItems(draft => {
        draft.push(item)
      })
    },
  }
}
```

### Focus Setter Patterns

| Pattern      | Example                                   | Use Case              |
| ------------ | ----------------------------------------- | --------------------- |
| Direct value | `setName('Alice')`                        | Replace entirely      |
| Reducer      | `setCount(n => n + 1)`                    | Compute from previous |
| Producer     | `setItems(draft => { draft.push(item) })` | Nested mutations      |

### Why Use Focus?

1. **Type-safe paths** — TypeScript validates the path string
2. **Reusable accessors** — Define once, use in multiple actions
3. **Cleaner code** — Avoid repeating `state.deeply.nested.value`

---

## Cross-Store Dependencies

Stores can depend on other stores using `get()`:

```ts
const cartStore = store({
  name: "cart",
  state: { items: [] as CartItem[] },
  setup({ state, get }) {
    // ┌─────────────────────────────────────────────────────────────────────
    // │ get() returns [state, actions] from another store
    // │ The state is reactive — always has the latest values
    // └─────────────────────────────────────────────────────────────────────
    const [userState, userActions] = get(userStore);

    // ┌─────────────────────────────────────────────────────────────────────
    // │ Can also access services
    // └─────────────────────────────────────────────────────────────────────
    const api = get(apiService);

    return {
      checkout: async () => {
        // Use user state in cart logic
        if (!userState.isLoggedIn) {
          throw new Error("Must be logged in to checkout");
        }

        await api.checkout({
          userId: userState.profile.id,
          items: state.items,
        });
      },

      addItem: (item: CartItem) => {
        // Track analytics using user ID
        analytics.track("add_to_cart", {
          userId: userState.profile?.id,
          itemId: item.id,
        });
        state.items = [...state.items, item];
      },
    };
  },
});
```

### ⚠️ Important: `get()` is Setup-Time Only

```ts
setup({ get }) {
  // ✅ CORRECT: Call get() during setup
  const [userState, userActions] = get(userStore)

  return {
    doSomething: () => {
      // ❌ WRONG: Cannot call get() inside actions — will throw!
      // const [other] = get(otherStore)

      // ✅ CORRECT: Use the captured reference (always has latest values)
      console.log(userState.name)  // Latest value from userStore
    },
  }
}
```

---

## Store Lifecycle

### Lifetime Options

```ts
// Default: Store lives until container is disposed
const globalStore = store({
  lifetime: "keepAlive", // default
  // ...
});

// Store disposes when no components are subscribed
const sessionStore = store({
  lifetime: "autoDispose",
  // ...
});
```

| Lifetime      | When to Use                                                |
| ------------- | ---------------------------------------------------------- |
| `keepAlive`   | Global state (auth, settings), navigation-persistent state |
| `autoDispose` | Feature-specific state, modals, wizards, temporary UI      |

::: warning Dependency Rules
A `keepAlive` store cannot depend on an `autoDispose` store:

```ts
// ❌ This will throw an error
const globalStore = store({
  lifetime: "keepAlive",
  setup({ get }) {
    get(autoDisposeStore); // THROWS: Lifetime mismatch!
  },
});
```

:::

### Cleanup with `onDispose`

Register cleanup callbacks for subscriptions, timers, etc:

```ts
setup({ state, onDispose }) {
  // Set up subscription
  const unsubscribe = api.subscribe('updates', (data) => {
    state.data = data
  })

  // Set up timer
  const intervalId = setInterval(() => {
    state.tick++
  }, 1000)

  // Register cleanup — called when store is disposed
  onDispose(() => {
    unsubscribe()
    clearInterval(intervalId)
  })

  return { /* actions */ }
}
```

---

## Common Mistakes

### ❌ Nested Mutation (The #1 Bug)

```ts
// ❌ WRONG: Won't trigger reactivity
state.profile.name = "John";
state.items.push(newItem);

// ✅ CORRECT: Use update()
update((draft) => {
  draft.profile.name = "John";
  draft.items.push(newItem);
});
```

### ❌ Calling `get()` Inside Actions

```ts
// ❌ WRONG: get() inside action throws
setup({ get }) {
  return {
    doSomething: () => {
      const [other] = get(otherStore)  // THROWS!
    },
  }
}

// ✅ CORRECT: Call get() at setup time
setup({ get }) {
  const [other] = get(otherStore)  // Fine here
  return {
    doSomething: () => {
      console.log(other.value)  // Use captured reference
    },
  }
}
```

### ❌ Returning Entire State in Actions

```ts
// ❌ WRONG: Don't return state from actions
return {
  getState: () => state, // Exposes internal proxy
};

// ✅ CORRECT: Return specific values
return {
  getData: () => ({ name: state.name, count: state.count }),
};
```

---

## Recipes: Common Store Patterns

### Pattern 1: Loading/Error State

```ts
const dataStore = store({
  name: "data",
  state: {
    data: null as Data | null,
    loading: false,
    error: null as Error | null,
  },
  setup({ state }) {
    return {
      fetch: async () => {
        state.loading = true;
        state.error = null;
        try {
          state.data = await api.getData();
        } catch (e) {
          state.error = e as Error;
        } finally {
          state.loading = false;
        }
      },
    };
  },
});
```

### Pattern 2: CRUD Operations

```ts
const todosStore = store({
  name: "todos",
  state: { items: [] as Todo[] },
  setup({ state, update }) {
    return {
      add: (text: string) => {
        update((draft) => {
          draft.items.push({
            id: crypto.randomUUID(),
            text,
            done: false,
          });
        });
      },

      toggle: (id: string) => {
        update((draft) => {
          const todo = draft.items.find((t) => t.id === id);
          if (todo) todo.done = !todo.done;
        });
      },

      remove: (id: string) => {
        state.items = state.items.filter((t) => t.id !== id);
      },

      clearCompleted: () => {
        state.items = state.items.filter((t) => !t.done);
      },
    };
  },
});
```

### Pattern 3: Form State

```ts
const formStore = store({
  name: "form",
  lifetime: "autoDispose", // Clean up when form unmounts
  state: {
    values: { name: "", email: "" },
    errors: {} as Record<string, string>,
    touched: {} as Record<string, boolean>,
    submitting: false,
  },
  setup({ state, update }) {
    return {
      setField: (field: string, value: string) => {
        update((draft) => {
          draft.values[field] = value;
          draft.touched[field] = true;
          delete draft.errors[field]; // Clear error on change
        });
      },

      validate: () => {
        const errors: Record<string, string> = {};
        if (!state.values.name) errors.name = "Required";
        if (!state.values.email) errors.email = "Required";
        state.errors = errors;
        return Object.keys(errors).length === 0;
      },

      submit: async () => {
        if (!actions.validate()) return;

        state.submitting = true;
        try {
          await api.submit(state.values);
        } finally {
          state.submitting = false;
        }
      },

      reset: () => {
        state.values = { name: "", email: "" };
        state.errors = {};
        state.touched = {};
      },
    };
  },
});
```

---

## Store Options Reference

```ts
const myStore = store({
  // ═══════════════════════════════════════════════════════════════════════════
  // REQUIRED
  // ═══════════════════════════════════════════════════════════════════════════
  name: "myStore",
  state: {
    /* initial state */
  },
  setup(ctx) {
    return {
      /* actions */
    };
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONAL: Lifecycle
  // ═══════════════════════════════════════════════════════════════════════════
  lifetime: "keepAlive", // or 'autoDispose'

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONAL: Custom equality per field
  // ═══════════════════════════════════════════════════════════════════════════
  equality: {
    items: "shallow", // Shallow compare arrays
    config: "deep", // Deep compare objects
    custom: (a, b) => a.id === b.id, // Custom comparator
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONAL: Metadata for middleware
  // ═══════════════════════════════════════════════════════════════════════════
  meta: [
    persist(), // Mark for persistence
    logged(), // Mark for logging
  ],

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONAL: Callbacks
  // ═══════════════════════════════════════════════════════════════════════════
  onDispatch: (event) => {
    console.log(`${event.name}(${event.args}) took ${event.duration}ms`);
  },
  onError: (error) => {
    Sentry.captureException(error);
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // OPTIONAL: Serialization (for persistence, SSR)
  // ═══════════════════════════════════════════════════════════════════════════
  normalize: (state) => ({
    // Convert to serializable format
    ...state,
    date: state.date.toISOString(),
  }),
  denormalize: (data) => ({
    // Convert from serializable format
    ...data,
    date: new Date(data.date),
  }),
});
```

---

## What's Next?

| Topic                           | What You'll Learn                               |
| ------------------------------- | ----------------------------------------------- |
| [Actions](/guide/actions)       | Deep dive into action patterns, composition     |
| [Reactivity](/guide/reactivity) | How auto-tracking works, `pick()`, optimization |
| [Effects](/guide/effects)       | Side effects that react to state changes        |
| [Async](/guide/async)           | Loading states, `async()`, data fetching        |

---

**Ready?** [Learn about Actions →](/guide/actions)
