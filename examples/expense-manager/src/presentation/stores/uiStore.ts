import { store } from "storion";
import { Expense } from "@/domain/entities";

export type ModalType = "add" | "edit" | "delete" | null;

/**
 * UI store - manages UI state (modals, forms, etc.).
 */
export const uiStore = store({
  name: "ui",

  state: {
    activeModal: null as ModalType,
    selectedExpense: null as Expense | null,
    isSidebarOpen: true,
  },

  setup: ({ state }) => ({
    /**
     * Open add expense modal.
     */
    openAddModal() {
      state.activeModal = "add";
      state.selectedExpense = null;
    },

    /**
     * Open edit expense modal.
     */
    openEditModal(expense: Expense) {
      state.activeModal = "edit";
      state.selectedExpense = expense;
    },

    /**
     * Open delete confirmation modal.
     */
    openDeleteModal(expense: Expense) {
      state.activeModal = "delete";
      state.selectedExpense = expense;
    },

    /**
     * Close any open modal.
     */
    closeModal() {
      state.activeModal = null;
      state.selectedExpense = null;
    },

    /**
     * Toggle sidebar.
     */
    toggleSidebar() {
      state.isSidebarOpen = !state.isSidebarOpen;
    },

    /**
     * Set sidebar state.
     */
    setSidebarOpen(isOpen: boolean) {
      state.isSidebarOpen = isOpen;
    },
  }),
});

