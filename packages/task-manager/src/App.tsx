import { useStore } from "storion/react";
import { taskStore, type Filter, type Priority } from "./stores/taskStore";
import { useState } from "react";

// =============================================================================
// HEADER
// =============================================================================

function Header() {
  const { stats } = useStore(({ get }) => {
    const [, actions] = get(taskStore);
    return { stats: actions.getStats() };
  });

  return (
    <header className="mb-8">
      <h1 className="text-4xl font-bold bg-gradient-to-r from-primary-400 to-emerald-400 bg-clip-text text-transparent mb-2">
        Task Manager
      </h1>
      <p className="text-slate-400">
        Powered by Storion's <code className="text-primary-400">list()</code>{" "}
        and <code className="text-primary-400">map()</code> helpers
      </p>
      <div className="flex gap-4 mt-4 text-sm">
        <span className="px-3 py-1 bg-slate-800 rounded-full">
          {stats.total} total
        </span>
        <span className="px-3 py-1 bg-primary-900/50 text-primary-400 rounded-full">
          {stats.active} active
        </span>
        <span className="px-3 py-1 bg-slate-700 rounded-full">
          {stats.done} done
        </span>
        {stats.highPriority > 0 && (
          <span className="px-3 py-1 bg-red-900/50 text-red-400 rounded-full">
            {stats.highPriority} high priority
          </span>
        )}
      </div>
    </header>
  );
}

// =============================================================================
// CATEGORY SIDEBAR
// =============================================================================

function CategorySidebar() {
  const { categories, selectedCategoryId, selectCategory, deleteCategory } =
    useStore(({ get }) => {
      const [state, actions] = get(taskStore);
      return {
        categories: actions.getCategories(),
        selectedCategoryId: state.selectedCategoryId,
        selectCategory: actions.selectCategory,
        deleteCategory: actions.deleteCategory,
      };
    });

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");

  const { addCategory } = useStore(({ get }) => {
    const [, actions] = get(taskStore);
    return { addCategory: actions.addCategory };
  });

  const handleAddCategory = () => {
    if (newName.trim()) {
      addCategory(newName.trim(), newColor);
      setNewName("");
      setShowAdd(false);
    }
  };

  return (
    <aside className="w-64 shrink-0">
      <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700">
        <h2 className="text-lg font-semibold mb-4 flex items-center justify-between">
          Categories
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="text-primary-400 hover:text-primary-300 text-2xl leading-none"
          >
            +
          </button>
        </h2>

        {showAdd && (
          <div className="mb-4 p-3 bg-slate-900/50 rounded-lg animate-slide-in">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Category name"
              className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-sm mb-2"
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
            />
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={newColor}
                onChange={(e) => setNewColor(e.target.value)}
                className="w-8 h-8 rounded cursor-pointer"
              />
              <button
                onClick={handleAddCategory}
                className="flex-1 bg-primary-600 hover:bg-primary-500 text-white px-3 py-1 rounded text-sm"
              >
                Add
              </button>
            </div>
          </div>
        )}

        <ul className="space-y-1">
          <li>
            <button
              onClick={() => selectCategory(null)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                selectedCategoryId === null
                  ? "bg-primary-600/20 text-primary-400"
                  : "hover:bg-slate-700/50 text-slate-300"
              }`}
            >
              All Tasks
            </button>
          </li>
          {categories.map((cat) => (
            <li key={cat.id} className="group relative">
              <button
                onClick={() => selectCategory(cat.id)}
                className={`w-full text-left px-3 py-2 pr-8 rounded-lg transition-colors flex items-center gap-2 ${
                  selectedCategoryId === cat.id
                    ? "bg-primary-600/20 text-primary-400"
                    : "hover:bg-slate-700/50 text-slate-300"
                }`}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <span className="flex-1 truncate">{cat.name}</span>
              </button>
              <button
                onClick={() => deleteCategory(cat.id)}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}

// =============================================================================
// FILTER BAR
// =============================================================================

function FilterBar() {
  const { filter, setFilter, clearDone, doneCount } = useStore(({ get }) => {
    const [state, actions] = get(taskStore);
    return {
      filter: state.filter,
      setFilter: actions.setFilter,
      clearDone: actions.clearDone,
      doneCount: actions.getStats().done,
    };
  });

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "done", label: "Done" },
  ];

  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex gap-1 bg-slate-800/50 p-1 rounded-lg">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-4 py-1.5 rounded-md text-sm transition-colors ${
              filter === f.value
                ? "bg-primary-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {doneCount > 0 && (
        <button
          onClick={clearDone}
          className="text-sm text-slate-400 hover:text-red-400 transition-colors"
        >
          Clear done ({doneCount})
        </button>
      )}
    </div>
  );
}

// =============================================================================
// ADD TASK FORM
// =============================================================================

function AddTaskForm() {
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");

  const { addTask, categories, selectedCategoryId } = useStore(({ get }) => {
    const [state, actions] = get(taskStore);
    return {
      addTask: actions.addTask,
      categories: actions.getCategories(),
      selectedCategoryId: state.selectedCategoryId,
    };
  });

  const [categoryId, setCategoryId] = useState<string>("");

  // Default to selected category or first category
  const effectiveCategoryId =
    categoryId || selectedCategoryId || categories[0]?.id || "";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && effectiveCategoryId) {
      addTask(title.trim(), effectiveCategoryId, priority);
      setTitle("");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-6">
      <div className="flex gap-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs to be done?"
          className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-primary-500 transition-colors"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
        <select
          value={effectiveCategoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-primary-500"
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={!title.trim()}
          className="bg-primary-600 hover:bg-primary-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 py-3 rounded-lg font-medium transition-colors"
        >
          Add
        </button>
      </div>
    </form>
  );
}

// =============================================================================
// TASK ITEM
// =============================================================================

function TaskItem({
  task,
}: {
  task: {
    id: string;
    title: string;
    done: boolean;
    priority: Priority;
    categoryId: string;
  };
}) {
  const { toggleTask, deleteTask, updateTaskPriority, getCategory } = useStore(
    ({ get }) => {
      const [, actions] = get(taskStore);
      return {
        toggleTask: actions.toggleTask,
        deleteTask: actions.deleteTask,
        updateTaskPriority: actions.updateTaskPriority,
        getCategory: actions.getCategory,
      };
    }
  );

  const category = getCategory(task.categoryId);

  const priorityColors = {
    high: "border-l-red-500",
    medium: "border-l-yellow-500",
    low: "border-l-blue-500",
  };

  return (
    <div
      className={`task-item group bg-slate-800/30 border border-slate-700/50 rounded-lg p-4 border-l-4 ${
        priorityColors[task.priority]
      } ${task.done ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3">
        <button
          onClick={() => toggleTask(task.id)}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
            task.done
              ? "bg-primary-600 border-primary-600 text-white"
              : "border-slate-500 hover:border-primary-500"
          }`}
        >
          {task.done && (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        <span
          className={`flex-1 ${task.done ? "line-through text-slate-500" : "text-white"}`}
        >
          {task.title}
        </span>

        {category && (
          <span
            className="px-2 py-0.5 rounded-full text-xs"
            style={{
              backgroundColor: `${category.color}20`,
              color: category.color,
            }}
          >
            {category.name}
          </span>
        )}

        <select
          value={task.priority}
          onChange={(e) => updateTaskPriority(task.id, e.target.value as Priority)}
          className="opacity-0 group-hover:opacity-100 bg-slate-700 border-none rounded px-2 py-1 text-xs transition-opacity"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <button
          onClick={() => deleteTask(task.id)}
          className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-opacity p-1"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// TASK LIST
// =============================================================================

function TaskList() {
  const { tasks } = useStore(({ get }) => {
    const [, actions] = get(taskStore);
    return { tasks: actions.getFilteredTasks() };
  });

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <svg
          className="w-16 h-16 mx-auto mb-4 opacity-50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <p>No tasks yet. Add one above!</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} />
      ))}
    </div>
  );
}

// =============================================================================
// APP
// =============================================================================

export default function App() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        <Header />

        <div className="flex gap-6">
          <CategorySidebar />

          <main className="flex-1">
            <div className="bg-slate-800/30 rounded-xl p-6 border border-slate-700/50">
              <AddTaskForm />
              <FilterBar />
              <TaskList />
            </div>
          </main>
        </div>

        <footer className="mt-8 text-center text-slate-500 text-sm">
          <p>
            This demo showcases Storion's{" "}
            <code className="text-primary-400">focus().as(list())</code> and{" "}
            <code className="text-primary-400">focus().as(map())</code> helpers
            for ergonomic state management.
          </p>
          <a
            href="/storion/guide/dynamic-stores.html"
            className="text-primary-400 hover:text-primary-300"
          >
            Learn more →
          </a>
        </footer>
      </div>
    </div>
  );
}

