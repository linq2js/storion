import { describe, it, expect, vi, beforeEach } from "vitest";
import { container } from "storion";
import { expenseStore, getFilteredExpenses, getExpenseStats } from "./expenseStore";
import { Expense } from "@/domain/entities";
import { DateRange } from "@/domain/value-objects";
import { ExpenseRepository } from "@/application/ports";

describe("expenseStore", () => {
  let stores: ReturnType<typeof container>;
  let mockRepository: ExpenseRepository;

  beforeEach(() => {
    stores = container();
    mockRepository = {
      findAll: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    };
  });

  describe("initial state", () => {
    it("should have empty expenses", () => {
      const instance = stores.get(expenseStore);
      expect(instance.state.expenses).toEqual([]);
    });

    it("should not be loading", () => {
      const instance = stores.get(expenseStore);
      expect(instance.state.isLoading).toBe(false);
    });

    it("should have no error", () => {
      const instance = stores.get(expenseStore);
      expect(instance.state.error).toBeNull();
    });
  });

  describe("load()", () => {
    it("should load expenses from repository", async () => {
      const expenses = [
        Expense.create({
          description: "Coffee",
          amount: 5,
          category: "food",
        }),
      ];

      vi.mocked(mockRepository.findAll).mockResolvedValue(expenses);

      const instance = stores.get(expenseStore);
      await instance.actions.load(mockRepository);

      expect(instance.state.expenses.length).toBe(1);
      expect(instance.state.expenses[0].description).toBe("Coffee");
    });

    it("should set loading state", async () => {
      vi.mocked(mockRepository.findAll).mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 100))
      );

      const instance = stores.get(expenseStore);
      const loadPromise = instance.actions.load(mockRepository);

      expect(instance.state.isLoading).toBe(true);

      await loadPromise;

      expect(instance.state.isLoading).toBe(false);
    });

    it("should handle errors", async () => {
      vi.mocked(mockRepository.findAll).mockRejectedValue(
        new Error("Network error")
      );

      const instance = stores.get(expenseStore);
      await instance.actions.load(mockRepository);

      expect(instance.state.error).toBe("Network error");
      expect(instance.state.isLoading).toBe(false);
    });
  });

  describe("add()", () => {
    it("should add expense to state", async () => {
      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      const instance = stores.get(expenseStore);
      await instance.actions.add(mockRepository, {
        description: "Lunch",
        amount: 15,
        category: "food",
      });

      expect(instance.state.expenses.length).toBe(1);
      expect(instance.state.expenses[0].description).toBe("Lunch");
    });

    it("should prepend new expense", async () => {
      const existing = Expense.create({
        description: "Old",
        amount: 10,
        category: "food",
      });

      vi.mocked(mockRepository.findAll).mockResolvedValue([existing]);
      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      const instance = stores.get(expenseStore);
      await instance.actions.load(mockRepository);
      await instance.actions.add(mockRepository, {
        description: "New",
        amount: 20,
        category: "food",
      });

      expect(instance.state.expenses[0].description).toBe("New");
      expect(instance.state.expenses[1].description).toBe("Old");
    });
  });

  describe("remove()", () => {
    it("should remove expense from state", async () => {
      const expense = Expense.create({
        description: "Coffee",
        amount: 5,
        category: "food",
      });

      vi.mocked(mockRepository.findAll).mockResolvedValue([expense]);
      vi.mocked(mockRepository.findById).mockResolvedValue(expense);
      vi.mocked(mockRepository.delete).mockResolvedValue(undefined);

      const instance = stores.get(expenseStore);
      await instance.actions.load(mockRepository);

      expect(instance.state.expenses.length).toBe(1);

      await instance.actions.remove(mockRepository, expense.id);

      expect(instance.state.expenses.length).toBe(0);
    });
  });

  describe("clearError()", () => {
    it("should clear error state", async () => {
      vi.mocked(mockRepository.findAll).mockRejectedValue(
        new Error("Network error")
      );

      const instance = stores.get(expenseStore);
      await instance.actions.load(mockRepository);

      expect(instance.state.error).toBe("Network error");

      instance.actions.clearError();

      expect(instance.state.error).toBeNull();
    });
  });
});

describe("helpers", () => {
  describe("getFilteredExpenses()", () => {
    it("should filter by date range", () => {
      const expenses = [
        Expense.create({
          description: "A",
          amount: 10,
          category: "food",
          date: new Date(2024, 0, 15),
        }),
        Expense.create({
          description: "B",
          amount: 20,
          category: "food",
          date: new Date(2024, 1, 15),
        }),
      ];

      const dateRange = DateRange.create(
        new Date(2024, 0, 1),
        new Date(2024, 0, 31)
      );

      const filtered = getFilteredExpenses(expenses, dateRange, null);

      expect(filtered.length).toBe(1);
      expect(filtered[0].description).toBe("A");
    });

    it("should filter by category", () => {
      const expenses = [
        Expense.create({
          description: "A",
          amount: 10,
          category: "food",
        }),
        Expense.create({
          description: "B",
          amount: 20,
          category: "transport",
        }),
      ];

      const dateRange = DateRange.allTime();
      const filtered = getFilteredExpenses(expenses, dateRange, "food");

      expect(filtered.length).toBe(1);
      expect(filtered[0].description).toBe("A");
    });
  });

  describe("getExpenseStats()", () => {
    it("should calculate stats", () => {
      const expenses = [
        Expense.create({
          description: "A",
          amount: 10,
          category: "food",
        }),
        Expense.create({
          description: "B",
          amount: 20,
          category: "transport",
        }),
      ];

      const dateRange = DateRange.allTime();
      const stats = getExpenseStats(expenses, dateRange);

      expect(stats.total.amount).toBe(30);
      expect(stats.count).toBe(2);
    });
  });
});

