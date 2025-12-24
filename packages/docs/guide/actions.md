# Actions

Actions are functions that modify store state. They provide a clear, testable interface for state changes and are the **only recommended way** to update state in Storion.

## What Are Actions?

**What's this for?** Understanding why actions exist helps you write better, more maintainable code.

Actions serve several purposes:

- **Encapsulation** — Logic for modifying state lives with the state itself
- **Reusability** — Call the same action from any component or other store
- **Testability** — Test state changes without rendering components
- **Traceability** — Track what changed and why via `onDispatch`
- **Type safety** — Parameters and return types are automatically inferred

```ts
// Without actions: scattered, hard to track, duplicate logic
component1: () => { state.count++; }
component2: () => { state.count++; analytics.track('increment'); }
component3: () => { state.count++; }  // Forgot analytics!

// With actions: centralized, consistent, trackable
const counterStore = store({
  setup({ state }) {
    return {
      increment: () => {
        state.count++;
        analytics.track('increment');  // Always happens
      },
    };
  },
});
```

---

## Defining Actions

**What's this for?** Learn the basic syntax for creating actions.

Actions are returned from the `setup()` function:

```ts
import { store } from 'storion/react';

const counterStore = store({
  name: 'counter',
  state: { count: 0 },
  setup({ state }) {
    // setup() runs ONCE when the store is created
    // Return an object containing your actions
    return {
      // Action: no parameters
      increment: () => {
        state.count++;
      },
      
      // Action: no parameters
      decrement: () => {
        state.count--;
      },
      
      // Action: no parameters
      reset: () => {
        state.count = 0;
      },
      
      // Action: with parameter
      setCount: (value: number) => {
        state.count = value;
      },
      
      // Action: with multiple parameters
      adjustBy: (amount: number, multiply: boolean) => {
        state.count = multiply 
          ? state.count * amount 
          : state.count + amount;
      },
    };
  },
});
```

**Key points:**

- Actions are plain functions that modify `state`
- Parameters are fully typed via TypeScript inference
- Actions can access the reactive `state` proxy directly
- Multiple state changes in one action are batched

---

## Calling Actions

**What's this for?** Learn the different ways to invoke actions.

### From React Components

Use `useStore` to access actions:

```tsx
function Counter() {
  // Destructure what you need from the selector
  const { count, increment, decrement, reset } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    
    return {
      count: state.count,
      // Actions are stable references - safe for deps arrays
      increment: actions.increment,
      decrement: actions.decrement,
      reset: actions.reset,
    };
  });

  return (
    <div>
      <span>{count}</span>
      <button onClick={increment}>+</button>
      <button onClick={decrement}>-</button>
      <button onClick={reset}>Reset</button>
    </div>
  );
}
```

**Tip:** Action references are stable across re-renders. You can safely pass them to memoized components or use them in `useCallback` deps.

### From Other Stores

Use `get()` in setup to access another store's actions:

```ts
const analyticsStore = store({
  name: 'analytics',
  state: { events: [] as string[] },
  setup({ state, get }) {
    // Get counterStore at setup time
    const [counterState, counterActions] = get(counterStore);

    return {
      // Compose actions from multiple stores
      trackAndIncrement: () => {
        // Log the event
        state.events = [...state.events, 'increment'];
        // Call the other store's action
        counterActions.increment();
      },
      
      // Access other store's state (always current)
      getCountWithEvents: () => ({
        count: counterState.count,
        eventCount: state.events.length,
      }),
    };
  },
});
```

### From Outside React

Use `container.get()` to access the store instance directly:

```ts
import { container } from 'storion';

// Get the store instance
const instance = app.get(counterStore);

// Call actions directly
instance.actions.increment();
instance.actions.setCount(100);

// Read state
console.log(instance.state.count);
```

This is useful for:
- Node.js scripts
- Background workers
- Integration tests
- Initial data loading

---

## Action Patterns

**What's this for?** Learn common patterns for different types of state updates.

### Simple Setters

For single property updates, use direct assignment:

```ts
setup({ state }) {
  return {
    setName: (name: string) => {
      state.name = name;  // Direct mutation at first level
    },
    setEmail: (email: string) => {
      state.email = email;
    },
    setAge: (age: number) => {
      state.age = age;
    },
  };
}
```

### Computed Updates

Actions can compute new values from current state:

```ts
setup({ state }) {
  return {
    // Double the current count
    double: () => {
      state.count = state.count * 2;
    },
    
    // Add percentage to total
    addPercentage: (percent: number) => {
      state.total = state.total * (1 + percent / 100);
    },
    
    // Toggle boolean
    toggleActive: () => {
      state.isActive = !state.isActive;
    },
    
    // Cycle through values
    nextStatus: () => {
      const statuses = ['pending', 'active', 'done'] as const;
      const currentIndex = statuses.indexOf(state.status);
      state.status = statuses[(currentIndex + 1) % statuses.length];
    },
  };
}
```

### Batch Updates

Multiple state changes in one action trigger a single notification to subscribers:

```ts
setup({ state }) {
  return {
    // All changes are batched - subscribers notified once
    reset: () => {
      state.name = '';
      state.email = '';
      state.age = 0;
      state.isVerified = false;
    },
    
    // Load user data in one batch
    loadUser: (user: User) => {
      state.name = user.name;
      state.email = user.email;
      state.age = user.age;
      state.isVerified = user.isVerified;
    },
  };
}
```

### Nested Updates with update()

For nested objects and arrays, use `update()` with an Immer-style producer:

```ts
setup({ state, update }) {
  return {
    // Add item to array
    addTodo: (text: string) => {
      update((draft) => {
        draft.todos.push({
          id: crypto.randomUUID(),
          text,
          done: false,
        });
      });
    },
    
    // Find and modify item
    toggleTodo: (id: string) => {
      update((draft) => {
        const todo = draft.todos.find((t) => t.id === id);
        if (todo) {
          todo.done = !todo.done;
        }
      });
    },
    
    // Remove from array
    removeTodo: (id: string) => {
      update((draft) => {
        draft.todos = draft.todos.filter((t) => t.id !== id);
      });
    },
    
    // Update nested object
    updateProfile: (changes: Partial<Profile>) => {
      update((draft) => {
        Object.assign(draft.profile, changes);
      });
    },
  };
}
```

### update.action() Shorthand

Create actions directly from update functions for cleaner code:

```ts
setup({ update }) {
  return {
    // No arguments - just the producer
    increment: update.action((draft) => {
      draft.count++;
    }),
    
    // With arguments - passed after draft
    setCount: update.action((draft, value: number) => {
      draft.count = value;
    }),
    
    // Multiple arguments
    addItem: update.action((draft, name: string, price: number) => {
      draft.items.push({ name, price });
    }),
  };
}
```

---

## Async Actions

**What's this for?** Handle data fetching and other asynchronous operations.

Actions can be async for API calls and other async operations:

```ts
setup({ state }) {
  return {
    fetchUser: async (id: string) => {
      // Set loading state
      state.loading = true;
      state.error = null;

      try {
        // Make API call
        const response = await fetch(`/api/users/${id}`);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        const user = await response.json();
        
        // Update state with result
        state.user = user;
      } catch (err) {
        // Handle error
        state.error = err instanceof Error ? err.message : 'Failed';
      } finally {
        // Always clear loading
        state.loading = false;
      }
    },
  };
}
```

::: tip Use async.action() for Production
For production apps, use `async.action()` instead of plain async functions. It provides:

- **Automatic loading/error state** — No manual `loading = true/false`
- **Request cancellation** — Cancel pending requests on new calls
- **Race condition handling** — Only apply results from latest request
- **Retry support** — Built-in retry with backoff

See [Async State](/guide/async) for details.
:::

---

## Action Composition

**What's this for?** Build complex actions from simpler ones.

### Calling Actions from Actions

Actions can call other actions in the same store:

```ts
setup({ state }) {
  // Define base actions
  const setName = (name: string) => {
    state.name = name;
  };
  
  const setEmail = (email: string) => {
    state.email = email;
  };
  
  const clearProfile = () => {
    setName('');
    setEmail('');
  };

  return {
    setName,
    setEmail,
    clearProfile,
    
    // Higher-level action using others
    updateProfile: (profile: { name?: string; email?: string }) => {
      if (profile.name) setName(profile.name);
      if (profile.email) setEmail(profile.email);
    },
  };
}
```

### Shared Logic with Helper Functions

Extract shared logic into helper functions:

```ts
setup({ state, update }) {
  // Helper function (not an action)
  const findItemById = (id: string) => {
    return state.items.find((item) => item.id === id);
  };
  
  // Helper for validation
  const validateItem = (item: Item) => {
    if (!item.name) throw new Error('Item name required');
    if (item.price < 0) throw new Error('Price must be positive');
  };

  return {
    updateItem: (id: string, changes: Partial<Item>) => {
      const item = findItemById(id);
      if (!item) throw new Error('Item not found');
      
      const updated = { ...item, ...changes };
      validateItem(updated);
      
      update((draft) => {
        const index = draft.items.findIndex((i) => i.id === id);
        draft.items[index] = updated;
      });
    },
  };
}
```

---

## Action Metadata

**What's this for?** Track and debug action calls.

### Tracking Dispatches

Use `onDispatch` to log or track all action calls:

```ts
const userStore = store({
  name: 'user',
  state: { name: '' },
  setup({ state }) {
    return {
      setName: (name: string) => {
        state.name = name;
      },
    };
  },
  
  // Called after every action completes
  onDispatch: (event) => {
    console.log(`[${event.name}] called with:`, event.args);
    console.log(`Duration: ${event.duration}ms`);
    console.log(`State after:`, event.state);
    
    // Send to analytics
    analytics.track('store_action', {
      store: 'user',
      action: event.name,
      duration: event.duration,
    });
  },
});
```

### Last Action Result

Access the result of the last action call with `action.last()`:

```tsx
function SaveButton() {
  const { save, lastSave } = useStore(({ get }) => {
    const [, actions] = get(formStore);
    
    return {
      save: actions.save,
      // Get status of last save call
      lastSave: actions.save.last(),
    };
  });

  // lastSave: { status, result, error, args } | undefined
  
  return (
    <button 
      onClick={save} 
      disabled={lastSave?.status === 'pending'}
    >
      {lastSave?.status === 'pending' ? 'Saving...' : 'Save'}
    </button>
  );
}
```

---

## Common Mistakes

**What's this for?** Avoid frequent pitfalls when working with actions.

### 1. Modifying Nested State Directly

```ts
// ❌ Wrong - nested mutation ignored
state.profile.name = 'John';
state.items.push(newItem);

// ✅ Correct - use update() for nested changes
update((draft) => {
  draft.profile.name = 'John';
  draft.items.push(newItem);
});
```

### 2. Calling get() Inside Actions

```ts
setup({ get }) {
  // ✅ Correct - get() at setup time
  const [otherState, otherActions] = get(otherStore);
  
  return {
    doSomething: () => {
      // ❌ Wrong - get() throws inside actions
      // const [other] = get(anotherStore);
      
      // ✅ Correct - use captured reference
      otherActions.doThing();
    },
  };
}
```

### 3. Forgetting to Await Async Actions

```ts
// ❌ Wrong - not awaiting async action
const handleSubmit = () => {
  actions.saveUser(userData);
  navigate('/success');  // Navigates before save completes!
};

// ✅ Correct - await the async action
const handleSubmit = async () => {
  await actions.saveUser(userData);
  navigate('/success');  // Navigates after save completes
};
```

### 4. Creating Actions Outside setup()

```ts
// ❌ Wrong - action defined outside setup
const badAction = () => {
  state.count++;  // 'state' is not accessible here
};

// ✅ Correct - action defined inside setup
setup({ state }) {
  return {
    goodAction: () => {
      state.count++;  // 'state' is accessible
    },
  };
}
```

### 5. Using Anonymous Functions in trigger()

```ts
// ❌ Wrong - anonymous function creates new reference each render
trigger(() => actions.fetch(id), [id]);

// ✅ Correct - pass stable function reference
trigger(actions.fetch, [id], id);
```

---

## Recipes: Common Action Patterns

**What's this for?** Copy-paste solutions for common scenarios.

### Recipe: Optimistic Updates

Update UI immediately, rollback on error:

```ts
setup({ state, update }) {
  return {
    toggleFavorite: async (itemId: string) => {
      // Save original state
      const original = state.items.find((i) => i.id === itemId);
      if (!original) return;
      
      // Optimistically update
      update((draft) => {
        const item = draft.items.find((i) => i.id === itemId);
        if (item) item.isFavorite = !item.isFavorite;
      });
      
      try {
        // Make API call
        await api.toggleFavorite(itemId);
      } catch (error) {
        // Rollback on error
        update((draft) => {
          const item = draft.items.find((i) => i.id === itemId);
          if (item) item.isFavorite = original.isFavorite;
        });
        throw error;
      }
    },
  };
}
```

### Recipe: Debounced Action

Prevent rapid-fire calls:

```ts
setup({ state }) {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return {
    // Debounced search
    search: (query: string) => {
      clearTimeout(timeoutId);
      
      timeoutId = setTimeout(async () => {
        state.searching = true;
        try {
          state.results = await api.search(query);
        } finally {
          state.searching = false;
        }
      }, 300);  // Wait 300ms before searching
    },
  };
}
```

### Recipe: Action with Confirmation

```ts
setup({ state }) {
  return {
    deleteItem: async (id: string, confirmed = false) => {
      // If not confirmed, set pending deletion
      if (!confirmed) {
        state.pendingDeleteId = id;
        return;
      }
      
      // Clear pending and delete
      state.pendingDeleteId = null;
      state.items = state.items.filter((i) => i.id !== id);
      
      // Sync with server
      await api.deleteItem(id);
    },
    
    cancelDelete: () => {
      state.pendingDeleteId = null;
    },
  };
}
```

---

## Summary

| Concept | Description |
|---------|-------------|
| **Defining** | Return functions from `setup()` |
| **Calling** | Via `useStore`, `get()`, or `container.get()` |
| **Mutations** | Direct for first-level, `update()` for nested |
| **Async** | Plain async or `async.action()` for advanced |
| **Tracking** | `onDispatch` callback, `action.last()` |
| **Composition** | Actions can call other actions |

---

## Next Steps

- **[Effects](/guide/effects)** — React to state changes
- **[Async State](/guide/async)** — Advanced async handling with loading states
- **[Stores](/guide/stores)** — Full store configuration
- **[Reactivity](/guide/reactivity)** — How auto-tracking works
