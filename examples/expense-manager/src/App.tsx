import { useEffect, useMemo } from "react";
import { useStore } from "storion/react";
import {
  expenseStore,
  filterStore,
  uiStore,
  getFilteredExpenses,
  getExpenseStats,
} from "./presentation/stores";
import { ExpenseRepository } from "./application/ports";
import {
  LocalStorageExpenseStorage,
  ExpenseRepositoryImpl,
} from "./infrastructure/repositories";
import { Header } from "./presentation/components/Header";
import { StatsPanel } from "./presentation/components/StatsPanel";
import { ExpenseList } from "./presentation/components/ExpenseList";
import { FilterBar } from "./presentation/components/FilterBar";
import { ExpenseModal } from "./presentation/components/ExpenseModal";
import { DeleteModal } from "./presentation/components/DeleteModal";

// Create repository instance
const repository: ExpenseRepository = new ExpenseRepositoryImpl(
  new LocalStorageExpenseStorage()
);

export function App() {
  const { expenses, isLoading, error, load, clearError } = useStore(
    ({ get }) => {
      const [state, actions] = get(expenseStore);
      return {
        expenses: state.expenses,
        isLoading: state.isLoading,
        error: state.error,
        load: () => actions.load(repository),
        clearError: actions.clearError,
      };
    }
  );

  const { dateRange, category } = useStore(({ get }) => {
    const [state] = get(filterStore);
    return {
      dateRange: state.dateRange,
      category: state.category,
    };
  });

  const { activeModal } = useStore(({ get }) => {
    const [state] = get(uiStore);
    return { activeModal: state.activeModal };
  });

  // Load expenses on mount
  useEffect(() => {
    load();
  }, []);

  // Dismiss error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(clearError, 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Compute filtered expenses and stats
  const filteredExpenses = useMemo(
    () => getFilteredExpenses(expenses, dateRange, category),
    [expenses, dateRange, category]
  );

  const stats = useMemo(
    () => getExpenseStats(expenses, dateRange),
    [expenses, dateRange]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-primary-50">
      <Header />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Toast */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button
              onClick={clearError}
              className="text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        )}

        {/* Stats Panel */}
        <StatsPanel stats={stats} isLoading={isLoading} />

        {/* Filter Bar */}
        <FilterBar />

        {/* Expense List */}
        <ExpenseList
          expenses={filteredExpenses}
          isLoading={isLoading}
          repository={repository}
        />
      </main>

      {/* Modals */}
      {(activeModal === "add" || activeModal === "edit") && (
        <ExpenseModal repository={repository} />
      )}
      {activeModal === "delete" && <DeleteModal repository={repository} />}
    </div>
  );
}

