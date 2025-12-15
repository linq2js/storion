import { store } from "storion";
import { Expense } from "@/domain/entities";

export type ModalType = "add" | "edit" | "delete" | null;
export type ViewType = "dashboard" | "reports";

/**
 * UI store - manages UI state (modals, forms, etc.).
 */
export const uiStore = store({
  name: "ui",

  state: {
    activeModal: null as ModalType,
    selectedExpense: null as Expense | null,
    isSidebarOpen: true,
    activeView: "dashboard" as ViewType,
  },

  setup({ state }) {
    return {
      openAddModal() {
        state.activeModal = "add";
        state.selectedExpense = null;
      },

      openEditModal(expense: Expense) {
        state.activeModal = "edit";
        state.selectedExpense = expense;
      },

      openDeleteModal(expense: Expense) {
        state.activeModal = "delete";
        state.selectedExpense = expense;
      },

      closeModal() {
        state.activeModal = null;
        state.selectedExpense = null;
      },

      toggleSidebar() {
        state.isSidebarOpen = !state.isSidebarOpen;
      },

      setSidebarOpen(isOpen: boolean) {
        state.isSidebarOpen = isOpen;
      },

      setView(view: ViewType) {
        state.activeView = view;
      },
    };
  },
});

