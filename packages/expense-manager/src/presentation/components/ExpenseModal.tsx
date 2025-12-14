import { useState } from "react";
import { useStore } from "storion/react";
import { CreateExpenseInput } from "@/domain/entities";
import { getAllCategories, CategoryType } from "@/domain/value-objects";
import { ExpenseRepository } from "@/application/ports";
import { expenseStore, uiStore } from "../stores";

interface ExpenseModalProps {
  repository: ExpenseRepository;
}

export function ExpenseModal({ repository }: ExpenseModalProps) {
  const { activeModal, selectedExpense, closeModal } = useStore(({ get }) => {
    const [state, actions] = get(uiStore);
    return {
      activeModal: state.activeModal,
      selectedExpense: state.selectedExpense,
      closeModal: actions.closeModal,
    };
  });

  const { add, update } = useStore(({ get }) => {
    const [, actions] = get(expenseStore);
    return {
      add: (input: CreateExpenseInput) => actions.add(repository, input),
      update: (id: string, input: CreateExpenseInput) =>
        actions.update(repository, id, input),
    };
  });

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
  const [date, setDate] = useState(
    selectedExpense?.date.toISOString().split("T")[0] ??
      new Date().toISOString().split("T")[0]
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const input: CreateExpenseInput = {
        description,
        amount: parseFloat(amount),
        category,
        date: new Date(date),
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
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
          onClick={closeModal}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-6">
            {isEdit ? "Edit Expense" : "Add Expense"}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Description
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What did you spend on?"
                className="input"
                required
                autoFocus
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Amount
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  $
                </span>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="input pl-8"
                  min="0.01"
                  step="0.01"
                  required
                />
              </div>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as CategoryType)}
                className="input"
              >
                {categories.map((cat) => (
                  <option key={cat.type} value={cat.type}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
                required
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
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
                {isSubmitting
                  ? "Saving..."
                  : isEdit
                    ? "Save Changes"
                    : "Add Expense"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

