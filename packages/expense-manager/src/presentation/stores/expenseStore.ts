import { store } from "storion";
import { Expense, CreateExpenseInput, UpdateExpenseInput } from "@/domain/entities";
import { DateRange, CategoryType } from "@/domain/value-objects";
import { ExpenseCalculator, ExpenseStats } from "@/domain/services";
import { ExpenseRepository } from "@/application/ports";
import {
  AddExpenseUseCase,
  UpdateExpenseUseCase,
  DeleteExpenseUseCase,
  GetExpensesUseCase,
} from "@/application/use-cases";

export interface ExpenseStoreState {
  expenses: Expense[];
  isLoading: boolean;
  error: string | null;
}

export interface ExpenseStoreDeps {
  repository: ExpenseRepository;
}

/**
 * Expense store - manages expense data and operations.
 */
export const expenseStore = store({
  name: "expenses",

  state: {
    expenses: [] as Expense[],
    isLoading: false,
    error: null as string | null,
  },

  setup({ state }) {
    return {
      async load(repository: ExpenseRepository) {
        state.isLoading = true;
        state.error = null;

        try {
          const useCase = new GetExpensesUseCase(repository);
          const result = await useCase.execute({ dateRange: DateRange.allTime() });
          state.expenses = result.expenses;
        } catch (err) {
          state.error = err instanceof Error ? err.message : "Failed to load expenses";
        } finally {
          state.isLoading = false;
        }
      },

      async add(repository: ExpenseRepository, input: CreateExpenseInput) {
        state.error = null;

        try {
          const useCase = new AddExpenseUseCase(repository);
          const expense = await useCase.execute(input);
          state.expenses = [expense, ...state.expenses];
        } catch (err) {
          state.error = err instanceof Error ? err.message : "Failed to add expense";
          throw err;
        }
      },

      async update(repository: ExpenseRepository, id: string, input: UpdateExpenseInput) {
        state.error = null;

        try {
          const useCase = new UpdateExpenseUseCase(repository);
          const updated = await useCase.execute(id, input);
          state.expenses = state.expenses.map((e) => (e.id === id ? updated : e));
        } catch (err) {
          state.error = err instanceof Error ? err.message : "Failed to update expense";
          throw err;
        }
      },

      async remove(repository: ExpenseRepository, id: string) {
        state.error = null;

        try {
          const useCase = new DeleteExpenseUseCase(repository);
          await useCase.execute(id);
          state.expenses = state.expenses.filter((e) => e.id !== id);
        } catch (err) {
          state.error = err instanceof Error ? err.message : "Failed to delete expense";
          throw err;
        }
      },

      clearError() {
        state.error = null;
      },
    };
  },
});

/**
 * Helper to get filtered expenses.
 */
export function getFilteredExpenses(
  expenses: Expense[],
  dateRange: DateRange,
  category: CategoryType | null
): Expense[] {
  let result = ExpenseCalculator.filterByDateRange(expenses, dateRange);
  result = ExpenseCalculator.filterByCategory(result, category);
  return ExpenseCalculator.sortByDate(result);
}

/**
 * Helper to calculate stats.
 */
export function getExpenseStats(
  expenses: Expense[],
  dateRange: DateRange
): ExpenseStats {
  const filtered = ExpenseCalculator.filterByDateRange(expenses, dateRange);
  return ExpenseCalculator.calculateStats(filtered, dateRange);
}

