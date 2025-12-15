import { memo } from "react";
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

export const ExpenseList = memo(function ExpenseList({
  expenses,
  isLoading,
}: ExpenseListProps) {
  const { openEditModal, openDeleteModal } = useStore(({ resolve }) => {
    const [, actions] = resolve(uiStore);
    return {
      openEditModal: actions.openEditModal,
      openDeleteModal: actions.openDeleteModal,
    };
  });

  if (isLoading) {
    return (
      <div className="card divide-y divide-surface-100">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="p-4">
            <div className="flex items-center gap-4">
              <div className="skeleton w-11 h-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-32" />
                <div className="skeleton h-3 w-20" />
              </div>
              <div className="skeleton h-5 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-100 flex items-center justify-center">
          <svg
            className="w-8 h-8 text-surface-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-surface-700 mb-1">
          No expenses yet
        </h3>
        <p className="text-surface-500 text-sm max-w-xs mx-auto">
          Start tracking your spending by adding your first expense.
        </p>
      </div>
    );
  }

  const grouped = groupByDate(expenses);

  return (
    <div className="space-y-4">
      {grouped.map(({ date, expenses: dayExpenses, total }, groupIndex) => (
        <div
          key={date}
          className="card overflow-visible animate-slide-up"
          style={{ animationDelay: `${groupIndex * 50}ms` }}
        >
          {/* Date Header */}
          <div className="px-4 py-3 bg-surface-50/50 border-b border-surface-100 flex items-center justify-between">
            <span className="text-sm font-medium text-surface-600">{date}</span>
            <span className="money-sm text-surface-500">{total.format()}</span>
          </div>

          {/* Expense Rows */}
          <div className="divide-y divide-surface-50">
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
});

interface ExpenseRowProps {
  expense: Expense;
  onEdit: () => void;
  onDelete: () => void;
}

const ExpenseRow = memo(function ExpenseRow({
  expense,
  onEdit,
  onDelete,
}: ExpenseRowProps) {
  const category = getCategory(expense.category);

  const colorMap: Record<string, string> = {
    "expense-food": "category-food",
    "expense-transport": "category-transport",
    "expense-entertainment": "category-entertainment",
    "expense-shopping": "category-shopping",
    "expense-bills": "category-bills",
    "expense-health": "category-health",
    "expense-other": "category-other",
  };

  return (
    <div className="group px-4 py-3.5 hover:bg-surface-50/50 transition-colors">
      <div className="flex items-center gap-3 sm:gap-4">
        {/* Category Icon */}
        <div
          className={`w-11 h-11 rounded-xl ${
            colorMap[category.color] ?? "category-other"
          } 
                      flex items-center justify-center text-lg shrink-0`}
        >
          {category.icon}
        </div>

        {/* Description & Category */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-surface-900 truncate text-sm sm:text-base">
            {expense.description}
          </p>
          <p className="text-xs sm:text-sm text-surface-500">
            {category.label}
          </p>
        </div>

        {/* Amount & Time */}
        <div className="text-right shrink-0">
          <p
            className="money-sm text-surface-900"
            title={expense.amount.format()}
          >
            -{expense.amount.format()}
          </p>
          <p className="text-xs text-surface-400">
            {expense.date.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onEdit} className="btn-icon" title="Edit">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="btn-icon hover:text-rose-600 hover:bg-rose-50"
            title="Delete"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});

function groupByDate(expenses: Expense[]) {
  const groups = new Map<
    string,
    {
      date: string;
      expenses: Expense[];
      total: ReturnType<Expense["amount"]["add"]>;
    }
  >();

  for (const expense of expenses) {
    const dateKey = expense.date.toLocaleDateString("en-US", {
      weekday: "short",
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
