/**
 * List Store - Demonstrates the list() focus helper
 *
 * Demonstrates:
 * - list() helper for array manipulation
 * - Named disposal groups for cross-collection moves
 * - Add, remove, swap operations
 * - Event callbacks (onAdded, onRemoved)
 */
import { store, list, disposalGroup } from "storion";

export interface Task {
  id: string;
  title: string;
  priority: "low" | "medium" | "high";
  createdAt: number;
}

interface ListState {
  /** Tasks in the "To Do" column */
  todo: Task[];
  /** Tasks in the "In Progress" column */
  inProgress: Task[];
  /** Tasks in the "Done" column */
  done: Task[];
  /** Event log for demonstrating callbacks */
  eventLog: string[];
}

// Shared disposal group - items moving between lists won't be disposed
const tasksGroup = disposalGroup();

let taskIdCounter = 0;
const generateId = () => `task-${++taskIdCounter}`;

export const listStore = store({
  name: "list-demo",
  state: {
    todo: [] as Task[],
    inProgress: [] as Task[],
    done: [] as Task[],
    eventLog: [] as string[],
  } satisfies ListState,
  setup: ({ state, focus }) => {
    // Helper to log events
    const logEvent = (message: string) => {
      const timestamp = new Date().toLocaleTimeString();
      state.eventLog = [`[${timestamp}] ${message}`, ...state.eventLog].slice(
        0,
        10
      );
    };

    // Create list helpers with shared disposal group and event callbacks
    const todoList = focus("todo").as(
      list<Task>({
        autoDispose: tasksGroup,
        onAdded: (task) => logEvent(`Added "${task.title}" to To Do`),
        onRemoved: (task) => logEvent(`Removed "${task.title}" from To Do`),
      })
    );

    const inProgressList = focus("inProgress").as(
      list<Task>({
        autoDispose: tasksGroup,
        onAdded: (task) => logEvent(`Added "${task.title}" to In Progress`),
        onRemoved: (task) =>
          logEvent(`Removed "${task.title}" from In Progress`),
      })
    );

    const doneList = focus("done").as(
      list<Task>({
        autoDispose: tasksGroup,
        onAdded: (task) => logEvent(`Added "${task.title}" to Done`),
        onRemoved: (task) => logEvent(`Removed "${task.title}" from Done`),
      })
    );

    // Map column names to list helpers
    const lists = {
      todo: todoList,
      inProgress: inProgressList,
      done: doneList,
    };

    return {
      /** Add a new task to the To Do column */
      addTask: (title: string, priority: Task["priority"] = "medium") => {
        const task: Task = {
          id: generateId(),
          title,
          priority,
          createdAt: Date.now(),
        };
        todoList.push(task);
      },

      /** Remove a task from any column */
      removeTask: (taskId: string, column: keyof typeof lists) => {
        const list = lists[column];
        const task = list.find((t) => t.id === taskId);
        if (task) {
          list.remove(task);
        }
      },

      /** Move a task between columns (drag and drop) */
      moveTask: (
        taskId: string,
        fromColumn: keyof typeof lists,
        toColumn: keyof typeof lists,
        toIndex?: number
      ) => {
        if (fromColumn === toColumn) return;

        const fromList = lists[fromColumn];
        const toList = lists[toColumn];

        const task = fromList.find((t) => t.id === taskId);
        if (!task) return;

        // Remove from source (schedules disposal)
        fromList.remove(task);

        // Add to destination (cancels disposal because same group!)
        if (toIndex !== undefined && toIndex >= 0) {
          toList.insert(toIndex, task);
        } else {
          toList.push(task);
        }
      },

      /** Reorder a task within the same column */
      reorderTask: (
        taskId: string,
        column: keyof typeof lists,
        newIndex: number
      ) => {
        const list = lists[column];
        const currentIndex = list.findIndex((t) => t.id === taskId);
        if (currentIndex === -1 || currentIndex === newIndex) return;

        // Swap adjacent items to move task to new position
        if (newIndex < currentIndex) {
          // Moving up
          for (let i = currentIndex; i > newIndex; i--) {
            list.swap(i, i - 1);
          }
        } else {
          // Moving down
          for (let i = currentIndex; i < newIndex; i++) {
            list.swap(i, i + 1);
          }
        }
        logEvent(`Reordered task in ${column}`);
      },

      /** Swap two tasks within the same column */
      swapTasks: (
        column: keyof typeof lists,
        indexA: number,
        indexB: number
      ) => {
        const list = lists[column];
        list.swap(indexA, indexB);
        logEvent(`Swapped items at index ${indexA} and ${indexB} in ${column}`);
      },

      /** Clear all tasks from a column */
      clearColumn: (column: keyof typeof lists) => {
        lists[column].clear();
      },

      /** Clear event log */
      clearLog: () => {
        state.eventLog = [];
      },

      /** Add sample tasks for demo */
      addSampleTasks: () => {
        const samples = [
          { title: "Design mockups", priority: "high" as const },
          { title: "Write documentation", priority: "medium" as const },
          { title: "Fix bug #123", priority: "high" as const },
          { title: "Review PR", priority: "low" as const },
          { title: "Update dependencies", priority: "low" as const },
        ];

        samples.forEach(({ title, priority }) => {
          const task: Task = {
            id: generateId(),
            title,
            priority,
            createdAt: Date.now(),
          };
          todoList.push(task);
        });
      },
    };
  },
});

