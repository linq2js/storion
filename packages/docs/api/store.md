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

## Setup Context

The `setup` function receives:

```ts
interface StoreContext<TState> {
  // Reactive state object
  state: TState;
  
  // Immer-style updates for nested state
  update: (producer: (draft: TState) => void) => void;
  
  // Get other stores/services (setup-time only)
  get: <T>(factory: Factory<T>) => T;
  
  // Compose with mixins (setup-time only)
  mixin: <T>(factory: Factory<T>) => T;
  
  // Lens-like access to nested paths
  focus: <P extends Path>(path: P) => Focus<TState, P>;
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

