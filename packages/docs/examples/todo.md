# Todo App

A classic todo application demonstrating stores, actions, and computed values.

## Store Definition

```ts
import { store } from 'storion/react';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
}

type Filter = 'all' | 'active' | 'completed';

export const todoStore = store({
  name: 'todos',
  state: {
    items: [] as Todo[],
    filter: 'all' as Filter,
  },
  setup({ state, update }) {
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

      removeTodo: (id: string) => {
        update(draft => {
          draft.items = draft.items.filter(t => t.id !== id);
        });
      },

      setFilter: (filter: Filter) => {
        state.filter = filter;
      },

      clearCompleted: () => {
        update(draft => {
          draft.items = draft.items.filter(t => !t.completed);
        });
      },
    };
  },
});
```

## Components

### TodoInput

```tsx
import { useState } from 'react';
import { useStore } from 'storion/react';
import { todoStore } from './stores';

function TodoInput() {
  const [text, setText] = useState('');
  
  const { addTodo } = useStore(({ get }) => {
    const [, actions] = get(todoStore);
    return { addTodo: actions.addTodo };
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      addTodo(text.trim());
      setText('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="What needs to be done?"
      />
      <button type="submit">Add</button>
    </form>
  );
}
```

### TodoList

```tsx
function TodoList() {
  const { todos, toggle, remove } = useStore(({ get }) => {
    const [state, actions] = get(todoStore);
    
    // Computed: filtered todos
    const filtered = state.items.filter(todo => {
      if (state.filter === 'active') return !todo.completed;
      if (state.filter === 'completed') return todo.completed;
      return true;
    });

    return {
      todos: filtered,
      toggle: actions.toggleTodo,
      remove: actions.removeTodo,
    };
  });

  return (
    <ul>
      {todos.map(todo => (
        <li key={todo.id}>
          <input
            type="checkbox"
            checked={todo.completed}
            onChange={() => toggle(todo.id)}
          />
          <span style={{ 
            textDecoration: todo.completed ? 'line-through' : 'none' 
          }}>
            {todo.text}
          </span>
          <button onClick={() => remove(todo.id)}>×</button>
        </li>
      ))}
    </ul>
  );
}
```

### TodoFilters

```tsx
function TodoFilters() {
  const { filter, setFilter, remaining, clearCompleted } = useStore(({ get }) => {
    const [state, actions] = get(todoStore);
    
    return {
      filter: state.filter,
      setFilter: actions.setFilter,
      remaining: state.items.filter(t => !t.completed).length,
      clearCompleted: actions.clearCompleted,
    };
  });

  return (
    <footer>
      <span>{remaining} items left</span>
      
      <div>
        {(['all', 'active', 'completed'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{ fontWeight: filter === f ? 'bold' : 'normal' }}
          >
            {f}
          </button>
        ))}
      </div>
      
      <button onClick={clearCompleted}>Clear completed</button>
    </footer>
  );
}
```

### App

```tsx
import { container, StoreProvider } from 'storion/react';

const app = container();

function App() {
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

## Key Concepts

1. **Immutable Updates**: Using `update()` with Immer for nested state changes
2. **Computed Values**: Filtering todos inside the selector
3. **Multiple Actions**: Organized actions for each operation
4. **Component Composition**: Each component selects only what it needs

## Try It

Check out the [Feature Showcase](/demos) for a working demo with todos and more.

