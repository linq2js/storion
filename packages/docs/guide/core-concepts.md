# Core Concepts

## Stores

A **store** is a reactive state container with:
- **State**: The data
- **Actions**: Functions to modify state
- **Setup**: Where you define actions and side effects

```ts
const todoStore = store({
  name: 'todos',
  state: { items: [], filter: 'all' },
  setup({ state, update }) {
    return {
      addTodo: (text: string) => {
        update(draft => {
          draft.items.push({ id: Date.now(), text, done: false });
        });
      },
      setFilter: (filter: string) => {
        state.filter = filter;
      },
    };
  },
});
```

## Container

A **container** manages store instances and their lifecycle:

```ts
const app = container();

// Get a store instance
const [state, actions] = app.get(todoStore);

// Stores are cached - same instance returned
app.get(todoStore) === app.get(todoStore); // true
```

## Services

**Services** are plain factories for non-reactive dependencies:

```ts
function apiService() {
  return {
    fetchTodos: () => fetch('/api/todos').then(r => r.json()),
    saveTodo: (todo) => fetch('/api/todos', {
      method: 'POST',
      body: JSON.stringify(todo),
    }),
  };
}

const todoStore = store({
  name: 'todos',
  state: { items: [] },
  setup({ state, get }) {
    const api = get(apiService);
    
    return {
      loadTodos: async () => {
        state.items = await api.fetchTodos();
      },
    };
  },
});
```

## Reactivity

Storion uses **Proxy-based tracking**:

```tsx
function TodoCount() {
  const { count } = useStore(({ get }) => {
    const [state] = get(todoStore);
    // Only `items.length` is tracked
    return { count: state.items.length };
  });

  return <span>{count} todos</span>;
}
```

- Reading `state.items.length` tracks that dependency
- Only changes to `items.length` trigger re-render
- Changes to `filter` don't affect this component

## Middleware

**Middleware** intercepts store creation:

```ts
const loggingMiddleware: Middleware = (ctx) => {
  console.log('Creating:', ctx.displayName);
  const instance = ctx.next();
  console.log('Created:', instance.id);
  return instance;
};

const app = container({
  middleware: [loggingMiddleware],
});
```

## Meta

**Meta** attaches metadata to stores for cross-cutting concerns:

```ts
const persist = meta();

const userStore = store({
  name: 'user',
  state: { name: '', token: '' },
  meta: [
    persist(),                    // Persist entire store
    notPersisted.for('token'),    // Except token
  ],
});
```

