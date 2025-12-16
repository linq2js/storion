/**
 * Todo Store - Demonstrates selectors via useStore
 *
 * Demonstrates:
 * - Selectors as functions passed to useStore
 * - Composing derived state
 * - Memoization and caching
 */
import { store, type ActionsBase, type Selector } from "storion";

// ============================================
// Todo Types
// ============================================
export interface Todo {
  id: string;
  text: string;
  completed: boolean;
  priority: "low" | "medium" | "high";
  createdAt: number;
}

interface TodoState {
  todos: Todo[];
  filter: "all" | "active" | "completed";
  sortBy: "date" | "priority" | "text";
}

interface TodoActions extends ActionsBase {
  addTodo: (text: string, priority?: Todo["priority"]) => void;
  toggleTodo: (id: string) => void;
  deleteTodo: (id: string) => void;
  setFilter: (filter: TodoState["filter"]) => void;
  setSortBy: (sortBy: TodoState["sortBy"]) => void;
  clearCompleted: () => void;
}

export const todoStore = store<TodoState, TodoActions>({
  name: "todo",
  state: {
    todos: [
      {
        id: "1",
        text: "Learn Storion basics",
        completed: true,
        priority: "high",
        createdAt: Date.now() - 86400000,
      },
      {
        id: "2",
        text: "Master the Focus API",
        completed: false,
        priority: "high",
        createdAt: Date.now() - 43200000,
      },
      {
        id: "3",
        text: "Try async actions",
        completed: false,
        priority: "medium",
        createdAt: Date.now() - 3600000,
      },
      {
        id: "4",
        text: "Build something cool",
        completed: false,
        priority: "low",
        createdAt: Date.now(),
      },
    ],
    filter: "all",
    sortBy: "date",
  },
  setup: ({ state }) => ({
    addTodo: (text: string, priority: Todo["priority"] = "medium") => {
      // Reassign to trigger change detection
      state.todos = [
        ...state.todos,
        {
          id: crypto.randomUUID(),
          text,
          completed: false,
          priority,
          createdAt: Date.now(),
        },
      ];
    },
    toggleTodo: (id: string) => {
      // Must reassign array to trigger change detection
      state.todos = state.todos.map((t) =>
        t.id === id ? { ...t, completed: !t.completed } : t
      );
    },
    deleteTodo: (id: string) => {
      // filter() returns a new array, so this works
      state.todos = state.todos.filter((t) => t.id !== id);
    },
    setFilter: (filter: TodoState["filter"]) => {
      state.filter = filter;
    },
    setSortBy: (sortBy: TodoState["sortBy"]) => {
      state.sortBy = sortBy;
    },
    clearCompleted: () => {
      state.todos = state.todos.filter((t) => !t.completed);
    },
  }),
});

// ============================================
// Selectors (functions passed to useStore)
// ============================================

export interface TodoStats {
  total: number;
  completed: number;
  active: number;
  completionRate: number;
  byPriority: {
    high: number;
    medium: number;
    low: number;
  };
}

// Selector for sorted and filtered todos
export const sortedTodosSelector: Selector<Todo[]> = ({ get }) => {
  const [state] = get(todoStore);

  // Filter
  let filtered = state.todos;
  switch (state.filter) {
    case "active":
      filtered = state.todos.filter((t) => !t.completed);
      break;
    case "completed":
      filtered = state.todos.filter((t) => t.completed);
      break;
  }

  // Sort
  return [...filtered].sort((a, b) => {
    switch (state.sortBy) {
      case "priority": {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.priority] - order[b.priority];
      }
      case "text":
        return a.text.localeCompare(b.text);
      case "date":
      default:
        return b.createdAt - a.createdAt;
    }
  });
};

// Selector for stats
export const todoStatsSelector: Selector<TodoStats> = ({ get }) => {
  const [state] = get(todoStore);
  const { todos } = state;

  const total = todos.length;
  const completed = todos.filter((t) => t.completed).length;
  const active = total - completed;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const byPriority = {
    high: todos.filter((t) => t.priority === "high" && !t.completed).length,
    medium: todos.filter((t) => t.priority === "medium" && !t.completed).length,
    low: todos.filter((t) => t.priority === "low" && !t.completed).length,
  };

  return { total, completed, active, completionRate, byPriority };
};
