import { memo, useState } from "react";
import { useStore } from "storion/react";
import { CreateExpenseInput } from "@/domain/entities";
import { getAllCategories, CategoryType } from "@/domain/value-objects";
import { ExpenseRepository } from "@/application/ports";
import { expenseStore, uiStore } from "../stores";

interface ExpenseModalProps {
  repository: ExpenseRepository;
}

export const ExpenseModal = memo(function ExpenseModal({
  repository,
}: ExpenseModalProps) {
  const { activeModal, selectedExpense, closeModal, add, update } = useStore(
    ({ get }) => {
      const [uiState, uiActions] = get(uiStore);
      const [, expenseActions] = get(expenseStore);

      return {
        activeModal: uiState.activeModal,
        selectedExpense: uiState.selectedExpense,
        closeModal: uiActions.closeModal,
        add: (input: CreateExpenseInput) =>
          expenseActions.add(repository, input),
        update: (id: string, input: CreateExpenseInput) =>
          expenseActions.update(repository, id, input),
      };
    }
  );

  const isEdit = activeModal === "edit";
  const categories = getAllCategories();

  const [description, setDescription] = useState(
    selectedExpense?.description ?? ""
  );
  const [amount, setAmount] = useState(
    selectedExpense?.amount.amount.toString() ?? ""
  );
  const [category, setCategory] = useState<CategoryType>(
    selectedExpense?.category ?? "food"
  );
  const [date, setDate] = useState(() => {
    if (selectedExpense) {
      // Format existing expense date as local YYYY-MM-DD
      const d = selectedExpense.date;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    // Default to today in local timezone
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Parse date as local timezone (YYYY-MM-DD format)
      const [year, month, day] = date.split("-").map(Number);
      const localDate = new Date(year, month - 1, day);

      const input: CreateExpenseInput = {
        description,
        amount: parseFloat(amount),
        category,
        date: localDate,
      };

      if (isEdit && selectedExpense) {
        await update(selectedExpense.id, input);
      } else {
        await add(input);
      }

      closeModal();
    } catch {
      // Error is handled by store
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="modal-backdrop" onClick={closeModal} />

        {/* Modal */}
        <div className="modal-content p-6 relative">
          {/* Close button */}
          <button
            onClick={closeModal}
            className="absolute top-4 right-4 btn-icon"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-surface-900">
              {isEdit ? "Edit Expense" : "New Expense"}
            </h2>
            <p className="text-sm text-surface-500 mt-1">
              {isEdit ? "Update the expense details" : "Track a new expense"}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Description */}
            <div className="input-group">
              <label className="input-label">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Coffee, groceries, etc."
                className="input"
                required
                autoFocus
              />
            </div>

            {/* Amount */}
            <div className="input-group">
              <label className="input-label">Amount</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-surface-400 font-medium">
                  $
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="input pl-8 font-mono"
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>
            </div>

            {/* Category Grid */}
            <div className="input-group">
              <label className="input-label">Category</label>
              <div className="grid grid-cols-4 gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.type}
                    type="button"
                    onClick={() => setCategory(cat.type)}
                    className={`p-3 rounded-xl text-center transition-all ${
                      category === cat.type
                        ? "bg-primary-100 ring-2 ring-primary-500"
                        : "bg-surface-50 hover:bg-surface-100"
                    }`}
                  >
                    <span className="text-xl block mb-1">{cat.icon}</span>
                    <span className="text-xs text-surface-600 truncate block">
                      {cat.label.split(" ")[0]}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Date */}
            <div className="input-group">
              <label className="input-label">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
                required
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={closeModal}
                className="btn btn-secondary flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn-primary flex-1"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Saving...
                  </span>
                ) : isEdit ? (
                  "Save Changes"
                ) : (
                  "Add Expense"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
});
