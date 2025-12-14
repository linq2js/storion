import { useStore } from "storion/react";
import { Expense } from "@/domain/entities";
import { getCategory } from "@/domain/value-objects";
import { ExpenseRepository } from "@/application/ports";
import { uiStore } from "../stores";

interface ExpenseListProps {
  expenses: Expense[];
  isLoading: boolean;
  repository: ExpenseRepository;
}

export function ExpenseList({ expenses, isLoading }: ExpenseListProps) {
  const { openEditModal, openDeleteModal } = useStore(({ get }) => {
    const [, actions] = get(uiStore);
    return {
      openEditModal: actions.openEditModal,
      openDeleteModal: actions.openDeleteModal,
    };
  });

  if (isLoading) {
    return (
      <div className="card divide-y divide-slate-100">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-4 animate-pulse">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-slate-200 rounded-lg" />
              <div className="flex-1">
                <div className="h-4 bg-slate-200 rounded w-32 mb-2" />
                <div className="h-3 bg-slate-200 rounded w-20" />
              </div>
              <div className="h-5 bg-slate-200 rounded w-16" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="card p-12 text-center">
        <span className="text-6xl mb-4 block">📭</span>
        <h3 className="text-lg font-medium text-slate-700 mb-2">
          No expenses found
        </h3>
        <p className="text-slate-500 text-sm">
          Try adjusting your filters or add a new expense.
        </p>
      </div>
    );
  }

  // Group by date
  const grouped = groupByDate(expenses);

  return (
    <div className="space-y-6">
      {grouped.map(({ date, expenses: dayExpenses, total }) => (
        <div key={date} className="card overflow-visible">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-600">{date}</span>
            <span className="text-sm font-mono text-slate-500">
              {total.format()}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {dayExpenses.map((expense) => (
              <ExpenseRow
                key={expense.id}
                expense={expense}
                onEdit={() => openEditModal(expense)}
                onDelete={() => openDeleteModal(expense)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ExpenseRowProps {
  expense: Expense;
  onEdit: () => void;
  onDelete: () => void;
}

function ExpenseRow({ expense, onEdit, onDelete }: ExpenseRowProps) {
  const category = getCategory(expense.category);

  const colorMap: Record<string, string> = {
    "expense-food": "bg-red-100 text-red-600",
    "expense-transport": "bg-blue-100 text-blue-600",
    "expense-entertainment": "bg-purple-100 text-purple-600",
    "expense-shopping": "bg-amber-100 text-amber-600",
    "expense-bills": "bg-cyan-100 text-cyan-600",
    "expense-health": "bg-emerald-100 text-emerald-600",
    "expense-other": "bg-slate-100 text-slate-600",
  };

  return (
    <div className="group p-4 hover:bg-slate-50 transition-colors">
      <div className="flex items-center gap-4">
        <div
          className={`w-10 h-10 rounded-lg ${colorMap[category.color]} 
                      flex items-center justify-center text-lg`}
        >
          {category.icon}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-900 truncate">
            {expense.description}
          </p>
          <p className="text-sm text-slate-500">{category.label}</p>
        </div>

        <div className="text-right">
          <p className="font-mono font-medium text-slate-900">
            -{expense.amount.format()}
          </p>
          <p className="text-xs text-slate-400">
            {expense.date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
            title="Edit"
          >
            ✏️
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
            title="Delete"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
}

function groupByDate(expenses: Expense[]) {
  const groups = new Map<
    string,
    { date: string; expenses: Expense[]; total: ReturnType<Expense["amount"]["add"]> }
  >();

  for (const expense of expenses) {
    const dateKey = expense.date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "short",
      day: "numeric",
    });

    if (!groups.has(dateKey)) {
      groups.set(dateKey, {
        date: dateKey,
        expenses: [],
        total: expense.amount,
      });
    }

    const group = groups.get(dateKey)!;
    group.expenses.push(expense);
    if (group.expenses.length > 1) {
      group.total = group.total.add(expense.amount);
    }
  }

  return Array.from(groups.values());
}

