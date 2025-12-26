# store()

Creates a store specification.

## Signature

```ts
function store<TState, TActions>(
  options: StoreOptions<TState, TActions>
): StoreSpec<TState, TActions>
```

## Options

### name

Display name for debugging.

- **Type:** `string`
- **Required:** No (auto-generated if omitted)

### state

Initial state object.

- **Type:** `TState`
- **Required:** Yes

### setup

Function that receives store context and returns actions.

- **Type:** `(ctx: StoreContext) => TActions`
- **Required:** Yes

### lifetime

Store lifecycle mode.

- **Type:** `'keepAlive' | 'autoDispose'`
- **Default:** `'keepAlive'`

### equality

Custom equality functions per field.

- **Type:** `Partial<Record<keyof TState, Equality>>`
- **Default:** `strictEqual` for all fields

### meta

Metadata entries for cross-cutting concerns.

- **Type:** `MetaEntry | MetaEntry[]`
- **Default:** `[]`

### onDispatch

Called after every action dispatch. Useful for logging, analytics, or debugging.

- **Type:** `(event: DispatchEvent<TActions>) => void`
- **Default:** `undefined`

```ts
const counterStore = store({
  name: 'counter',
  state: { count: 0 },
  onDispatch: (event) => {
    console.log(`Action: ${event.name}`, {
      args: event.args,
      duration: event.duration,
    });
  },
  setup({ state }) {
    return {
      increment: () => { state.count++; },
      decrement: () => { state.count--; },
    };
  },
});
```

### onError

Called when an effect or action throws an error. Useful for error reporting.

- **Type:** `(error: unknown) => void`
- **Default:** `undefined`

```ts
const userStore = store({
  name: 'user',
  state: { user: null },
  onError: (error) => {
    console.error('Store error:', error);
    // Send to error tracking service
    Sentry.captureException(error);
  },
  setup({ state }) {
    return {
      fetchUser: async (id: string) => {
        const res = await fetch(`/api/users/${id}`);
        if (!res.ok) throw new Error('Failed to fetch user');
        state.user = await res.json();
      },
    };
  },
});
```

### normalize

Transform state to a serializable format for persistence. Handles complex types like `Date`, `Map`, `Set`, class instances.

- **Type:** `(state: TState) => Record<string, unknown>`
- **Default:** `undefined`

Used by `dehydrate()` when persisting state. Pairs with `denormalize`.

```ts
const sessionStore = store({
  name: 'session',
  state: {
    lastLogin: null as Date | null,
    cache: new Map<string, unknown>(),
    permissions: new Set<string>(),
  },
  normalize: (state) => ({
    lastLogin: state.lastLogin?.toISOString() ?? null,
    cache: Object.fromEntries(state.cache),
    permissions: Array.from(state.permissions),
  }),
  denormalize: (data) => ({
    lastLogin: data.lastLogin ? new Date(data.lastLogin as string) : null,
    cache: new Map(Object.entries(data.cache as Record<string, unknown>)),
    permissions: new Set(data.permissions as string[]),
  }),
  setup({ state }) {
    return {
      login: () => { state.lastLogin = new Date(); },
      setCache: (key: string, value: unknown) => { state.cache.set(key, value); },
      addPermission: (perm: string) => { state.permissions.add(perm); },
    };
  },
});
```

### denormalize

Transform serialized data back to state shape. Reverses the `normalize` transformation.

- **Type:** `(data: Record<string, unknown>) => TState`
- **Default:** `undefined`

Used by `hydrate()` when restoring persisted state.

```ts
// See normalize example above for paired usage
```

**Common use cases for normalize/denormalize:**

| Type | Normalize | Denormalize |
|------|-----------|-------------|
| `Date` | `.toISOString()` | `new Date(str)` |
| `Map` | `Object.fromEntries()` | `new Map(Object.entries())` |
| `Set` | `Array.from()` | `new Set(arr)` |
| `BigInt` | `.toString()` | `BigInt(str)` |
| Class | `{ ...instance }` | `Object.assign(new Class(), data)` |

### toJSON

Controls what `toJSON()` returns when the store instance is serialized (e.g., via `JSON.stringify()`).

- **Type:** `"state" | "normalize" | "info" | "id" | "null" | "undefined" | "empty"`
- **Default:** `"state"`

```ts
// Default: serialize raw state
const userStore = store({
  name: "user",
  state: { name: "John", age: 30 },
  // toJSON defaults to "state"
});

// Use normalize function (consistent with dehydrate)
const sessionStore = store({
  name: "session",
  state: {
    lastLogin: new Date("2024-01-01"),
    items: new Set(["a", "b"]),
  },
  normalize: (state) => ({
    lastLogin: state.lastLogin.toISOString(),
    items: Array.from(state.items),
  }),
  toJSON: "normalize", // Uses normalize() for JSON.stringify
});

// Return store metadata only
const debugStore = store({
  name: "debug",
  state: { sensitive: "data" },
  toJSON: "info", // { id: "debug:1", name: "debug" }
});

// Return just the ID string
const idStore = store({
  name: "id",
  state: { data: "..." },
  toJSON: "id", // "id:1"
});

// Explicit null (useful for nested stores)
const nestedStore = store({
  name: "nested",
  state: { value: "secret" },
  toJSON: "null", // null
});

// Completely omit from JSON
const hiddenStore = store({
  name: "hidden",
  state: { sensitive: "data" },
  toJSON: "undefined", // undefined (omitted from JSON.stringify)
});

// Empty object marker
const emptyStore = store({
  name: "empty",
  state: { data: "..." },
  toJSON: "empty", // {}
});
```

**Use cases:**

| Mode | Returns | JSON Output | Use Case |
|------|---------|------------|----------|
| `"state"` | Raw state | Full state object | Default behavior |
| `"normalize"` | Normalized state | Normalized data | Consistent serialization format |
| `"info"` | `{ id, name }` | `{"id":"user:1","name":"user"}` | Debugging with metadata |
| `"id"` | ID string | `"user:1"` | Simple identifier reference |
| `"null"` | `null` | `null` | Explicit non-serializable marker (nested stores) |
| `"undefined"` | `undefined` | Omitted | Complete hiding from serialization |
| `"empty"` | `{}` | `{}` | Structure marker without data |

**Example: Nested stores**

```ts
const childStore = store({
  name: "child",
  state: { value: "secret" },
  toJSON: "null", // Prevents serializing nested store data
});

const parentStore = store({
  name: "parent",
  state: { data: "public", child: null as any },
  setup({ get }) {
    const [childState, childActions, childInstance] = get(childStore);
    // Store instance in state (for reference)
    return {};
  },
});

// When serializing parentStore, child serializes as null
const serialized = JSON.stringify(parentStore);
// Result: {"data":"public","child":null}
```

## Setup Context (StoreContext)

The `setup` function receives a `StoreContext` object with the following properties and methods:

### state

Mutable reactive state proxy. Writes trigger subscriber notifications, reads inside `effect()` create reactive dependencies.

```ts
setup({ state }) {
  return {
    increment: () => { state.count++; },
    setName: (name: string) => { state.name = name; },
  };
}
```

### get(spec)

Get another store's state and actions. Returns a tuple `[state, actions]`. Creates dependency - store is created if not exists. **Setup-time only.**

```ts
setup({ get }) {
  const [userState, userActions] = get(userStore);
  
  return {
    greeting: () => `Hello, ${userState.name}`,
    logout: () => userActions.clearUser(),
  };
}
```

### get(factory)

Get a service or factory instance. Creates and caches the instance using the factory function.

```ts
setup({ get }) {
  const api = get(apiService);
  const logger = get(loggerService);
  
  return {
    fetchData: async () => {
      logger.info('Fetching data...');
      return api.getData();
    },
  };
}
```

### create(spec)

Create a child store instance that is automatically disposed when the parent store is disposed. Unlike `get()`, returns full `StoreInstance` with access to `id`, `subscribe()`, `dispose()`, etc.

```ts
setup({ create }) {
  const childInstance = create(childStore);
  
  return {
    getChildState: () => childInstance.state,
    subscribeToChild: (fn) => childInstance.subscribe(fn),
    disposeChild: () => childInstance.dispose(),
  };
}
```

### create(factory, ...args)

Create a service or factory instance with additional arguments. Unlike `get()` which caches, `create()` always creates fresh instances.

```ts
setup({ create }) {
  const db = create(createDatabase, { host: 'localhost', port: 5432 });
  const logger = create(createLogger, 'auth-store');
  
  return {
    getData: async () => db.query('SELECT * FROM users'),
    log: (msg: string) => logger.info(msg),
  };
}
```

### update

Immer-style state updates for nested mutations. Also provides `.action()` to create action functions.

```ts
setup({ state, update }) {
  return {
    // Direct update with updater function
    addItem: (item: Item) => {
      update(draft => {
        draft.items.push(item);
        draft.count++;
      });
    },
    
    // Direct update with partial object
    setDefaults: () => {
      update({ count: 0, name: 'Default' });
    },
    
    // Create action with update.action()
    increment: update.action(draft => {
      draft.count++;
    }),
    
    // Action with arguments
    addTodo: update.action((draft, text: string) => {
      draft.items.push({ id: Date.now(), text, done: false });
    }),
  };
}
```

### dirty() / dirty(prop)

Check if state has been modified since setup completed.

```ts
setup({ state, dirty }) {
  return {
    hasChanges: () => dirty(),           // Any property modified?
    isNameChanged: () => dirty('name'),  // Specific property modified?
  };
}
```

### reset()

Reset state to initial values (captured after setup/effects). Triggers change notifications for all modified properties.

```ts
setup({ state, reset }) {
  return {
    clearAll: () => reset(),
  };
}
```

### onDispose(callback)

Register a cleanup callback to run when the store is disposed. Callbacks are called in registration order.

```ts
setup({ state, onDispose }) {
  const subscription = api.subscribe(data => {
    state.data = data;
  });
  onDispose(() => subscription.unsubscribe());
  
  const intervalId = setInterval(() => {
    state.tick++;
  }, 1000);
  onDispose(() => clearInterval(intervalId));
  
  return {};
}
```

### mixin(mixin, ...args)

Apply a mixin to compose reusable logic. Mixins receive the same context and can return actions or values. **Setup-time only.**

```ts
const counterMixin = (ctx: StoreContext, initial: number) => {
  ctx.state.count = initial;
  return {
    increment: () => { ctx.state.count++; },
    decrement: () => { ctx.state.count--; },
  };
};

setup({ mixin }) {
  const counter = mixin(counterMixin, 10);
  
  return {
    ...counter,
    double: () => { counter.increment(); counter.increment(); },
  };
}
```

### focus(path, options?)

Create a lens-like accessor for a nested state path. Returns a `[getter, setter]` tuple with an `on()` method for subscribing to changes.

```ts
setup({ focus }) {
  const [getName, setName] = focus('profile.name');
  const [getProfile] = focus('profile', { fallback: () => ({ name: 'Guest' }) });
  
  return {
    getName,
    setName,
    uppercaseName: () => setName(prev => prev.toUpperCase()),
    
    // Subscribe to changes
    watchName: (callback) => {
      return focus('profile.name').on(({ next, prev }) => {
        callback(next, prev);
      });
    },
  };
}
```

### Full Interface

```ts
interface StoreContext<TState> {
  readonly state: TState;
  
  get<S, A>(spec: StoreSpec<S, A>): StoreTuple<S, A>;
  get<T>(factory: Factory<T>): T;
  
  create<S, A>(spec: StoreSpec<S, A>): StoreInstance<S, A>;
  create<T>(factory: Factory<T>): T;
  create<T, Args>(factory: Factory<T, Args>, ...args: Args): T;
  
  update: StoreUpdate<TState>;
  
  dirty(): boolean;
  dirty<K extends keyof TState>(prop: K): boolean;
  
  reset(): void;
  
  onDispose(callback: () => void): void;
  
  mixin<R, Args>(mixin: StoreMixin<TState, R, Args>, ...args: Args): R;
  
  focus<P extends StatePath<TState>>(path: P): Focus<PathValue<TState, P>>;
  focus<P>(path: P, options: FocusOptions): Focus<PathValue<TState, P>>;
}
```

## Example

```ts
const todoStore = store({
  name: 'todos',
  state: {
    items: [] as Todo[],
    filter: 'all' as 'all' | 'active' | 'completed',
  },
  equality: {
    items: shallowEqual,
  },
  setup({ state, update, get }) {
    const api = get(apiService);
    
    return {
      addTodo: (text: string) => {
        update(draft => {
          draft.items.push({
            id: crypto.randomUUID(),
            text,
            completed: false,
          });
        });
      },
      
      toggleTodo: (id: string) => {
        update(draft => {
          const todo = draft.items.find(t => t.id === id);
          if (todo) todo.completed = !todo.completed;
        });
      },
      
      setFilter: (filter: typeof state.filter) => {
        state.filter = filter;
      },
      
      loadTodos: async () => {
        state.items = await api.getTodos();
      },
    };
  },
});
```

## Return Value

Returns a `StoreSpec` which is both:

1. **A factory function**: `spec(resolver) => StoreInstance`
2. **A specification object**: Contains `name`, `options`, `meta`

```ts
// As factory
const instance = todoStore(resolver);

// As object
console.log(todoStore.displayName); // 'todos'
console.log(todoStore.options.state); // initial state
```

