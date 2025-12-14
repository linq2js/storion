import { Expense } from "@/domain/entities";
import { DateRange, CategoryType } from "@/domain/value-objects";
import { ExpenseCalculator, ExpenseStats } from "@/domain/services";
import { ExpenseRepository } from "../ports";

export interface GetExpensesInput {
  dateRange?: DateRange;
  category?: CategoryType | null;
}

export interface GetExpensesResult {
  expenses: Expense[];
  stats: ExpenseStats;
}

/**
 * Use case: Get expenses with optional filters.
 */
export class GetExpensesUseCase {
  constructor(private readonly repository: ExpenseRepository) {}

  async execute(input: GetExpensesInput = {}): Promise<GetExpensesResult> {
    const { dateRange = DateRange.thisMonth(), category = null } = input;

    let expenses = await this.repository.findAll();

    // Apply filters
    expenses = ExpenseCalculator.filterByDateRange(expenses, dateRange);
    expenses = ExpenseCalculator.filterByCategory(expenses, category);

    // Sort by date (newest first)
    expenses = ExpenseCalculator.sortByDate(expenses);

    // Calculate stats
    const stats = ExpenseCalculator.calculateStats(expenses, dateRange);

    return { expenses, stats };
  }
}

