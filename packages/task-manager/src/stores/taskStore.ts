import { list, map, store } from "storion/react";

// =============================================================================
// TYPES
// =============================================================================

export type Priority = "low" | "medium" | "high";
export type Filter = "all" | "active" | "done";

export interface Task {
  id: string;
  title: string;
  done: boolean;
  priority: Priority;
  categoryId: string;
  createdAt: number;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

// =============================================================================
// STORE
// =============================================================================

export const taskStore = store({
  name: "tasks",
  state: {
    /** All tasks */
    tasks: [] as Task[],
    /** Categories for organizing tasks */
    categories: {} as Record<string, Category>,
    /** Current filter */
    filter: "all" as Filter,
    /** Selected category filter */
    selectedCategoryId: null as string | null,
  },
  setup({ state, focus }) {
    // Use focus helpers for ergonomic array/object manipulation
    const tasks = focus("tasks").as(list());
    const categories = focus("categories").as(map());

    // Initialize default categories
    if (categories.isEmpty()) {
      categories.set("work", {
        id: "work",
        name: "Work",
        color: "#3b82f6",
      });
      categories.set("personal", {
        id: "personal",
        name: "Personal",
        color: "#8b5cf6",
      });
      categories.set("shopping", {
        id: "shopping",
        name: "Shopping",
        color: "#f59e0b",
      });
    }

    return {
      // ===== Task Actions =====

      /** Add a new task */
      addTask: (
        title: string,
        categoryId: string,
        priority: Priority = "medium"
      ) => {
        tasks.push({
          id: crypto.randomUUID(),
          title,
          done: false,
          priority,
          categoryId,
          createdAt: Date.now(),
        });
      },

      /** Toggle task completion */
      toggleTask: (id: string) => {
        const index = tasks.findIndex((t: Task) => t.id === id);
        if (index !== -1) {
          tasks.set(index, (draft: Task) => {
            draft.done = !draft.done;
          });
        }
      },

      /** Update task title */
      updateTaskTitle: (id: string, title: string) => {
        const index = tasks.findIndex((t: Task) => t.id === id);
        if (index !== -1) {
          tasks.set(index, (draft: Task) => {
            draft.title = title;
          });
        }
      },

      /** Update task priority */
      updateTaskPriority: (id: string, priority: Priority) => {
        const index = tasks.findIndex((t: Task) => t.id === id);
        if (index !== -1) {
          tasks.set(index, (draft: Task) => {
            draft.priority = priority;
          });
        }
      },

      /** Delete a task */
      deleteTask: (id: string) => {
        const task = tasks.find((t: Task) => t.id === id);
        if (task) tasks.remove(task);
      },

      /** Clear all completed tasks */
      clearDone: () => tasks.removeWhere((t: Task) => t.done),

      // ===== Category Actions =====

      /** Add a new category */
      addCategory: (name: string, color: string) => {
        const id = crypto.randomUUID();
        categories.set(id, { id, name, color });
        return id;
      },

      /** Update category */
      updateCategory: (id: string, updates: Partial<Omit<Category, "id">>) => {
        categories.set(id, (draft: Category) => {
          if (updates.name) draft.name = updates.name;
          if (updates.color) draft.color = updates.color;
        });
      },

      /** Delete category and its tasks */
      deleteCategory: (id: string) => {
        tasks.removeWhere((t: Task) => t.categoryId === id);
        categories.delete(id);
        if (state.selectedCategoryId === id) {
          state.selectedCategoryId = null;
        }
      },

      // ===== Filter Actions =====

      /** Set completion filter */
      setFilter: (filter: Filter) => {
        state.filter = filter;
      },

      /** Set category filter */
      selectCategory: (categoryId: string | null) => {
        state.selectedCategoryId = categoryId;
      },

      // ===== Computed / Getters =====

      /** Get filtered tasks */
      getFilteredTasks: (): Task[] => {
        let filtered: Task[] = [...tasks.get()]; // Copy to allow sorting

        // Filter by category
        if (state.selectedCategoryId) {
          filtered = filtered.filter(
            (t: Task) => t.categoryId === state.selectedCategoryId
          );
        }

        // Filter by completion
        switch (state.filter) {
          case "active":
            filtered = filtered.filter((t: Task) => !t.done);
            break;
          case "done":
            filtered = filtered.filter((t: Task) => t.done);
            break;
        }

        // Sort by priority then by creation date
        const priorityOrder: Record<Priority, number> = {
          high: 0,
          medium: 1,
          low: 2,
        };
        return filtered.sort((a: Task, b: Task) => {
          if (a.done !== b.done) return a.done ? 1 : -1;
          const priorityDiff =
            priorityOrder[a.priority] - priorityOrder[b.priority];
          if (priorityDiff !== 0) return priorityDiff;
          return b.createdAt - a.createdAt;
        });
      },

      /** Get all categories */
      getCategories: (): Category[] => categories.values(),

      /** Get category by ID */
      getCategory: (id: string): Category | undefined => categories.at(id),

      /** Get statistics */
      getStats: () => {
        const allTasks: Task[] = tasks.get();
        const categoryId = state.selectedCategoryId;
        const filtered: Task[] = categoryId
          ? allTasks.filter((t: Task) => t.categoryId === categoryId)
          : allTasks;

        return {
          total: filtered.length,
          done: filtered.filter((t: Task) => t.done).length,
          active: filtered.filter((t: Task) => !t.done).length,
          highPriority: filtered.filter(
            (t: Task) => !t.done && t.priority === "high"
          ).length,
        };
      },

      /** Get tasks by category */
      getTasksByCategory: (categoryId: string): Task[] =>
        tasks.filter((t: Task) => t.categoryId === categoryId),
    };
  },
});
