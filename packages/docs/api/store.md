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

