import { useEffect, useMemo } from "react";
import { useStore } from "storion/react";
import {
  expenseStore,
  filterStore,
  uiStore,
  getFilteredExpenses,
} from "./presentation/stores";
import { ExpenseRepository } from "./application/ports";
import {
  LocalStorageExpenseStorage,
  ExpenseRepositoryImpl,
} from "./infrastructure/repositories";
import { Header, FloatingAddButton } from "./presentation/components/Header";
import { StatsPanel } from "./presentation/components/StatsPanel";
import { CategoryBreakdown } from "./presentation/components/CategoryBreakdown";
import { ExpenseList } from "./presentation/components/ExpenseList";
import { FilterBar } from "./presentation/components/FilterBar";
import { ExpenseModal } from "./presentation/components/ExpenseModal";
import { DeleteModal } from "./presentation/components/DeleteModal";
import { ReportPage } from "./presentation/components/ReportPage";

// Create repository instance
const repository: ExpenseRepository = new ExpenseRepositoryImpl(
  new LocalStorageExpenseStorage()
);

export function App() {
  const { expenses, isLoading, error, load, clearError } = useStore(
    ({ resolve }) => {
      const [state, actions] = resolve(expenseStore);
      return {
        expenses: state.expenses,
        isLoading: state.isLoading,
        error: state.error,
        load: () => actions.load(repository),
        clearError: actions.clearError,
      };
    }
  );

  const { dateRange, category } = useStore(({ resolve }) => {
    const [state] = resolve(filterStore);
    return {
      dateRange: state.dateRange,
      category: state.category,
    };
  });

  const { activeModal, activeView } = useStore(({ resolve }) => {
    const [state] = resolve(uiStore);
    return { activeModal: state.activeModal, activeView: state.activeView };
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

  // Compute filtered expenses
  const filteredExpenses = useMemo(
    () => getFilteredExpenses(expenses, dateRange, category),
    [expenses, dateRange, category]
  );

  return (
    <div className="min-h-screen">
      <Header />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Error Toast */}
        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 flex items-center justify-between animate-slide-up">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm font-medium">{error}</span>
            </div>
            <button
              onClick={clearError}
              className="text-rose-400 hover:text-rose-600 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {activeView === "dashboard" ? (
          <>
            {/* Stats Summary */}
            <StatsPanel expenses={expenses} isLoading={isLoading} />

            {/* Filter Bar */}
            <FilterBar />

            {/* Category Breakdown */}
            <CategoryBreakdown />

            {/* Expense List */}
            <ExpenseList
              expenses={filteredExpenses}
              isLoading={isLoading}
              repository={repository}
            />
          </>
        ) : (
          <>
            {/* Filter Bar for Reports */}
            <FilterBar />

            {/* Reports Page */}
            <ReportPage />
          </>
        )}
      </main>

      {/* Floating Add Button */}
      <FloatingAddButton />

      {/* Modals */}
      {(activeModal === "add" || activeModal === "edit") && (
        <ExpenseModal repository={repository} />
      )}
      {activeModal === "delete" && <DeleteModal repository={repository} />}
    </div>
  );
}
