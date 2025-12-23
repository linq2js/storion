# Actions

Actions are functions that modify store state. They're defined in the `setup()` function and provide a clear, testable interface for state changes.

## Defining Actions

Actions are returned from the `setup()` function:

```ts
const counterStore = store({
  name: "counter",
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => {
        state.count++;
      },
      decrement: () => {
        state.count--;
      },
      reset: () => {
        state.count = 0;
      },
    };
  },
});
```

## Calling Actions

### From Components

Use `useStore` to access actions:

```tsx
function Counter() {
  const { count, increment, decrement } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    return {
      count: state.count,
      increment: actions.increment,
      decrement: actions.decrement,
    };
  });

  return (
    <div>
      <span>{count}</span>
      <button onClick={increment}>+</button>
      <button onClick={decrement}>-</button>
    </div>
  );
}
```

### From Other Stores

Use `get()` in setup to access another store's actions:

```ts
const analyticsStore = store({
  name: "analytics",
  state: { events: [] as string[] },
  setup({ state, get }) {
    const [, counterActions] = get(counterStore);

    return {
      trackAndIncrement: () => {
        state.events = [...state.events, "increment"];
        counterActions.increment();
      },
    };
  },
});
```

### From Outside React

Use `container.get()` to access the store instance:

```ts
const instance = container.get(counterStore);
instance.actions.increment();
```

## Action Patterns

### Simple Setters

For single property updates:

```ts
setup({ state }) {
  return {
    setName: (name: string) => {
      state.name = name;
    },
    setEmail: (email: string) => {
      state.email = email;
    },
  };
}
```

### Computed Updates

Actions can compute new values from current state:

```ts
setup({ state }) {
  return {
    double: () => {
      state.count = state.count * 2;
    },
    addPercentage: (percent: number) => {
      state.total = state.total * (1 + percent / 100);
    },
  };
}
```

### Batch Updates

Multiple state changes in one action trigger a single notification:

```ts
setup({ state }) {
  return {
    reset: () => {
      // All changes batched into one update
      state.name = "";
      state.email = "";
      state.age = 0;
    },
  };
}
```

### Nested Updates with update()

For nested objects and arrays, use `update()`:

```ts
setup({ state, update }) {
  return {
    addTodo: (text: string) => {
      update((draft) => {
        draft.todos.push({ id: Date.now(), text, done: false });
      });
    },
    toggleTodo: (id: number) => {
      update((draft) => {
        const todo = draft.todos.find((t) => t.id === id);
        if (todo) todo.done = !todo.done;
      });
    },
  };
}
```

### update.action() Shorthand

Create actions directly from update functions:

```ts
setup({ update }) {
  return {
    // Shorthand for common patterns
    increment: update.action((draft) => {
      draft.count++;
    }),
    setCount: update.action((draft, value: number) => {
      draft.count = value;
    }),
  };
}
```

## Async Actions

Actions can be async for data fetching and other asynchronous operations:

```ts
setup({ state }) {
  return {
    fetchUser: async (id: string) => {
      state.loading = true;
      state.error = null;

      try {
        const response = await fetch(`/api/users/${id}`);
        const user = await response.json();
        state.user = user;
      } catch (err) {
        state.error = err instanceof Error ? err.message : "Failed";
      } finally {
        state.loading = false;
      }
    },
  };
}
```

::: tip Use async.action() for Better Async
For production apps, use `async.action()` instead of plain async functions. It provides:

- Automatic loading/error state
- Request cancellation
- Race condition handling

See [Async State](/guide/async) for details.
:::

## Action Metadata

### Tracking Dispatches

Use `onDispatch` to log or track all action calls:

```ts
const userStore = store({
  name: "user",
  state: { name: "" },
  setup({ state }) {
    return {
      setName: (name: string) => {
        state.name = name;
      },
    };
  },
  onDispatch: (event) => {
    console.log(`Action: ${event.name}`);
    console.log(`Args:`, event.args);
    console.log(`Duration: ${event.duration}ms`);
  },
});
```

### Last Action Result

Access the result of the last action call:

```tsx
function SaveButton() {
  const { save, lastSave } = useStore(({ get }) => {
    const [, actions] = get(formStore);
    return {
      save: actions.save,
      lastSave: actions.save.last(), // { status, result, error, args }
    };
  });

  return (
    <button onClick={save} disabled={lastSave?.status === "pending"}>
      {lastSave?.status === "pending" ? "Saving..." : "Save"}
    </button>
  );
}
```

## Action Best Practices

### 1. Keep Actions Focused

Each action should do one thing:

```ts
// ✅ Good: focused actions
return {
  setName: (name: string) => { state.name = name; },
  setEmail: (email: string) => { state.email = email; },
  clearProfile: () => {
    state.name = "";
    state.email = "";
  },
};

// ❌ Avoid: god actions
return {
  updateEverything: (name, email, prefs, settings) => { /* ... */ },
};
```

### 2. Use Descriptive Names

Action names should describe what they do:

```ts
// ✅ Good: clear intent
return {
  addToCart: (item) => { /* ... */ },
  removeFromCart: (id) => { /* ... */ },
  clearCart: () => { /* ... */ },
};

// ❌ Avoid: vague names
return {
  update: (item) => { /* ... */ },
  remove: (id) => { /* ... */ },
  clear: () => { /* ... */ },
};
```

### 3. Validate Input

Validate action parameters early:

```ts
return {
  setAge: (age: number) => {
    if (age < 0 || age > 150) {
      throw new Error("Invalid age");
    }
    state.age = age;
  },
};
```

### 4. Return Values for Feedback

Actions can return values for immediate feedback:

```ts
return {
  addItem: (item: Item): boolean => {
    if (state.items.length >= MAX_ITEMS) {
      return false; // Caller knows it failed
    }
    state.items = [...state.items, item];
    return true;
  },
};
```

## Summary

| Concept              | Description                                   |
| -------------------- | --------------------------------------------- |
| **Defining**         | Return functions from `setup()`               |
| **Calling**          | Via `useStore`, `get()`, or `container.get()` |
| **Mutations**        | Direct for first-level, `update()` for nested |
| **Async**            | Plain async or `async.action()` for advanced  |
| **Tracking**         | `onDispatch` callback, `action.last()`        |

## Next Steps

- **[Effects](/guide/effects)** — React to state changes
- **[Async State](/guide/async)** — Advanced async handling
- **[Stores](/guide/stores)** — Full store configuration

