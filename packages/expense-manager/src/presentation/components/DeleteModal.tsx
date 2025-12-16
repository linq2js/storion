import { memo, useState } from "react";
import { useStore } from "storion/react";
import { ExpenseRepository } from "@/application/ports";
import { expenseStore, uiStore } from "../stores";

interface DeleteModalProps {
  repository: ExpenseRepository;
}

export const DeleteModal = memo(function DeleteModal({
  repository,
}: DeleteModalProps) {
  const { selectedExpense, closeModal, remove } = useStore(({ get }) => {
    const [uiState, uiActions] = get(uiStore);
    const [, expenseActions] = get(expenseStore);

    return {
      selectedExpense: uiState.selectedExpense,
      closeModal: uiActions.closeModal,
      remove: (id: string) => expenseActions.remove(repository, id),
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
        <div className="modal-backdrop" onClick={closeModal} />

        {/* Modal */}
        <div className="modal-content max-w-sm p-6 text-center relative">
          {/* Icon */}
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-rose-100 flex items-center justify-center">
            <svg
              className="w-7 h-7 text-rose-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </div>

          <h2 className="text-lg font-bold text-surface-900 mb-2">
            Delete Expense?
          </h2>

          <p className="text-surface-500 text-sm mb-6">
            This will permanently delete{" "}
            <span className="font-semibold text-surface-700">
              "{selectedExpense.description}"
            </span>
            . This action cannot be undone.
          </p>

          <div className="flex gap-3">
            <button
              onClick={closeModal}
              className="btn btn-secondary flex-1"
              disabled={isDeleting}
            >
              Keep it
            </button>
            <button
              onClick={handleDelete}
              className="btn btn-danger flex-1"
              disabled={isDeleting}
            >
              {isDeleting ? (
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
                  Deleting...
                </span>
              ) : (
                "Delete"
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});
