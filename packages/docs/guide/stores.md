# Stores

Stores are the core building block of Storion. They encapsulate related state and the actions that modify it, creating a self-contained unit of application logic.

## The Problem Stores Solve

Traditional React state management often leads to:

- **Scattered state** — related data spread across multiple `useState` hooks
- **Prop drilling** — passing state through many component layers
- **Unclear ownership** — who is responsible for updating what?
- **Difficult testing** — state tied to component lifecycle

Stores solve this by co-locating state with the logic that modifies it:

```ts
// All user-related state and logic in one place
const userStore = store({
  name: "user",
  state: { name: "", email: "", age: 0 },
  setup({ state }) {
    return {
      setName: (name: string) => {
        state.name = name;
      },
      setEmail: (email: string) => {
        state.email = email;
      },
      updateProfile: (data: Partial<User>) => {
        /* ... */
      },
    };
  },
});
```

## Defining a Store

```ts
import { store } from "storion/react";

const userStore = store({
  name: "user", // Identifies store in devtools
  state: { name: "", email: "", age: 0 }, // Initial state
  setup({ state, update, get, mixin, focus }) {
    // Setup runs once when store is created
    // Return actions that components can call
    return {
      setName: (name: string) => {
        state.name = name;
      },
    };
  },
});
```

**Key concepts:**

| Property | Purpose                                                  |
| -------- | -------------------------------------------------------- |
| `name`   | Debugging identifier (shows in devtools, error messages) |
| `state`  | Initial data structure - becomes reactive automatically  |
| `setup`  | Runs once on creation, receives context, returns actions |

## State Mutation

### Direct Mutation (First-Level Properties)

For top-level properties, mutate directly through the `state` proxy:

```ts
setup({ state }) {
  return {
    setName: (name: string) => {
      state.name = name;  // ✅ Triggers reactivity
    },
    setAge: (age: number) => {
      state.age = age;    // ✅ Triggers reactivity
    },
  };
}
```

**Why this works:** Storion wraps your state in a proxy that intercepts property assignments. When you write `state.name = 'Alice'`, Storion:

1. Compares the new value with the old value
2. If different, records the change
3. Notifies all subscribers watching `name`

### Nested State with update()

Direct mutation only works at the first level. For nested objects and arrays, use `update()`:

```ts
setup({ state, update }) {
  return {
    // ❌ Wrong - won't trigger reactivity
    badUpdate: () => {
      state.profile.name = 'John';  // Nested mutation - ignored!
    },

    // ✅ Correct - use update() for nested changes
    updateProfile: (profile: Partial<Profile>) => {
      update(draft => {
        Object.assign(draft.profile, profile);
      });
    },

    // ✅ Works for arrays too
    addItem: (item: Item) => {
      update(draft => {
        draft.items.push(item);
      });
    },
  };
}
```

**How update() works:** It uses [Immer](https://immerjs.github.io/immer/) under the hood. You write mutations on a "draft" copy, and Immer produces an immutable update. This gives you:

- **Natural syntax** — mutate like normal JavaScript
- **Immutable updates** — proper change detection
- **Batched changes** — multiple mutations in one notification

::: warning Common Mistake
Direct nested mutation is the #1 bug when starting with Storion:

```ts
state.profile.name = "John"; // ❌ Won't trigger re-renders
state.items.push(newItem); // ❌ Won't trigger re-renders
```

Always use `update()` for anything beyond first-level properties.
:::

### update() Patterns

```ts
setup({ state, update }) {
  return {
    // Pattern 1: Updater function (most common)
    addTodo: (text: string) => {
      update(draft => {
        draft.todos.push({ id: Date.now(), text, done: false });
      });
    },

    // Pattern 2: Partial object (shallow merge)
    setDefaults: () => {
      update({ count: 0, name: 'Default' });
    },

    // Pattern 3: update.action() - creates reusable action
    increment: update.action(draft => {
      draft.count++;
    }),

    // Pattern 4: update.action() with arguments
    setCount: update.action((draft, value: number) => {
      draft.count = value;
    }),
  };
}
```

## Focus (Lens-like Access)

`focus()` creates a getter/setter pair for any state path. This is useful when you frequently access the same nested path:

```ts
setup({ focus }) {
  // Create accessor for nested path
  const [getName, setName] = focus('profile.name');
  const [getSettings, setSettings] = focus('user.settings');

  return {
    // Expose the getter
    getName,

    // Use setter directly
    setName,

    // Compute from current value
    uppercaseName: () => {
      setName(current => current.toUpperCase());
    },

    // Update nested object through focus
    updateSettings: (partial: Partial<Settings>) => {
      setSettings(draft => {
        Object.assign(draft, partial);
      });
    },
  };
}
```

**Why use focus?**

- **Type-safe paths** — TypeScript validates the path string
- **Reusable accessors** — define once, use in multiple actions
- **Cleaner code** — avoid repeating `state.deeply.nested.value`

**Focus setter patterns:**

| Pattern      | Example                             | Use case               |
| ------------ | ----------------------------------- | ---------------------- |
| Direct value | `setName('Alice')`                  | Replace entirely       |
| Reducer      | `setCount(n => n + 1)`              | Compute from previous  |
| Producer     | `setUser(draft => { draft.age++ })` | Partial nested updates |

## Cross-Store Dependencies

Stores can depend on other stores using `get()`:

```ts
const cartStore = store({
  name: "cart",
  state: { items: [] as CartItem[] },
  setup({ state, get }) {
    // Get another store's state and actions
    const [userState, userActions] = get(userStore);

    return {
      checkout: async () => {
        // Use user data in cart logic
        if (!userState.isLoggedIn) {
          throw new Error("Must be logged in");
        }
        // ...
      },

      addItem: (item: CartItem) => {
        // Track in analytics using user ID
        analytics.track("add_to_cart", {
          userId: userState.id,
          item,
        });
        state.items.push(item);
      },
    };
  },
});
```

**Important:** `get()` can only be called during setup, not inside actions:

```ts
setup({ get }) {
  // ✅ Setup-time: get() works here
  const [userState] = get(userStore);

  return {
    doSomething: () => {
      // ❌ Runtime: get() would throw here
      // const [other] = get(otherStore);

      // ✅ But captured state is always current
      console.log(userState.name); // Gets latest value
    },
  };
}
```

## Store Lifecycle

### Lifetime Options

```ts
// Default: lives until container is disposed
const globalStore = store({
  lifetime: "keepAlive",
  // ...
});

// Auto-disposes when no components are subscribed
const sessionStore = store({
  lifetime: "autoDispose",
  // ...
});
```

**When to use each:**

| Lifetime      | Use case                                                                   |
| ------------- | -------------------------------------------------------------------------- |
| `keepAlive`   | Global state (auth, settings), state that should persist across navigation |
| `autoDispose` | Feature-specific state, modals, wizards, temporary UI state                |

::: warning Dependency Rules
A `keepAlive` store cannot depend on an `autoDispose` store. This would create a situation where the long-lived store holds a reference to a store that might be disposed.
:::

### Cleanup with onDispose

Register cleanup callbacks for resources:

```ts
setup({ state, onDispose }) {
  // Set up resources
  const subscription = api.subscribe(data => {
    state.data = data;
  });

  const intervalId = setInterval(() => {
    state.tick++;
  }, 1000);

  // Clean up when store is disposed
  onDispose(() => subscription.unsubscribe());
  onDispose(() => clearInterval(intervalId));

  return { /* actions */ };
}
```

## Store Instance

When you retrieve a store with `get()` or `container.get()`, you get a tuple:

```ts
const [state, actions] = container.get(userStore);

// Read state (reactive)
console.log(state.name);

// Call actions
actions.setName("Alice");
```

### Full Instance Access

For advanced use cases, you can access the full instance:

```ts
const instance = container.get(userStore);

instance.state; // Reactive state proxy
instance.actions; // Actions object
instance.subscribe(fn); // Listen to any state change
instance.dehydrate(); // Serialize for persistence/SSR
instance.hydrate(data); // Restore from serialized data
instance.dirty; // Check if modified since setup
instance.reset(); // Reset to initial state
instance.dispose(); // Clean up resources
```

## Store Options Reference

```ts
const myStore = store({
  // Required
  name: "myStore",
  state: {
    /* initial state */
  },
  setup(ctx) {
    return {
      /* actions */
    };
  },

  // Optional
  lifetime: "keepAlive", // or 'autoDispose'
  equality: {
    items: "shallow", // Custom equality per field
    config: "deep",
    custom: (a, b) => a.id === b.id,
  },
  meta: [persist(), logged()], // Metadata for middleware

  // Callbacks
  onDispatch: (event) => {
    // Called after every action
    console.log(event.name, event.args, event.duration);
  },
  onError: (error) => {
    // Called on effect/action errors
    Sentry.captureException(error);
  },

  // Serialization (for persistence, SSR)
  normalize: (state) => ({
    /* serializable version */
  }),
  denormalize: (data) => ({
    /* restored state */
  }),
});
```

## Best Practices

### 1. One Store Per Domain

Group related state together:

```ts
// ✅ Good: one store for user domain
const userStore = store({
  state: { profile: {}, preferences: {}, sessions: [] },
  // ...
});

// ❌ Avoid: separate stores for related data
const profileStore = store({ ... });
const preferencesStore = store({ ... });
const sessionsStore = store({ ... });
```

### 2. Keep Actions Focused

Each action should do one thing:

```ts
// ✅ Good: focused actions
return {
  setName: (name) => {
    state.name = name;
  },
  setEmail: (email) => {
    state.email = email;
  },
  clearProfile: () => {
    state.name = "";
    state.email = "";
  },
};

// ❌ Avoid: god actions
return {
  updateEverything: (name, email, prefs, settings) => {
    /* ... */
  },
};
```

### 3. Use TypeScript Inference

Let TypeScript infer types from your state and setup:

```ts
// ✅ Good: inferred types
const counterStore = store({
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => { state.count++; },
    };
  },
});

// ❌ Unnecessary: explicit generics
const counterStore = store<CounterState, CounterActions>({ ... });
```

## Next Steps

- **[Reactivity](/guide/reactivity)** — How automatic tracking works
- **[Effects](/guide/effects)** — Reactive side effects
- **[Async](/guide/async)** — Loading states and data fetching
- **[Services](/guide/core-concepts#services)** — Dependency injection
