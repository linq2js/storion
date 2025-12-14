import { Expense } from "../entities";
import { Money, CategoryType, DateRange, CATEGORIES } from "../value-objects";

/**
 * Expense statistics.
 */
export interface ExpenseStats {
  total: Money;
  count: number;
  average: Money;
  byCategory: Record<CategoryType, Money>;
  dailyAverage: Money;
}

/**
 * Category breakdown with percentage.
 */
export interface CategoryBreakdown {
  category: CategoryType;
  amount: Money;
  percentage: number;
  count: number;
}

/**
 * Domain service for expense calculations.
 */
export const ExpenseCalculator = {
  /**
   * Calculate total amount of expenses.
   */
  calculateTotal(expenses: Expense[]): Money {
    return expenses.reduce(
      (sum, expense) => sum.add(expense.amount),
      Money.zero()
    );
  },

  /**
   * Calculate expenses by category.
   */
  calculateByCategory(expenses: Expense[]): Record<CategoryType, Money> {
    const result = {} as Record<CategoryType, Money>;

    for (const category of CATEGORIES) {
      result[category] = Money.zero();
    }

    for (const expense of expenses) {
      result[expense.category] = result[expense.category].add(expense.amount);
    }

    return result;
  },

  /**
   * Get category breakdown with percentages.
   */
  getCategoryBreakdown(expenses: Expense[]): CategoryBreakdown[] {
    const total = this.calculateTotal(expenses);
    const byCategory = this.calculateByCategory(expenses);

    return CATEGORIES.map((category) => {
      const amount = byCategory[category];
      const count = expenses.filter((e) => e.category === category).length;
      const percentage =
        total.amount > 0 ? (amount.amount / total.amount) * 100 : 0;

      return { category, amount, percentage, count };
    })
      .filter((b) => b.amount.amount > 0)
      .sort((a, b) => b.amount.amount - a.amount.amount);
  },

  /**
   * Calculate full statistics.
   */
  calculateStats(expenses: Expense[], dateRange: DateRange): ExpenseStats {
    const total = this.calculateTotal(expenses);
    const count = expenses.length;
    const average = count > 0 ? Money.create(total.amount / count) : Money.zero();
    const byCategory = this.calculateByCategory(expenses);
    const days = dateRange.getDays();
    const dailyAverage =
      days > 0 ? Money.create(total.amount / days) : Money.zero();

    return { total, count, average, byCategory, dailyAverage };
  },

  /**
   * Filter expenses by date range.
   */
  filterByDateRange(expenses: Expense[], dateRange: DateRange): Expense[] {
    return expenses.filter((expense) => dateRange.contains(expense.date));
  },

  /**
   * Filter expenses by category.
   */
  filterByCategory(
    expenses: Expense[],
    category: CategoryType | null
  ): Expense[] {
    if (!category) return expenses;
    return expenses.filter((expense) => expense.category === category);
  },

  /**
   * Sort expenses by date (newest first).
   */
  sortByDate(expenses: Expense[], ascending = false): Expense[] {
    return [...expenses].sort((a, b) => {
      const diff = b.date.getTime() - a.date.getTime();
      return ascending ? -diff : diff;
    });
  },

  /**
   * Get top expenses.
   */
  getTopExpenses(expenses: Expense[], limit = 5): Expense[] {
    return [...expenses]
      .sort((a, b) => b.amount.amount - a.amount.amount)
      .slice(0, limit);
  },
};

