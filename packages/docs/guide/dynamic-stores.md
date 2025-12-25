# Dynamic Nested State

Learn how to manage dynamic collections like task lists, widget dashboards, and multi-document editors using [`focus()`](/api/store#focus-path-options) helpers and [`create()`](/api/store#create-spec).

**Time to read:** ~12 minutes

---

## The Problem

Many applications need to manage dynamic collections of complex objects:

| Application        | Dynamic Collection                    |
| ------------------ | ------------------------------------- |
| Task Manager       | Multiple tasks with subtasks          |
| Dashboard          | Widgets that can be added/removed     |
| Document Editor    | Multiple open documents               |
| Chat Application   | Multiple chat rooms                   |
| E-commerce         | Shopping cart items                   |

Traditional approaches often lead to:

```ts
// ❌ PROBLEM: Verbose reducer patterns
const [tasks, dispatch] = useReducer(taskReducer, []);

function taskReducer(state, action) {
  switch (action.type) {
    case 'ADD_TASK':
      return [...state, action.payload];
    case 'REMOVE_TASK':
      return state.filter(t => t.id !== action.payload);
    case 'UPDATE_TASK':
      return state.map(t => t.id === action.payload.id ? { ...t, ...action.payload } : t);
    case 'TOGGLE_TASK':
      return state.map(t => t.id === action.payload ? { ...t, done: !t.done } : t);
    // ... more cases
  }
}
```

---

## Solution: Focus Helpers

Storion provides [`list()`](/api/list) and [`map()`](/api/map) helpers that transform a [`focus()`](/api/store#focus-path-options) into an ergonomic API for arrays and objects.

### Basic Setup

```ts
import { store, list, map } from 'storion/react';

interface Task {
  id: string;
  title: string;
  done: boolean;
}

const taskStore = store({
  name: 'tasks',
  state: {
    tasks: [] as Task[],
  },
  setup({ focus }) {
    // Transform focus into list API
    const tasks = focus('tasks').as(list());

    return {
      // Simple, readable methods
      addTask: (title: string) => {
        tasks.push({ id: crypto.randomUUID(), title, done: false });
      },
      removeTask: (task: Task) => tasks.remove(task),
      toggleTask: (index: number) => {
        tasks.set(index, draft => { draft.done = !draft.done });
      },
      clearDone: () => tasks.removeWhere(t => t.done),
      
      // Read operations
      getTasks: () => tasks.get(),
      getTask: (index: number) => tasks.at(index),
      count: () => tasks.length(),
    };
  },
});
```

### List Helper Methods

The `list()` helper provides array-like methods:

| Method                      | Description                          |
| --------------------------- | ------------------------------------ |
| `get()`                     | Get entire array                     |
| `at(index)`                 | Get item at index                    |
| `length()`                  | Get array length                     |
| `isEmpty()`                 | Check if empty                       |
| `first()` / `last()`        | Get first/last item                  |
| `push(...items)`            | Add to end                           |
| `unshift(...items)`         | Add to beginning                     |
| `pop()` / `shift()`         | Remove from end/beginning            |
| `remove(...items)`          | Remove by reference                  |
| `removeAt(index)`           | Remove at index                      |
| `removeWhere(predicate)`    | Remove matching items                |
| `insert(index, ...items)`   | Insert at position                   |
| `set(index, value)`         | Set item (supports reducers)         |
| `clear()`                   | Remove all items                     |
| `replace(items)`            | Replace entire array                 |
| `find(predicate)`           | Find matching item                   |
| `includes(item)`            | Check if exists                      |

### Using Reducers with set()

The `set()` method accepts direct values, reducer functions, or Immer-style updaters:

```ts
import { toggle, increment, decrement } from 'storion';

// Direct value
tasks.set(0, newTask);

// Reducer function (returns new value)
tasks.set(0, prev => ({ ...prev, title: 'Updated' }));

// Immer-style updater (mutates draft)
tasks.set(0, draft => { draft.done = true });

// Built-in reducers
tasks.set(0, toggle());  // Toggle boolean field (if T is boolean)
```

---

## Map Helper for Key-Value Data

Use [`map()`](/api/map) for object/record state:

```ts
interface Widget {
  id: string;
  type: 'chart' | 'table' | 'metric';
  title: string;
  config: Record<string, unknown>;
}

const dashboardStore = store({
  name: 'dashboard',
  state: {
    widgets: {} as Record<string, Widget>,
  },
  setup({ focus }) {
    const widgets = focus('widgets').as(map());

    return {
      addWidget: (widget: Widget) => {
        widgets.set(widget.id, widget);
      },
      removeWidget: (id: string) => widgets.delete(id),
      updateWidget: (id: string, updates: Partial<Widget>) => {
        widgets.set(id, draft => Object.assign(draft, updates));
      },
      
      // Read operations
      getWidget: (id: string) => widgets.at(id),
      hasWidget: (id: string) => widgets.has(id),
      getAllWidgets: () => widgets.values(),
      widgetCount: () => widgets.size(),
    };
  },
});
```

### Map Helper Methods

| Method                    | Description                          |
| ------------------------- | ------------------------------------ |
| `get()`                   | Get entire record                    |
| `at(key)`                 | Get value by key                     |
| `size()`                  | Get entry count                      |
| `isEmpty()`               | Check if empty                       |
| `has(key)`                | Check if key exists                  |
| `set(key, value)`         | Set value (supports reducers)        |
| `delete(...keys)`         | Delete by key(s)                     |
| `deleteWhere(predicate)`  | Delete matching entries              |
| `clear()`                 | Remove all entries                   |
| `replace(record)`         | Replace entire record                |
| `keys()` / `values()`     | Get all keys/values                  |
| `entries()`               | Get all [key, value] pairs           |

---

## Real-World Example: Task Management

Here's a complete task management store with categories:

```ts
import { store, list, map } from 'storion/react';

interface Task {
  id: string;
  title: string;
  done: boolean;
  priority: 'low' | 'medium' | 'high';
  categoryId: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
}

const taskManagerStore = store({
  name: 'taskManager',
  state: {
    tasks: [] as Task[],
    categories: {} as Record<string, Category>,
    filter: 'all' as 'all' | 'active' | 'done',
  },
  setup({ state, focus }) {
    const tasks = focus('tasks').as(list());
    const categories = focus('categories').as(map());

    return {
      // Task operations
      addTask: (title: string, categoryId: string, priority: Task['priority'] = 'medium') => {
        tasks.push({
          id: crypto.randomUUID(),
          title,
          done: false,
          priority,
          categoryId,
        });
      },
      
      toggleTask: (id: string) => {
        const index = tasks.findIndex(t => t.id === id);
        if (index !== -1) {
          tasks.set(index, draft => { draft.done = !draft.done });
        }
      },
      
      deleteTask: (id: string) => {
        const task = tasks.find(t => t.id === id);
        if (task) tasks.remove(task);
      },
      
      clearDone: () => tasks.removeWhere(t => t.done),

      // Category operations
      addCategory: (name: string, color: string) => {
        const id = crypto.randomUUID();
        categories.set(id, { id, name, color });
        return id;
      },
      
      deleteCategory: (id: string) => {
        // Remove category and all its tasks
        tasks.removeWhere(t => t.categoryId === id);
        categories.delete(id);
      },

      // Filter
      setFilter: (filter: typeof state.filter) => {
        state.filter = filter;
      },

      // Computed
      getFilteredTasks: () => {
        const allTasks = tasks.get();
        switch (state.filter) {
          case 'active': return allTasks.filter(t => !t.done);
          case 'done': return allTasks.filter(t => t.done);
          default: return allTasks;
        }
      },
      
      getTasksByCategory: (categoryId: string) => {
        return tasks.filter(t => t.categoryId === categoryId);
      },
      
      getStats: () => ({
        total: tasks.length(),
        done: tasks.filter(t => t.done).length,
        active: tasks.filter(t => !t.done).length,
      }),
    };
  },
});
```

### Using in React

```tsx
function TaskList() {
  const { tasks, toggleTask, deleteTask, getStats } = useStore(({ get }) => {
    const [, actions] = get(taskManagerStore);
    return {
      tasks: actions.getFilteredTasks(),
      toggleTask: actions.toggleTask,
      deleteTask: actions.deleteTask,
      getStats: actions.getStats,
    };
  });

  const stats = getStats();

  return (
    <div>
      <header>
        <span>{stats.active} active</span>
        <span>{stats.done} done</span>
      </header>
      
      <ul>
        {tasks.map(task => (
          <li key={task.id}>
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => toggleTask(task.id)}
            />
            <span>{task.title}</span>
            <button onClick={() => deleteTask(task.id)}>×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## Real-World Example: Widget Dashboard with Child Stores

For complex widgets that need their own state, actions, and async operations, use [`create()`](/api/store#create-spec) to create isolated child stores:

### Step 1: Define the Widget Store

Each widget is its own store with async data fetching:

```ts
import { store } from 'storion/react';
import { async } from 'storion/async';

type WidgetType = 'metric' | 'chart' | 'list' | 'weather';

interface WidgetConfig {
  type: WidgetType;
  title: string;
  color: string;
}

// Each widget instance is a separate store
const widgetStore = store({
  name: 'widget',
  lifetime: 'autoDispose', // Auto-cleanup when parent disposes
  state: {
    type: 'metric' as WidgetType,
    title: 'Widget',
    color: '#8b5cf6',
    // Async state for widget data
    data: async.stale<Record<string, unknown>>({}),
  },
  setup({ state, focus }) {
    const dataFocus = focus('data');

    // Async action to refresh widget data
    const refreshQuery = async.action(dataFocus, async (ctx) => {
      // Simulate API call (500ms - 2000ms delay)
      const delay = 500 + Math.random() * 1500;
      await new Promise(resolve => setTimeout(resolve, delay));

      // Return data based on widget type
      switch (state.type) {
        case 'metric':
          return { value: Math.floor(Math.random() * 10000), trend: 'up' };
        case 'chart':
          return { data: Array.from({ length: 6 }, () => Math.random() * 100) };
        case 'weather':
          return { temp: Math.floor(50 + Math.random() * 40), condition: 'sunny' };
        default:
          return {};
      }
    });

    return {
      // Initialize widget with config
      init: (config: WidgetConfig) => {
        state.type = config.type;
        state.title = config.title;
        state.color = config.color;
        refreshQuery.dispatch(); // Fetch initial data
      },

      // Refresh widget data
      refresh: refreshQuery.dispatch,

      // Update properties
      setTitle: (title: string) => { state.title = title; },
      setColor: (color: string) => { state.color = color; },
    };
  },
});
```

### Step 2: Define the Dashboard Store

The parent store manages widget instances using `create()`:

```ts
import { store, type StoreInstance } from 'storion/react';

// Type for widget instances
type WidgetInstance = StoreInstance<any, any>;

const dashboardStore = store({
  name: 'dashboard',
  state: {
    widgets: {} as Record<string, WidgetInstance>,
    selectedWidgetId: null as string | null,
    isEditing: false,
  },
  setup({ state, update, create }) {
    // Widget templates
    const templates: Record<WidgetType, Omit<WidgetConfig, 'type'>> = {
      metric: { title: 'Metric', color: '#8b5cf6' },
      chart: { title: 'Chart', color: '#06b6d4' },
      list: { title: 'Items', color: '#f59e0b' },
      weather: { title: 'Weather', color: '#10b981' },
    };

    return {
      // Add a new widget
      addWidget: (type: WidgetType) => {
        const id = crypto.randomUUID();
        const template = templates[type];

        // Create isolated child store instance
        const instance = create(widgetStore);
        instance.actions.init({ type, ...template });

        update(draft => { draft.widgets[id] = instance; });
        return id;
      },

      // Remove widget (dispose child store)
      removeWidget: (id: string) => {
        const instance = state.widgets[id];
        if (instance) {
          instance.dispose(); // Clean up child store
        }
        update(draft => {
          delete draft.widgets[id];
          if (draft.selectedWidgetId === id) {
            draft.selectedWidgetId = null;
          }
        });
      },

      // Duplicate a widget
      duplicateWidget: (id: string) => {
        const original = state.widgets[id];
        if (original) {
          const newId = crypto.randomUUID();
          const instance = create(widgetStore);
          instance.actions.init({
            type: original.state.type,
            title: `${original.state.title} (copy)`,
            color: original.state.color,
          });
          update(draft => { draft.widgets[newId] = instance; });
          return newId;
        }
        return null;
      },

      // Selection
      selectWidget: (id: string | null) => {
        state.selectedWidgetId = id;
      },

      getSelectedWidget: () => {
        return state.selectedWidgetId
          ? state.widgets[state.selectedWidgetId]
          : undefined;
      },

      // Edit mode
      toggleEditing: () => {
        state.isEditing = !state.isEditing;
        if (!state.isEditing) state.selectedWidgetId = null;
      },

      // Getters
      getWidgets: () => {
        return Object.entries(state.widgets).map(([id, instance]) => ({
          id,
          instance,
        }));
      },

      getWidgetCount: () => Object.keys(state.widgets).length,

      // Refresh all widgets
      refreshAll: () => {
        for (const instance of Object.values(state.widgets)) {
          instance.actions.refresh();
        }
      },

      // Clear all (dispose all child stores)
      clearAll: () => {
        for (const instance of Object.values(state.widgets)) {
          instance.dispose();
        }
        update(draft => {
          draft.widgets = {};
          draft.selectedWidgetId = null;
        });
      },
    };
  },
});
```

### Step 3: Use in React Components

```tsx
function WidgetCard({ id, instance }: { id: string; instance: WidgetInstance }) {
  // Access child store's state directly
  const { title, color, status, refresh } = useStore(() => ({
    title: instance.state.title,
    color: instance.state.color,
    status: instance.state.data.status,
    refresh: instance.actions.refresh,
  }));

  const isPending = status === 'pending';

  return (
    <div style={{ borderColor: color }}>
      <header>
        <h3>{title}</h3>
        <button onClick={refresh} disabled={isPending}>
          {isPending ? '⏳' : '🔄'} Refresh
        </button>
      </header>
      {isPending && <div className="loading-bar" />}
      {/* Widget content */}
    </div>
  );
}

function Dashboard() {
  const { widgets, addWidget, refreshAll } = useStore(({ get }) => {
    const [, actions] = get(dashboardStore);
    return {
      widgets: actions.getWidgets(),
      addWidget: actions.addWidget,
      refreshAll: actions.refreshAll,
    };
  });

  return (
    <div>
      <header>
        <button onClick={() => addWidget('metric')}>Add Metric</button>
        <button onClick={() => addWidget('chart')}>Add Chart</button>
        <button onClick={refreshAll}>Refresh All</button>
      </header>
      
      <div className="grid">
        {widgets.map(({ id, instance }) => (
          <WidgetCard key={id} id={id} instance={instance} />
        ))}
      </div>
    </div>
  );
}
```

### Benefits of Child Stores

| Benefit                    | Description                                    |
| -------------------------- | ---------------------------------------------- |
| **Isolated state**         | Each widget has its own async loading state    |
| **Independent refresh**    | Refresh one widget without affecting others    |
| **Clean disposal**         | `dispose()` cleans up subscriptions/effects    |
| **Type safety**            | Full TypeScript support for each instance      |
| **DevTools support**       | Each widget shows as separate store in devtools |

---

## Auto-Dispose for Resources

When managing objects that need cleanup (connections, subscriptions), use the `autoDispose` option:

```ts
interface Connection {
  id: string;
  socket: WebSocket;
  dispose(): void;
}

const connectionStore = store({
  name: 'connections',
  state: {
    connections: {} as Record<string, Connection>,
  },
  setup({ focus }) {
    // autoDispose calls item.dispose() when removed
    const connections = focus('connections').as(map({ autoDispose: true }));

    return {
      connect: (url: string) => {
        const id = crypto.randomUUID();
        const socket = new WebSocket(url);
        
        connections.set(id, {
          id,
          socket,
          dispose: () => socket.close(),
        });
        
        return id;
      },
      
      disconnect: (id: string) => {
        // dispose() is called automatically!
        connections.delete(id);
      },
      
      disconnectAll: () => {
        // All connections disposed automatically
        connections.clear();
      },
    };
  },
});
```

---

## When to Use Which

| Approach                     | Use When                                           |
| ---------------------------- | -------------------------------------------------- |
| `focus().as(list())`         | Dynamic arrays with simple items                   |
| `focus().as(map())`          | Key-value collections, fast lookups                |
| `create()` + child stores    | Items needing own state, async, effects, lifecycle |

### Guidelines

1. **Start simple**: Use `list()` or `map()` for plain data
2. **Upgrade when needed**: Use `create()` when items need:
   - Their own async operations (loading states)
   - Independent effects or subscriptions
   - Complex internal state machines
3. **Consider lifecycle**: 
   - Use `autoDispose` option for resources with `dispose()` method
   - Use `create()` for full store lifecycle management
4. **Keep it flat**: Avoid deeply nested structures when possible

---

## Summary

- Use [`focus().as(list())`](/api/list) for dynamic array state
- Use [`focus().as(map())`](/api/map) for key-value state
- Both eliminate reducer boilerplate with intuitive methods
- Use `autoDispose` option for automatic resource cleanup
- Use [`create()`](/api/store#create-spec) for child stores with async, effects, or complex state
