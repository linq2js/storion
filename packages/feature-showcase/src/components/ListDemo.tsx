/**
 * List Demo Component
 * Demonstrates the list() focus helper with drag-and-drop Kanban board
 *
 * Features:
 * - Add/remove/swap items
 * - Drag and drop between columns
 * - Named disposal groups for safe cross-collection moves
 * - Event callbacks (onAdded, onRemoved)
 */
import { useState, type DragEvent } from "react";
import { withStore } from "storion/react";
import { listStore, type Task } from "../stores/listStore";

// Priority colors
const priorityColors = {
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  medium: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  high: "bg-red-500/20 text-red-400 border-red-500/30",
};

const priorityLabels = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

type ColumnKey = "todo" | "inProgress" | "done";

// Column configuration
const columns: { key: ColumnKey; title: string; icon: string; color: string }[] =
  [
    { key: "todo", title: "To Do", icon: "📋", color: "border-zinc-500" },
    {
      key: "inProgress",
      title: "In Progress",
      icon: "🔄",
      color: "border-purple-500",
    },
    { key: "done", title: "Done", icon: "✅", color: "border-green-500" },
  ];

export const ListDemo = withStore(
  (ctx) => {
    const [state, actions] = ctx.get(listStore);
    return {
      todo: state.todo,
      inProgress: state.inProgress,
      done: state.done,
      eventLog: state.eventLog,
      actions,
    };
  },
  ({ todo, inProgress, done, eventLog, actions }) => {
    const [newTaskTitle, setNewTaskTitle] = useState("");
    const [newTaskPriority, setNewTaskPriority] =
      useState<Task["priority"]>("medium");
    const [draggedTask, setDraggedTask] = useState<{
      task: Task;
      fromColumn: ColumnKey;
    } | null>(null);
    const [dropTarget, setDropTarget] = useState<{
      column: ColumnKey;
      index: number;
    } | null>(null);

    const columnData: Record<ColumnKey, Task[]> = {
      todo,
      inProgress,
      done,
    };

    const handleAddTask = (e: React.FormEvent) => {
      e.preventDefault();
      if (newTaskTitle.trim()) {
        actions.addTask(newTaskTitle.trim(), newTaskPriority);
        setNewTaskTitle("");
      }
    };

    const handleDragStart = (
      e: DragEvent,
      task: Task,
      fromColumn: ColumnKey
    ) => {
      setDraggedTask({ task, fromColumn });
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", task.id);
    };

    const handleDragEnd = () => {
      setDraggedTask(null);
      setDropTarget(null);
    };

    const handleDragOver = (
      e: DragEvent,
      column: ColumnKey,
      index: number
    ) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDropTarget({ column, index });
    };

    const handleDragLeave = () => {
      setDropTarget(null);
    };

    const handleDrop = (e: DragEvent, toColumn: ColumnKey, toIndex: number) => {
      e.preventDefault();
      if (!draggedTask) return;

      const { task, fromColumn } = draggedTask;

      if (fromColumn === toColumn) {
        // Reorder within same column
        const currentIndex = columnData[fromColumn].findIndex(
          (t) => t.id === task.id
        );
        if (currentIndex !== toIndex && currentIndex !== toIndex - 1) {
          actions.reorderTask(
            task.id,
            fromColumn,
            toIndex > currentIndex ? toIndex - 1 : toIndex
          );
        }
      } else {
        // Move to different column
        actions.moveTask(task.id, fromColumn, toColumn, toIndex);
      }

      setDraggedTask(null);
      setDropTarget(null);
    };

    return (
      <div className="space-y-6">
        {/* Add Task Form */}
        <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
          <h3 className="font-medium mb-3 flex items-center gap-2">
            <span>➕</span> Add New Task
          </h3>
          <form onSubmit={handleAddTask} className="flex gap-3">
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              placeholder="Enter task title..."
              className="flex-1 bg-zinc-700/50 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <select
              value={newTaskPriority}
              onChange={(e) =>
                setNewTaskPriority(e.target.value as Task["priority"])
              }
              className="bg-zinc-700/50 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
            <button
              type="submit"
              disabled={!newTaskTitle.trim()}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              Add Task
            </button>
          </form>
          <div className="flex gap-2 mt-3">
            <button
              onClick={actions.addSampleTasks}
              className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              + Add sample tasks
            </button>
          </div>
        </div>

        {/* Kanban Board */}
        <div className="grid grid-cols-3 gap-4">
          {columns.map((column) => (
            <div
              key={column.key}
              className={`bg-zinc-800/30 rounded-xl border-t-2 ${column.color} overflow-hidden`}
            >
              {/* Column Header */}
              <div className="p-3 border-b border-zinc-700/50 flex items-center justify-between">
                <h3 className="font-medium flex items-center gap-2">
                  <span>{column.icon}</span>
                  {column.title}
                  <span className="text-xs text-zinc-500 bg-zinc-700 px-2 py-0.5 rounded-full">
                    {columnData[column.key].length}
                  </span>
                </h3>
                {columnData[column.key].length > 0 && (
                  <button
                    onClick={() => actions.clearColumn(column.key)}
                    className="text-xs text-zinc-500 hover:text-red-400 transition-colors"
                    title="Clear column"
                  >
                    🗑️
                  </button>
                )}
              </div>

              {/* Column Content */}
              <div
                className="p-2 min-h-[200px] space-y-2"
                onDragOver={(e) =>
                  handleDragOver(e, column.key, columnData[column.key].length)
                }
                onDragLeave={handleDragLeave}
                onDrop={(e) =>
                  handleDrop(e, column.key, columnData[column.key].length)
                }
              >
                {columnData[column.key].map((task, index) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    column={column.key}
                    index={index}
                    isDragging={draggedTask?.task.id === task.id}
                    isDropTarget={
                      dropTarget?.column === column.key &&
                      dropTarget?.index === index
                    }
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onRemove={() => actions.removeTask(task.id, column.key)}
                    onSwapUp={() =>
                      index > 0 && actions.swapTasks(column.key, index, index - 1)
                    }
                    onSwapDown={() =>
                      index < columnData[column.key].length - 1 &&
                      actions.swapTasks(column.key, index, index + 1)
                    }
                    canSwapUp={index > 0}
                    canSwapDown={index < columnData[column.key].length - 1}
                  />
                ))}

                {/* Drop zone indicator at end of list */}
                {dropTarget?.column === column.key &&
                  dropTarget?.index === columnData[column.key].length && (
                    <div className="h-1 bg-purple-500 rounded-full animate-pulse" />
                  )}

                {/* Empty state */}
                {columnData[column.key].length === 0 && !draggedTask && (
                  <div className="text-center text-zinc-500 text-sm py-8">
                    <p>No tasks</p>
                    <p className="text-xs mt-1">Drag tasks here</p>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Event Log */}
        <div className="bg-zinc-800/50 rounded-xl p-4 border border-zinc-700/50">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium flex items-center gap-2">
              <span>📜</span> Event Log
              <span className="text-xs text-zinc-500">
                (onAdded/onRemoved callbacks)
              </span>
            </h3>
            {eventLog.length > 0 && (
              <button
                onClick={actions.clearLog}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          <div className="bg-zinc-900/50 rounded-lg p-3 h-32 overflow-y-auto font-mono text-xs">
            {eventLog.length === 0 ? (
              <p className="text-zinc-500">
                Events will appear here when you add/remove/move tasks...
              </p>
            ) : (
              eventLog.map((log, i) => (
                <div
                  key={i}
                  className="text-zinc-400 py-0.5 border-b border-zinc-800 last:border-0"
                >
                  {log}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-xl p-4 border border-purple-500/20">
          <h4 className="font-medium text-purple-400 mb-2">
            💡 What's happening?
          </h4>
          <ul className="text-sm text-zinc-400 space-y-1">
            <li>
              • <strong>Named disposal group</strong>: Tasks share a
              "tasksGroup" so moving between columns doesn't trigger disposal
            </li>
            <li>
              • <strong>batch()</strong>: All mutations + events are batched for
              consistent state updates
            </li>
            <li>
              • <strong>swap()</strong>: Use the ↑↓ buttons to reorder items
              within a column
            </li>
            <li>
              • <strong>Event callbacks</strong>: onAdded/onRemoved fire after
              each mutation completes
            </li>
          </ul>
        </div>
      </div>
    );
  }
);

// Task Card Component
interface TaskCardProps {
  task: Task;
  column: ColumnKey;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: (e: DragEvent, task: Task, column: ColumnKey) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent, column: ColumnKey, index: number) => void;
  onDrop: (e: DragEvent, column: ColumnKey, index: number) => void;
  onRemove: () => void;
  onSwapUp: () => void;
  onSwapDown: () => void;
  canSwapUp: boolean;
  canSwapDown: boolean;
}

function TaskCard({
  task,
  column,
  index,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onRemove,
  onSwapUp,
  onSwapDown,
  canSwapUp,
  canSwapDown,
}: TaskCardProps) {
  const [showActions, setShowActions] = useState(false);

  return (
    <>
      {/* Drop indicator above card */}
      {isDropTarget && (
        <div className="h-1 bg-purple-500 rounded-full animate-pulse -mb-1" />
      )}

      <div
        draggable
        onDragStart={(e) => onDragStart(e, task, column)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => onDragOver(e, column, index)}
        onDrop={(e) => onDrop(e, column, index)}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
        className={`
          bg-zinc-800/80 rounded-lg p-3 border border-zinc-700/50 
          cursor-grab active:cursor-grabbing
          hover:border-zinc-600 hover:bg-zinc-800
          transition-all duration-150
          ${isDragging ? "opacity-50 scale-95" : ""}
        `}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{task.title}</p>
            <div className="flex items-center gap-2 mt-2">
              <span
                className={`text-xs px-2 py-0.5 rounded-full border ${priorityColors[task.priority]}`}
              >
                {priorityLabels[task.priority]}
              </span>
            </div>
          </div>

          {/* Action buttons */}
          <div
            className={`flex flex-col gap-1 transition-opacity ${showActions ? "opacity-100" : "opacity-0"}`}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSwapUp();
              }}
              disabled={!canSwapUp}
              className="text-xs text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed p-1"
              title="Move up"
            >
              ↑
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSwapDown();
              }}
              disabled={!canSwapDown}
              className="text-xs text-zinc-500 hover:text-zinc-200 disabled:opacity-30 disabled:cursor-not-allowed p-1"
              title="Move down"
            >
              ↓
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="text-xs text-zinc-500 hover:text-red-400 p-1"
              title="Remove task"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

