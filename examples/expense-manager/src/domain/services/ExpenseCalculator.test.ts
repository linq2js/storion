import { describe, it, expect } from "vitest";
import { ExpenseCalculator } from "./ExpenseCalculator";
import { Expense } from "../entities";
import { DateRange } from "../value-objects";

describe("ExpenseCalculator", () => {
  // Helper to create test expenses
  const createExpenses = () => [
    Expense.create({
      description: "Lunch",
      amount: 15,
      category: "food",
      date: new Date(2024, 0, 15),
    }),
    Expense.create({
      description: "Gas",
      amount: 50,
      category: "transport",
      date: new Date(2024, 0, 16),
    }),
    Expense.create({
      description: "Coffee",
      amount: 5,
      category: "food",
      date: new Date(2024, 0, 17),
    }),
    Expense.create({
      description: "Movie",
      amount: 20,
      category: "entertainment",
      date: new Date(2024, 0, 18),
    }),
  ];

  describe("calculateTotal()", () => {
    it("should calculate total of all expenses", () => {
      const expenses = createExpenses();
      const total = ExpenseCalculator.calculateTotal(expenses);

      expect(total.amount).toBe(90);
    });

    it("should return zero for empty array", () => {
      const total = ExpenseCalculator.calculateTotal([]);
      expect(total.amount).toBe(0);
    });
  });

  describe("calculateByCategory()", () => {
    it("should group expenses by category", () => {
      const expenses = createExpenses();
      const byCategory = ExpenseCalculator.calculateByCategory(expenses);

      expect(byCategory.food.amount).toBe(20); // 15 + 5
      expect(byCategory.transport.amount).toBe(50);
      expect(byCategory.entertainment.amount).toBe(20);
      expect(byCategory.shopping.amount).toBe(0);
    });
  });

  describe("getCategoryBreakdown()", () => {
    it("should calculate breakdown with percentages", () => {
      const expenses = createExpenses();
      const breakdown = ExpenseCalculator.getCategoryBreakdown(expenses);

      // Should be sorted by amount (descending)
      expect(breakdown[0].category).toBe("transport");
      expect(breakdown[0].amount.amount).toBe(50);
      expect(breakdown[0].percentage).toBeCloseTo(55.56, 1);
    });

    it("should only include categories with expenses", () => {
      const expenses = createExpenses();
      const breakdown = ExpenseCalculator.getCategoryBreakdown(expenses);

      expect(breakdown.length).toBe(3); // food, transport, entertainment
      expect(breakdown.find((b) => b.category === "shopping")).toBeUndefined();
    });
  });

  describe("calculateStats()", () => {
    it("should calculate full statistics", () => {
      const expenses = createExpenses();
      const dateRange = DateRange.create(
        new Date(2024, 0, 1),
        new Date(2024, 0, 31)
      );

      const stats = ExpenseCalculator.calculateStats(expenses, dateRange);

      expect(stats.total.amount).toBe(90);
      expect(stats.count).toBe(4);
      expect(stats.average.amount).toBe(22.5);
      expect(stats.dailyAverage.amount).toBeGreaterThan(0);
    });
  });

  describe("filterByDateRange()", () => {
    it("should filter expenses within date range", () => {
      const expenses = createExpenses();
      const dateRange = DateRange.create(
        new Date(2024, 0, 16),
        new Date(2024, 0, 17)
      );

      const filtered = ExpenseCalculator.filterByDateRange(expenses, dateRange);

      expect(filtered.length).toBe(2);
    });

    it("should return empty array for no matches", () => {
      const expenses = createExpenses();
      const dateRange = DateRange.create(
        new Date(2024, 5, 1),
        new Date(2024, 5, 30)
      );

      const filtered = ExpenseCalculator.filterByDateRange(expenses, dateRange);

      expect(filtered.length).toBe(0);
    });
  });

  describe("filterByCategory()", () => {
    it("should filter by category", () => {
      const expenses = createExpenses();
      const filtered = ExpenseCalculator.filterByCategory(expenses, "food");

      expect(filtered.length).toBe(2);
      expect(filtered.every((e) => e.category === "food")).toBe(true);
    });

    it("should return all expenses for null category", () => {
      const expenses = createExpenses();
      const filtered = ExpenseCalculator.filterByCategory(expenses, null);

      expect(filtered.length).toBe(4);
    });
  });

  describe("sortByDate()", () => {
    it("should sort by date descending by default", () => {
      const expenses = createExpenses();
      const sorted = ExpenseCalculator.sortByDate(expenses);

      expect(sorted[0].description).toBe("Movie"); // Jan 18
      expect(sorted[3].description).toBe("Lunch"); // Jan 15
    });

    it("should sort ascending when specified", () => {
      const expenses = createExpenses();
      const sorted = ExpenseCalculator.sortByDate(expenses, true);

      expect(sorted[0].description).toBe("Lunch"); // Jan 15
      expect(sorted[3].description).toBe("Movie"); // Jan 18
    });
  });

  describe("getTopExpenses()", () => {
    it("should return top expenses by amount", () => {
      const expenses = createExpenses();
      const top = ExpenseCalculator.getTopExpenses(expenses, 2);

      expect(top.length).toBe(2);
      expect(top[0].amount.amount).toBe(50); // Gas
      expect(top[1].amount.amount).toBe(20); // Movie or Entertainment
    });
  });
});

