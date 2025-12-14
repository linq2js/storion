import { useState } from "react";
import { useStore } from "storion/react";
import { ExpenseRepository } from "@/application/ports";
import { expenseStore, uiStore } from "../stores";

interface DeleteModalProps {
  repository: ExpenseRepository;
}

export function DeleteModal({ repository }: DeleteModalProps) {
  const { selectedExpense, closeModal } = useStore(({ get }) => {
    const [state, actions] = get(uiStore);
    return {
      selectedExpense: state.selectedExpense,
      closeModal: actions.closeModal,
    };
  });

  const { remove } = useStore(({ get }) => {
    const [, actions] = get(expenseStore);
    return {
      remove: (id: string) => actions.remove(repository, id),
    };
  });

  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!selectedExpense) return;

    setIsDeleting(true);
    try {
      await remove(selectedExpense.id);
      closeModal();
    } catch {
      // Error handled by store
    } finally {
      setIsDeleting(false);
    }
  };

  if (!selectedExpense) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
          onClick={closeModal}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 flex items-center justify-center text-3xl">
            🗑️
          </div>

          <h2 className="text-xl font-bold text-slate-900 mb-2">
            Delete Expense
          </h2>

          <p className="text-slate-500 mb-6">
            Are you sure you want to delete "
            <span className="font-medium text-slate-700">
              {selectedExpense.description}
            </span>
            "? This action cannot be undone.
          </p>

          <div className="flex gap-3">
            <button
              onClick={closeModal}
              className="btn btn-secondary flex-1"
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              className="btn btn-danger flex-1"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

