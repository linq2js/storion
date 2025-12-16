/**
 * Todo Demo Component
 * Demonstrates selectors and computed values
 */
import { memo, useState } from "react";
import { useStore, type Selector } from "storion/react";
import {
  todoStore,
  sortedTodosSelector,
  todoStatsSelector,
  type Todo,
  type TodoStats,
} from "../stores/selectorStore";

const priorityColors: Record<Todo["priority"], string> = {
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  low: "bg-green-500/20 text-green-400 border-green-500/30",
};

// Combined selector for all data
const todoDataSelector: Selector<{
  filter: "all" | "active" | "completed";
  sortBy: "date" | "priority" | "text";
  sortedTodos: Todo[];
  stats: TodoStats;
  actions: ReturnType<typeof todoStore.options.setup> extends infer A ? A : never;
}> = ({ get, use }) => {
  const [state, actions] = get(todoStore);
  const sortedTodos = use(sortedTodosSelector);
  const stats = use(todoStatsSelector);
  return {
    filter: state.filter,
    sortBy: state.sortBy,
    sortedTodos,
    stats,
    actions,
  };
};

export const TodoDemo = memo(function TodoDemo() {
  const { filter, sortBy, sortedTodos, stats, actions } = useStore(todoDataSelector);
  const [newTodo, setNewTodo] = useState("");
  const [newPriority, setNewPriority] = useState<Todo["priority"]>("medium");

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTodo.trim()) {
      actions.addTodo(newTodo.trim(), newPriority);
      setNewTodo("");
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 text-center">
          <div className="text-2xl font-bold text-purple-400">{stats.total}</div>
          <div className="text-xs text-zinc-500">Total</div>
        </div>
        <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 text-center">
          <div className="text-2xl font-bold text-blue-400">{stats.active}</div>
          <div className="text-xs text-zinc-500">Active</div>
        </div>
        <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 text-center">
          <div className="text-2xl font-bold text-green-400">
            {stats.completed}
          </div>
          <div className="text-xs text-zinc-500">Done</div>
        </div>
        <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50 text-center">
          <div className="text-2xl font-bold text-orange-400">
            {stats.completionRate}%
          </div>
          <div className="text-xs text-zinc-500">Progress</div>
        </div>
      </div>

      {/* Priority breakdown */}
      <div className="flex gap-2 text-xs">
        <span className="px-2 py-1 rounded bg-red-500/20 text-red-400">
          🔥 High: {stats.byPriority.high}
        </span>
        <span className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-400">
          ⚡ Medium: {stats.byPriority.medium}
        </span>
        <span className="px-2 py-1 rounded bg-green-500/20 text-green-400">
          📋 Low: {stats.byPriority.low}
        </span>
      </div>

      {/* Add Todo */}
      <form onSubmit={handleAddTodo} className="flex gap-2">
        <input
          type="text"
          value={newTodo}
          onChange={(e) => setNewTodo(e.target.value)}
          placeholder="Add a new todo..."
          className="flex-1 bg-zinc-800 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <select
          value={newPriority}
          onChange={(e) => setNewPriority(e.target.value as Todo["priority"])}
          className="bg-zinc-800 rounded-lg px-3 py-2"
        >
          <option value="high">🔥 High</option>
          <option value="medium">⚡ Medium</option>
          <option value="low">📋 Low</option>
        </select>
        <button
          type="submit"
          className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-medium transition-colors"
        >
          Add
        </button>
      </form>

      {/* Filters & Sort */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["all", "active", "completed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => actions.setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filter === f
                  ? "bg-purple-600 text-white"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-500">Sort:</span>
          <select
            value={sortBy}
            onChange={(e) =>
              actions.setSortBy(e.target.value as "date" | "priority" | "text")
            }
            className="bg-zinc-800 rounded-lg px-2 py-1 text-sm"
          >
            <option value="date">Date</option>
            <option value="priority">Priority</option>
            <option value="text">A-Z</option>
          </select>
        </div>
      </div>

      {/* Todo List */}
      <div className="space-y-2">
        {sortedTodos.map((todo) => (
          <div
            key={todo.id}
            className={`flex items-center gap-3 bg-zinc-800/50 rounded-lg p-3 border border-zinc-700/50 transition-opacity ${
              todo.completed ? "opacity-50" : ""
            }`}
          >
            <button
              onClick={() => actions.toggleTodo(todo.id)}
              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                todo.completed
                  ? "bg-purple-600 border-purple-600"
                  : "border-zinc-500 hover:border-purple-500"
              }`}
            >
              {todo.completed && <span className="text-xs">✓</span>}
            </button>
            <span
              className={`flex-1 ${todo.completed ? "line-through text-zinc-500" : ""}`}
            >
              {todo.text}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs border ${priorityColors[todo.priority]}`}
            >
              {todo.priority}
            </span>
            <button
              onClick={() => actions.deleteTodo(todo.id)}
              className="text-zinc-500 hover:text-red-400 transition-colors"
            >
              ✕
            </button>
          </div>
        ))}
        {sortedTodos.length === 0 && (
          <p className="text-zinc-500 text-center py-8">
            No todos match the current filter
          </p>
        )}
      </div>

      {/* Clear Completed */}
      {stats.completed > 0 && (
        <button
          onClick={actions.clearCompleted}
          className="text-sm text-zinc-500 hover:text-zinc-400 transition-colors"
        >
          Clear completed ({stats.completed})
        </button>
      )}
    </div>
  );
});
