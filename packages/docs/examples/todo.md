# Todo App

Build a complete todo application with filtering, persistence, and multiple components. This tutorial demonstrates Storion's approach to CRUD operations, computed values, and component composition.

## What We're Building

A TodoMVC-style app with:
- ✅ Add, toggle, and delete todos
- ✅ Filter by all/active/completed
- ✅ Computed counts (remaining items)
- ✅ Clear completed action
- ✅ Local storage persistence (optional)

## Project Structure

```
src/
├── stores/
│   └── todoStore.ts    # Store definition
├── components/
│   ├── TodoInput.tsx   # Add new todos
│   ├── TodoList.tsx    # Display filtered todos
│   └── TodoFilters.tsx # Filter controls
└── App.tsx             # App composition
```

## Step 1: Define the Store

Start by defining your data model and actions:

```ts
// stores/todoStore.ts
import { store } from 'storion/react';

/** A single todo item */
interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

/** Filter options for viewing todos */
type Filter = 'all' | 'active' | 'completed';

export const todoStore = store({
  name: 'todos',
  state: {
    /** List of all todo items */
    items: [] as Todo[],
    /** Current filter selection */
    filter: 'all' as Filter,
  },
  setup({ state, update }) {
    return {
      /**
       * Add a new todo item
       * Uses update() for nested array mutation
       */
      addTodo: (text: string) => {
        update((draft) => {
          draft.items.push({
            id: crypto.randomUUID(),
            text,
            completed: false,
            createdAt: Date.now(),
          });
        });
      },

      /**
       * Toggle a todo's completed status
       * Uses update() to find and mutate nested object
       */
      toggleTodo: (id: string) => {
        update((draft) => {
          const todo = draft.items.find((t) => t.id === id);
          if (todo) todo.completed = !todo.completed;
        });
      },

      /**
       * Remove a todo by ID
       * Uses update() to filter array
       */
      removeTodo: (id: string) => {
        update((draft) => {
          draft.items = draft.items.filter((t) => t.id !== id);
        });
      },

      /**
       * Set the active filter
       * Direct mutation for top-level primitive
       */
      setFilter: (filter: Filter) => {
        state.filter = filter;
      },

      /**
       * Remove all completed todos
       */
      clearCompleted: () => {
        update((draft) => {
          draft.items = draft.items.filter((t) => !t.completed);
        });
      },
    };
  },
});
```

**Key Concepts:**

| Pattern | When to Use |
|---------|-------------|
| `state.filter = value` | Direct mutation for top-level primitives |
| `update(draft => ...)` | Immer-style draft for nested mutations |
| `draft.items.push(...)` | Safe with Immer - mutates the draft copy |

::: tip Why update() for arrays?
Direct assignment like `state.items = [...]` only works at the top level. For nested mutations (push, find-and-modify, filter), use `update()` to get an Immer draft.
:::

## Step 2: TodoInput Component

A controlled input for adding new todos:

```tsx
// components/TodoInput.tsx
import { useState } from 'react';
import { useStore } from 'storion/react';
import { todoStore } from '../stores/todoStore';

export function TodoInput() {
  const [text, setText] = useState('');
  
  const { addTodo } = useStore(({ get }) => {
    const [, actions] = get(todoStore);
    return { addTodo: actions.addTodo };
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (trimmed) {
      addTodo(trimmed);
      setText('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="todo-input">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What needs to be done?"
        autoFocus
      />
      <button type="submit" disabled={!text.trim()}>
        Add
      </button>
    </form>
  );
}
```

**What's happening:**

- `useStore` only subscribes to actions (no state read = no re-renders from state changes)
- Local React state (`useState`) handles the input value
- The action reference is stable - won't cause unnecessary re-renders

## Step 3: TodoList Component

Display todos with computed filtering:

```tsx
// components/TodoList.tsx
import { useStore } from 'storion/react';
import { todoStore } from '../stores/todoStore';

export function TodoList() {
  const { todos, toggleTodo, removeTodo } = useStore(({ get }) => {
    const [state, actions] = get(todoStore);
    
    // Computed value: filter todos based on current filter
    const filteredTodos = state.items.filter((todo) => {
      switch (state.filter) {
        case 'active':
          return !todo.completed;
        case 'completed':
          return todo.completed;
        default:
      return true;
      }
    });

    return {
      todos: filteredTodos,
      toggleTodo: actions.toggleTodo,
      removeTodo: actions.removeTodo,
    };
  });

  if (todos.length === 0) {
    return <p className="empty-message">No todos to display</p>;
  }

  return (
    <ul className="todo-list">
      {todos.map((todo) => (
        <li key={todo.id} className={todo.completed ? 'completed' : ''}>
          <label>
          <input
            type="checkbox"
            checked={todo.completed}
              onChange={() => toggleTodo(todo.id)}
          />
            <span className="todo-text">{todo.text}</span>
          </label>
          <button
            className="delete-btn"
            onClick={() => removeTodo(todo.id)}
            aria-label="Delete todo"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
```

**Computed Values in Selectors:**

The filtering happens inside the selector:

```ts
const filteredTodos = state.items.filter((todo) => {
  // This runs on every state change
  // But component only re-renders if the RESULT changes
});
```

Storion tracks:
1. `state.items` - array reference
2. `state.filter` - current filter value

If either changes, the selector re-runs. If the filtered result is the same (shallow equal), no re-render occurs.

## Step 4: TodoFilters Component

Filter controls and statistics:

```tsx
// components/TodoFilters.tsx
import { useStore } from 'storion/react';
import { todoStore } from '../stores/todoStore';

const filters = ['all', 'active', 'completed'] as const;

export function TodoFilters() {
  const { filter, setFilter, remaining, hasCompleted, clearCompleted } =
    useStore(({ get }) => {
    const [state, actions] = get(todoStore);

      // Computed values
      const activeCount = state.items.filter((t) => !t.completed).length;
      const completedCount = state.items.filter((t) => t.completed).length;
    
    return {
      filter: state.filter,
      setFilter: actions.setFilter,
        remaining: activeCount,
        hasCompleted: completedCount > 0,
      clearCompleted: actions.clearCompleted,
    };
  });

  return (
    <footer className="todo-filters">
      <span className="todo-count">
        <strong>{remaining}</strong> {remaining === 1 ? 'item' : 'items'} left
      </span>
      
      <div className="filter-buttons">
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={filter === f ? 'active' : ''}
            aria-pressed={filter === f}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
      
      {hasCompleted && (
        <button className="clear-completed" onClick={clearCompleted}>
          Clear completed
        </button>
      )}
    </footer>
  );
}
```

**Multiple Computed Values:**

You can derive as many values as needed from the same state:

```ts
const activeCount = state.items.filter((t) => !t.completed).length;
const completedCount = state.items.filter((t) => t.completed).length;
```

These re-compute when `state.items` changes, but the component only re-renders if the returned object changes.

## Step 5: App Composition

Bring it all together with a container:

```tsx
// App.tsx
import { container, StoreProvider } from 'storion/react';
import { TodoInput } from './components/TodoInput';
import { TodoList } from './components/TodoList';
import { TodoFilters } from './components/TodoFilters';

const app = container();

export function App() {
  return (
    <StoreProvider container={app}>
      <div className="todo-app">
        <h1>Todos</h1>
        <TodoInput />
        <TodoList />
        <TodoFilters />
      </div>
    </StoreProvider>
  );
}
```

## Adding Persistence (Optional)

Persist todos to localStorage with minimal changes:

```ts
// stores/todoStore.ts
import { store, meta } from 'storion/react';
import { persist, storage } from 'storion/persist';

// Create a meta for marking persisted fields
const persisted = meta();

export const todoStore = store({
  name: 'todos',
  state: {
    items: [] as Todo[],
    filter: 'all' as Filter,
  },
  // Only persist 'items', not 'filter'
  meta: [persisted.for('items')],
  setup({ state, update }) {
    // ... same actions as before
  },
});

// In App.tsx - add persistence middleware
const app = container({
  middleware: [
    persist({
      storage: storage.local,
      // Only persists fields with 'persisted' meta
      key: 'todo-app',
    }),
  ],
});
```

Now `items` survives page reloads, while `filter` resets to 'all'.

## Key Concepts Demonstrated

### 1. Store Design

- **Single source of truth**: All todo state in one store
- **Colocated actions**: CRUD operations defined with their state
- **TypeScript inference**: Types flow naturally without explicit generics

### 2. Component Patterns

- **Minimal subscriptions**: Each component only subscribes to what it renders
- **Computed values**: Derive data in selectors, not components
- **Stable actions**: Action references don't change between renders

### 3. Update Patterns

| Operation | Approach |
|-----------|----------|
| Set primitive | `state.filter = 'active'` |
| Push to array | `update(d => d.items.push(...))` |
| Find and modify | `update(d => { const x = d.items.find(...); if (x) x.prop = val; })` |
| Filter array | `update(d => { d.items = d.items.filter(...); })` |

### 4. Performance

- Components re-render only when their specific dependencies change
- Filtering in selector avoids storing derived state
- No manual memoization required

## Exercises

Try extending this app to practice Storion concepts:

1. **Edit Mode**: Double-click a todo to edit its text
2. **Due Dates**: Add a due date field with sorting
3. **Categories**: Add todo categories with separate filters
4. **Drag & Drop**: Reorder todos with drag-and-drop (hint: update the array order)
5. **Undo/Redo**: Implement history with a middleware or separate store

## Full Working Example

See the [Feature Showcase](/demos) for a working demo with todos and additional features.

## Next Steps

- **[Async Data](/examples/async-data)** — Fetch data from APIs with loading states
- **[Persistence](/guide/persistence)** — Detailed persistence guide
- **[Stores](/guide/stores)** — Deep dive into store patterns
