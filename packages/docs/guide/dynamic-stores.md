# Dynamic Nested State

Learn how to manage dynamic collections like task lists, widget dashboards, and multi-document editors using [`focus()`](/api/store#focus-path-options) helpers and [`create()`](/api/store#create-spec).

**Time to read:** ~15 minutes

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

### Why Traditional Approaches Fall Short

Traditional reducer patterns lead to several pain points:

```ts
// ❌ PROBLEM 1: Verbose boilerplate
// Every CRUD operation requires a new case with immutable update logic
function taskReducer(state, action) {
  switch (action.type) {
    case 'ADD_TASK':
      // Must spread to maintain immutability
      return [...state, action.payload];
    case 'REMOVE_TASK':
      // Filter creates new array every time
      return state.filter(t => t.id !== action.payload);
    case 'UPDATE_TASK':
      // Map + spread for nested updates - easy to get wrong
      return state.map(t => 
        t.id === action.payload.id 
          ? { ...t, ...action.payload }  // What if payload has nested objects?
          : t
      );
    case 'TOGGLE_TASK':
      return state.map(t => 
        t.id === action.payload 
          ? { ...t, done: !t.done } 
          : t
      );
    // ❌ PROBLEM 2: Action explosion
    // Need separate cases for: REORDER_TASK, SET_PRIORITY, 
    // ADD_SUBTASK, TOGGLE_SUBTASK, MOVE_TASK, etc.
  }
}

// ❌ PROBLEM 3: Type safety gaps
// Action payloads are stringly-typed, easy to misspell
dispatch({ type: 'TOGLE_TASK', payload: id }); // Typo - silently does nothing!

// ❌ PROBLEM 4: Scattered logic
// Business logic lives far from state definition
// Hard to see what operations are available at a glance
```

> **Key Insight:** The core issue is that reducers force you to think in terms of *state transformations* rather than *intent*. You want to say "add this task" but must write "spread state, append item, return new array."

---

## Solution: Focus Helpers

Storion provides [`list()`](/api/list) and [`map()`](/api/map) helpers that transform a [`focus()`](/api/store#focus-path-options) into an ergonomic API for arrays and objects.

> **Analogy:** Think of `focus()` as a lens that zooms into a specific part of your state. The `list()` and `map()` helpers add array/object-specific methods to that lens, letting you manipulate that slice of state naturally.

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
    // Start with empty array - list() handles undefined/null gracefully
    tasks: [] as Task[],
  },
  setup({ focus }) {
    // KEY CONCEPT: focus('tasks') creates a lens to the tasks array
    // .as(list()) transforms it into an ergonomic list API
    // This happens ONCE during setup - the methods are stable
    const tasks = focus('tasks').as(list());

    return {
      // ✅ READABLE: Intent is clear - "add a task"
      // No spread operators, no manual immutability
      addTask: (title: string) => {
        // Under the hood: Immer handles immutability
        // This mutation is safe and tracked
        tasks.push({ id: crypto.randomUUID(), title, done: false });
      },

      // ✅ CONCISE: One-liner operations
      removeTask: (task: Task) => tasks.remove(task),

      // ✅ FLEXIBLE: set() accepts direct value, reducer, or Immer updater
      toggleTask: (index: number) => {
        // Immer-style: mutate the draft directly
        tasks.set(index, draft => { draft.done = !draft.done });
      },

      // ✅ EXPRESSIVE: Declarative removal by predicate
      clearDone: () => tasks.removeWhere(t => t.done),
      
      // Read operations - all return current values
      getTasks: () => tasks.get(),        // Entire array
      getTask: (index: number) => tasks.at(index),  // Single item
      count: () => tasks.length(),        // Array length
    };
  },
});
```

### What's Happening Under the Hood?

When you call `focus('tasks').as(list())`:

1. **`focus('tasks')`** creates a getter/setter pair for `state.tasks`
2. **`.as(list())`** wraps those with array-friendly methods
3. **Each method** (push, remove, etc.) calls the setter with an Immer producer
4. **Storion** detects the state change and notifies subscribers

```ts
// Conceptually, tasks.push(item) becomes:
focus.setter(draft => {
  draft.push(item);  // Immer mutation - safe!
});
// Which triggers: state.tasks = produce(state.tasks, draft => draft.push(item))
```

### List Helper Methods

The `list()` helper provides array-like methods:

| Method                      | Description                          | Notes |
| --------------------------- | ------------------------------------ | ----- |
| `get()`                     | Get entire array                     | Returns `T[]`, never undefined |
| `at(index)`                 | Get item at index                    | Returns `T \| undefined` |
| `length()`                  | Get array length                     | |
| `isEmpty()`                 | Check if empty                       | |
| `first()` / `last()`        | Get first/last item                  | Returns `T \| undefined` |
| `push(...items)`            | Add to end                           | Variadic - push multiple at once |
| `unshift(...items)`         | Add to beginning                     | |
| `pop()` / `shift()`         | Remove from end/beginning            | Returns removed item |
| `remove(...items)`          | Remove by reference                  | Uses strict equality |
| `removeAt(index)`           | Remove at index                      | |
| `removeWhere(predicate)`    | Remove matching items                | Removes ALL matches |
| `insert(index, ...items)`   | Insert at position                   | |
| `set(index, value)`         | Set item (supports reducers)         | See below |
| `clear()`                   | Remove all items                     | |
| `replace(items)`            | Replace entire array                 | |
| `find(predicate)`           | Find matching item                   | Like `Array.find()` |
| `findIndex(predicate)`      | Find matching index                  | Like `Array.findIndex()` |
| `filter(predicate)`         | Filter items (read-only)             | Returns new array, doesn't mutate |
| `includes(item)`            | Check if exists                      | |

### The Power of set() - Three Ways to Update

The `set()` method is versatile - it accepts three different argument types:

```ts
import { toggle, increment, decrement } from 'storion';

// ============================================================
// APPROACH 1: Direct Value
// ============================================================
// When: You have the complete new value ready
tasks.set(0, newTask);
// Pros: Simple, explicit
// Cons: Must construct entire object

// ============================================================
// APPROACH 2: Reducer Function (prev => newValue)
// ============================================================
// When: New value depends on old value, need full replacement
tasks.set(0, prev => ({
  ...prev,
  title: 'Updated',
  // Reducer returns NEW value - doesn't mutate
}));
// Pros: Access to previous value
// Cons: Must handle immutability manually with spread

// ============================================================
// APPROACH 3: Immer-Style Updater (draft => { mutate })
// ============================================================
// When: Need to mutate deeply nested properties
tasks.set(0, draft => {
  draft.done = true;
  draft.updatedAt = new Date();
  // Mutate the draft directly - Immer handles immutability!
});
// Pros: Natural mutation syntax, handles deep nesting
// Cons: Slightly more overhead (Immer proxy)

// ============================================================
// APPROACH 4: Built-in Reducers
// ============================================================
// When: Common operations on primitive values
// Note: These work when T is boolean/number
priorities.set(0, toggle());      // Flip boolean
counts.set(0, increment());       // +1
counts.set(0, decrement());       // -1
counts.set(0, increment(5));      // +5
```

> **How does Storion know which approach you're using?**  
> It checks if your function returns `undefined`. Immer updaters return nothing (mutate in place), while reducers return the new value.

---

## Map Helper for Key-Value Data

Use [`map()`](/api/map) for object/record state - ideal when you need **O(1) lookup by key**:

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
    // Using Record<string, T> for key-based access
    // Consider: {} vs [] - see "Choosing Between list() and map()" below
    widgets: {} as Record<string, Widget>,
  },
  setup({ focus }) {
    // map() provides object-friendly methods
    const widgets = focus('widgets').as(map());

    return {
      // ✅ Key-based operations - natural for entities with IDs
      addWidget: (widget: Widget) => {
        // Use the widget's own ID as the key
        widgets.set(widget.id, widget);
      },

      // ✅ Direct key deletion - no filtering needed
      removeWidget: (id: string) => widgets.delete(id),

      // ✅ Partial updates with Immer
      updateWidget: (id: string, updates: Partial<Widget>) => {
        widgets.set(id, draft => Object.assign(draft, updates));
      },
      
      // Read operations
      getWidget: (id: string) => widgets.at(id),  // O(1) lookup
      hasWidget: (id: string) => widgets.has(id), // Check existence
      getAllWidgets: () => widgets.values(),       // Array of values
      widgetCount: () => widgets.size(),
    };
  },
});
```

### Map Helper Methods

| Method                    | Description                          | Notes |
| ------------------------- | ------------------------------------ | ----- |
| `get()`                   | Get entire record                    | Returns `Record<string, T>` |
| `at(key)`                 | Get value by key                     | Returns `T \| undefined` |
| `size()`                  | Get entry count                      | |
| `isEmpty()`               | Check if empty                       | |
| `has(key)`                | Check if key exists                  | |
| `set(key, value)`         | Set value (supports reducers)        | Same 3 approaches as list |
| `delete(...keys)`         | Delete by key(s)                     | Variadic |
| `deleteWhere(predicate)`  | Delete matching entries              | Receives `(value, key)` |
| `clear()`                 | Remove all entries                   | |
| `replace(record)`         | Replace entire record                | |
| `keys()` / `values()`     | Get all keys/values                  | Returns arrays |
| `entries()`               | Get all [key, value] pairs           | |

### Choosing Between list() and map()

| Criteria                    | `list()` (Array)           | `map()` (Record)           |
| --------------------------- | -------------------------- | -------------------------- |
| **Primary access pattern**  | By index, iteration        | By key/ID                  |
| **Lookup performance**      | O(n) for find by ID        | O(1) for get by key        |
| **Order preserved?**        | ✅ Yes, always             | ⚠️ Object keys have order* |
| **Duplicate handling**      | Allows duplicates          | Keys must be unique        |
| **Use when...**             | Ordered lists, queues      | Entities with unique IDs   |

> *Object key order is preserved in modern JS, but use `list()` if order is semantically important.

---

## Real-World Example: Task Management

Here's a complete task management store demonstrating common patterns:

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
    // DESIGN DECISION: tasks as array vs record
    // Using array because:
    // 1. Users see tasks in a specific order
    // 2. We need to support drag-drop reordering
    // 3. Most operations iterate all tasks anyway (filtering, counting)
    tasks: [] as Task[],

    // DESIGN DECISION: categories as record
    // Using record because:
    // 1. Lookup by ID is frequent (showing category color for each task)
    // 2. No meaningful order (sidebar just lists them)
    // 3. Names must be unique anyway
    categories: {} as Record<string, Category>,

    // Simple primitive - no need for focus helper
    filter: 'all' as 'all' | 'active' | 'done',
  },
  setup({ state, focus }) {
    // Create focused helpers ONCE during setup
    // These are stable references - safe to expose in actions
    const tasks = focus('tasks').as(list());
    const categories = focus('categories').as(map());

    return {
      // ===========================================================
      // TASK OPERATIONS
      // ===========================================================

      addTask: (title: string, categoryId: string, priority: Task['priority'] = 'medium') => {
        // CONSIDERATION: Where to generate ID?
        // - Here in action: Simple, works for most cases
        // - From server: Use optimistic update pattern instead
        tasks.push({
          id: crypto.randomUUID(),
          title,
          done: false,
          priority,
          categoryId,
        });
      },
      
      toggleTask: (id: string) => {
        // PATTERN: Find-then-update for ID-based operations on arrays
        // Trade-off: O(n) lookup, but keeps array benefits (order, duplicates)
        const index = tasks.findIndex(t => t.id === id);
        if (index !== -1) {
          tasks.set(index, draft => { draft.done = !draft.done });
        }
        // CONSIDERATION: What if task not found?
        // Silent no-op is usually fine for UI actions
        // Throw if this indicates a bug in calling code
      },
      
      deleteTask: (id: string) => {
        // PATTERN: Find item first, then remove by reference
        // This ensures we remove the exact item, not a similar one
        const task = tasks.find(t => t.id === id);
        if (task) tasks.remove(task);
      },
      
      clearDone: () => {
        // CLEAN: Declarative predicate - intent is crystal clear
        tasks.removeWhere(t => t.done);
      },

      // ===========================================================
      // CATEGORY OPERATIONS
      // ===========================================================

      addCategory: (name: string, color: string) => {
        const id = crypto.randomUUID();
        categories.set(id, { id, name, color });
        // Return ID for caller to use (e.g., select the new category)
        return id;
      },
      
      deleteCategory: (id: string) => {
        // IMPORTANT: Handle cascading deletes!
        // Must remove category's tasks first, otherwise they become orphans
        // Order matters: remove tasks, then category
        tasks.removeWhere(t => t.categoryId === id);
        categories.delete(id);
        // CONSIDERATION: Alternative approaches:
        // 1. Move orphan tasks to "Uncategorized" (set categoryId to null)
        // 2. Prevent deletion if category has tasks (throw or return false)
        // 3. Soft delete (add deletedAt timestamp)
      },

      // ===========================================================
      // FILTER
      // ===========================================================

      setFilter: (filter: typeof state.filter) => {
        // Simple primitive mutation - no focus helper needed
        state.filter = filter;
      },

      // ===========================================================
      // COMPUTED / DERIVED DATA
      // These are getters, not actions - they compute from current state
      // ===========================================================

      getFilteredTasks: () => {
        // PATTERN: Compute on demand from raw state
        // Trade-off: Recomputes on every call
        // For expensive computations, consider effect() + computed state
        const allTasks = tasks.get();
        switch (state.filter) {
          case 'active': return allTasks.filter(t => !t.done);
          case 'done': return allTasks.filter(t => t.done);
          default: return allTasks;
        }
      },
      
      getTasksByCategory: (categoryId: string) => {
        // Using the read-only filter() method from list helper
        return tasks.filter(t => t.categoryId === categoryId);
      },
      
      getStats: () => {
        // PATTERN: Aggregate multiple derived values
        // Consider memoization if called frequently with large datasets
        const allTasks = tasks.get();
        const done = allTasks.filter(t => t.done).length;
        return {
          total: allTasks.length,
          done,
          active: allTasks.length - done,
        };
      },

      // Category lookups for UI
      getCategory: (id: string) => categories.at(id),
      getCategories: () => categories.values(),
    };
  },
});
```

### Using in React Components

```tsx
function TaskList() {
  // PATTERN: Select only what you need
  // This component re-renders only when these specific values change
  const { tasks, toggleTask, deleteTask, stats } = useStore(({ get }) => {
    const [, actions] = get(taskManagerStore);
    return {
      // Computed values - will recompute when underlying state changes
      tasks: actions.getFilteredTasks(),
      stats: actions.getStats(),
      // Stable action references - never cause re-renders
      toggleTask: actions.toggleTask,
      deleteTask: actions.deleteTask,
    };
  });

  return (
    <div>
      {/* Stats header - updates reactively */}
      <header>
        <span>{stats.active} active</span>
        <span>{stats.done} done</span>
      </header>
      
      {/* Task list - keyed by ID for proper React reconciliation */}
      <ul>
        {tasks.map(task => (
          <li key={task.id}>
            <input
              type="checkbox"
              checked={task.done}
              onChange={() => toggleTask(task.id)}
            />
            <span style={{ 
              textDecoration: task.done ? 'line-through' : 'none' 
            }}>
              {task.title}
            </span>
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

For complex widgets that need their own state, actions, and async operations, use [`create()`](/api/store#create-spec) to create isolated child stores.

### When to Use Child Stores vs Focus Helpers

| Scenario                                  | Approach                |
| ----------------------------------------- | ----------------------- |
| Simple data items (tasks, products)       | `list()` or `map()`     |
| Items with independent loading states     | Child stores            |
| Items with their own effects/subscriptions| Child stores            |
| Items that need DevTools inspection       | Child stores            |
| Items with complex internal state machine | Child stores            |

> **Key Insight:** If you find yourself adding `isLoading`, `error`, `lastFetched` fields to each item in an array, that's a sign you need child stores.

### Step 1: Define the Widget Store (Child)

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

// DESIGN DECISION: Separate store spec for widget
// This store will be instantiated multiple times - once per widget
// Each instance is completely isolated (own state, own subscriptions)
const widgetStore = store({
  name: 'widget',

  // CRITICAL: autoDispose ensures cleanup when parent disposes this instance
  // Without this, child stores would leak when widgets are removed
  lifetime: 'autoDispose',

  state: {
    type: 'metric' as WidgetType,
    title: 'Widget',
    color: '#8b5cf6',

    // PATTERN: async.stale() for data that should show last value while loading
    // Alternative: async.fresh() if you want to show loading spinner instead
    // stale({}) means show empty object initially, keep showing last data during refresh
    data: async.stale<Record<string, unknown>>({}),
  },

  setup({ state, focus }) {
    // Focus on the async data field for the query
    const dataFocus = focus('data');

    // PATTERN: Define async action for data fetching
    // async.action() provides:
    // - Automatic status tracking (idle → pending → success/error)
    // - Cancellation on re-dispatch (no stale responses)
    // - Error handling with retry capability
    const refreshQuery = async.action(dataFocus, async (ctx) => {
      // Simulate network latency (realistic for demos)
      const delay = 500 + Math.random() * 1500;
      await new Promise(resolve => setTimeout(resolve, delay));

      // CONSIDERATION: In real apps, this would be API calls
      // Each widget type might call different endpoints
      switch (state.type) {
        case 'metric':
          // await fetch('/api/metrics/sales')
          return { value: Math.floor(Math.random() * 10000), trend: 'up' };
        case 'chart':
          // await fetch('/api/charts/revenue')
          return { data: Array.from({ length: 6 }, () => Math.random() * 100) };
        case 'weather':
          // await fetch('/api/weather/current')
          return { temp: Math.floor(50 + Math.random() * 40), condition: 'sunny' };
        default:
          return {};
      }
    });

    return {
      // Initialize widget with configuration
      // Called once when widget is created
      init: (config: WidgetConfig) => {
        state.type = config.type;
        state.title = config.title;
        state.color = config.color;
        // Immediately fetch initial data
        refreshQuery.dispatch();
      },

      // Expose refresh for manual refresh button
      refresh: refreshQuery.dispatch,

      // Simple property updates
      setTitle: (title: string) => { state.title = title; },
      setColor: (color: string) => { state.color = color; },
    };
  },
});
```

### Step 2: Define the Dashboard Store (Parent)

The parent store manages widget instances using `create()`:

```ts
import { store, type StoreInstance } from 'storion/react';

// Type alias for readability
// StoreInstance gives you { state, actions, dispose() }
type WidgetInstance = StoreInstance<any, any>;

const dashboardStore = store({
  name: 'dashboard',
  state: {
    // DESIGN DECISION: Record<id, instance> for O(1) widget lookup
    // Storing StoreInstance objects directly in state
    // These are NOT serializable - don't try to persist this!
    widgets: {} as Record<string, WidgetInstance>,
    selectedWidgetId: null as string | null,
    isEditing: false,
  },

  setup({ state, update, create }) {
    // PATTERN: Define templates/defaults for each widget type
    // Keeps addWidget() clean and ensures consistency
    const templates: Record<WidgetType, Omit<WidgetConfig, 'type'>> = {
      metric: { title: 'Metric', color: '#8b5cf6' },
      chart: { title: 'Chart', color: '#06b6d4' },
      list: { title: 'Items', color: '#f59e0b' },
      weather: { title: 'Weather', color: '#10b981' },
    };

    return {
      // ===========================================================
      // WIDGET LIFECYCLE
      // ===========================================================

      addWidget: (type: WidgetType) => {
        const id = crypto.randomUUID();
        const template = templates[type];

        // KEY CONCEPT: create() instantiates a child store
        // - Child's lifecycle is linked to parent
        // - Child appears in DevTools as separate store
        // - Child has its own state, actions, effects
        const instance = create(widgetStore);

        // Initialize the widget with its config
        // This triggers the initial data fetch
        instance.actions.init({ type, ...template });

        // Add to parent state
        // Using update() for immutable nested update
        update(draft => { draft.widgets[id] = instance; });

        return id; // Return ID for caller to use
      },

      removeWidget: (id: string) => {
        const instance = state.widgets[id];
        if (instance) {
          // CRITICAL: Explicitly dispose child store
          // This cancels pending async operations, cleans up effects
          // Without this, the store would keep running in the background!
          instance.dispose();
        }

        update(draft => {
          delete draft.widgets[id];
          // Also clear selection if we removed the selected widget
          if (draft.selectedWidgetId === id) {
            draft.selectedWidgetId = null;
          }
        });
      },

      duplicateWidget: (id: string) => {
        const original = state.widgets[id];
        if (!original) return null;

        const newId = crypto.randomUUID();

        // Create new instance with copied config
        const instance = create(widgetStore);
        instance.actions.init({
          type: original.state.type,
          title: `${original.state.title} (copy)`,
          color: original.state.color,
        });

        update(draft => { draft.widgets[newId] = instance; });
        return newId;
      },

      // ===========================================================
      // SELECTION
      // ===========================================================

      selectWidget: (id: string | null) => {
        state.selectedWidgetId = id;
      },

      getSelectedWidget: () => {
        return state.selectedWidgetId
          ? state.widgets[state.selectedWidgetId]
          : undefined;
      },

      // ===========================================================
      // EDIT MODE
      // ===========================================================

      toggleEditing: () => {
        state.isEditing = !state.isEditing;
        // Clear selection when exiting edit mode
        if (!state.isEditing) state.selectedWidgetId = null;
      },

      // ===========================================================
      // BULK OPERATIONS
      // ===========================================================

      getWidgets: () => {
        // Transform Record to array with IDs for rendering
        return Object.entries(state.widgets).map(([id, instance]) => ({
          id,
          instance,
        }));
      },

      getWidgetCount: () => Object.keys(state.widgets).length,

      refreshAll: () => {
        // PATTERN: Iterate all child stores, call their actions
        // Each widget's refresh is independent - one failure doesn't affect others
        for (const instance of Object.values(state.widgets)) {
          instance.actions.refresh();
        }
      },

      clearAll: () => {
        // CRITICAL: Dispose ALL child stores before clearing
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
// PATTERN: Widget card component receives instance directly
// This is efficient - we're not passing serializable data
function WidgetCard({ id, instance }: { id: string; instance: WidgetInstance }) {
  // Access child store's state directly from the instance
  // useStore re-renders this component when these values change
  const { title, color, status, refresh } = useStore(() => ({
    title: instance.state.title,
    color: instance.state.color,
    // async state has status: 'idle' | 'pending' | 'success' | 'error'
    status: instance.state.data.status,
    refresh: instance.actions.refresh,
  }));

  const isPending = status === 'pending';

  return (
    <div 
      className="widget-card"
      style={{ borderColor: color }}
    >
      <header>
        <h3>{title}</h3>
        {/* Refresh button - disabled while loading */}
        <button onClick={refresh} disabled={isPending}>
          {isPending ? '⏳' : '🔄'} Refresh
        </button>
      </header>

      {/* Loading indicator - only shows during pending */}
      {isPending && <div className="loading-bar" />}

      {/* Widget content - always shows (stale data during refresh) */}
      <WidgetContent instance={instance} />
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
    <div className="dashboard">
      {/* Toolbar */}
      <header>
        <div className="add-buttons">
          <button onClick={() => addWidget('metric')}>Add Metric</button>
          <button onClick={() => addWidget('chart')}>Add Chart</button>
          <button onClick={() => addWidget('weather')}>Add Weather</button>
        </div>
        <button onClick={refreshAll}>
          🔄 Refresh All
        </button>
      </header>
      
      {/* Widget grid */}
      <div className="widget-grid">
        {widgets.map(({ id, instance }) => (
          // Key by ID ensures proper React reconciliation
          <WidgetCard key={id} id={id} instance={instance} />
        ))}
      </div>
    </div>
  );
}
```

### Benefits of Child Stores

| Benefit                    | Explanation                                                |
| -------------------------- | ---------------------------------------------------------- |
| **Isolated state**         | Each widget has its own `status`, `error`, `data` - no interference |
| **Independent refresh**    | Refresh Widget A while Widget B shows its cached data      |
| **Clean disposal**         | `dispose()` cancels pending fetches, removes effects       |
| **Type safety**            | Full TypeScript inference for each instance's state/actions |
| **DevTools support**       | Each widget appears as separate store - inspect individually |
| **Encapsulation**          | Widget logic lives in widgetStore, dashboard just orchestrates |

---

## Auto-Dispose for Resources

When managing objects that need cleanup (connections, subscriptions, timers), use the `autoDispose` option on `list()` or `map()`:

```ts
interface Connection {
  id: string;
  socket: WebSocket;
  // REQUIRED: dispose() method for autoDispose to work
  dispose(): void;
}

const connectionStore = store({
  name: 'connections',
  state: {
    connections: {} as Record<string, Connection>,
  },
  setup({ focus }) {
    // PATTERN: autoDispose calls item.dispose() automatically on removal
    // This ensures resources are cleaned up even if you forget
    const connections = focus('connections').as(map({ autoDispose: true }));

    return {
      connect: (url: string) => {
        const id = crypto.randomUUID();
        const socket = new WebSocket(url);
        
        connections.set(id, {
          id,
          socket,
          // Define how to clean up this resource
          dispose: () => {
            console.log(`Closing connection ${id}`);
            socket.close();
          },
        });
        
        return id;
      },
      
      disconnect: (id: string) => {
        // Just delete - dispose() is called automatically!
        // No need to remember: connections.at(id)?.dispose()
        connections.delete(id);
      },
      
      disconnectAll: () => {
        // All connections disposed automatically
        // Each item's dispose() is called before removal
        connections.clear();
      },
    };
  },
});
```

### How autoDispose Works

```ts
// When you call:
connections.delete('abc');

// Internally, map() does:
// 1. Get current item: const item = connections.at('abc');
// 2. Remove from state: delete draft['abc'];
// 3. Schedule disposal: queueMicrotask(() => item.dispose?.());

// The queueMicrotask ensures disposal happens:
// - After the state update completes
// - Asynchronously (doesn't block the action)
// - Even if dispose() throws (other items still disposed)
```

### When to Use autoDispose

| Use Case                     | autoDispose? | Why |
| ---------------------------- | ------------ | --- |
| WebSocket connections        | ✅ Yes       | Must close socket |
| Event subscriptions          | ✅ Yes       | Must remove listener |
| Timers/intervals             | ✅ Yes       | Must clearInterval |
| Child store instances        | ❌ No        | Use `create()` instead |
| Plain data objects           | ❌ No        | Nothing to clean up |

---

## When to Use Which

| Approach                     | Use When                                           |
| ---------------------------- | -------------------------------------------------- |
| `focus().as(list())`         | Dynamic arrays with simple items                   |
| `focus().as(map())`          | Key-value collections, fast lookups                |
| `create()` + child stores    | Items needing own state, async, effects, lifecycle |

### Decision Flowchart

```
Do items need their own loading states?
├── Yes → Use create() + child stores
└── No
    └── Do you need O(1) lookup by ID?
        ├── Yes → Use map()
        └── No
            └── Is order semantically important?
                ├── Yes → Use list()
                └── No → Use map() (simpler for ID-based access)
```

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
- `set()` accepts direct values, reducers, or Immer updaters
- Use `autoDispose` option for automatic resource cleanup
- Use [`create()`](/api/store#create-spec) for child stores with async, effects, or complex state
- Child stores provide isolation, independent loading states, and clean disposal
