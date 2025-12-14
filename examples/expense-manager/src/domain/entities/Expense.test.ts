import { describe, it, expect } from "vitest";
import { Expense } from "./Expense";

describe("Expense", () => {
  describe("create()", () => {
    it("should create expense with valid input", () => {
      const expense = Expense.create({
        description: "Coffee",
        amount: 5.5,
        category: "food",
      });

      expect(expense.description).toBe("Coffee");
      expect(expense.amount.amount).toBe(5.5);
      expect(expense.category).toBe("food");
      expect(expense.id).toBeTruthy();
    });

    it("should trim description", () => {
      const expense = Expense.create({
        description: "  Coffee  ",
        amount: 5.5,
        category: "food",
      });

      expect(expense.description).toBe("Coffee");
    });

    it("should throw for empty description", () => {
      expect(() =>
        Expense.create({
          description: "",
          amount: 5.5,
          category: "food",
        })
      ).toThrow("Description is required");
    });

    it("should throw for zero amount", () => {
      expect(() =>
        Expense.create({
          description: "Test",
          amount: 0,
          category: "food",
        })
      ).toThrow("Amount must be positive");
    });

    it("should throw for negative amount", () => {
      expect(() =>
        Expense.create({
          description: "Test",
          amount: -10,
          category: "food",
        })
      ).toThrow("Amount must be positive");
    });

    it("should throw for invalid category", () => {
      expect(() =>
        Expense.create({
          description: "Test",
          amount: 10,
          category: "invalid" as any,
        })
      ).toThrow("Invalid category");
    });

    it("should use provided date", () => {
      const date = new Date(2024, 5, 15);
      const expense = Expense.create({
        description: "Test",
        amount: 10,
        category: "food",
        date,
      });

      expect(expense.date.getMonth()).toBe(5);
      expect(expense.date.getDate()).toBe(15);
    });

    it("should default to current date", () => {
      const before = new Date();
      const expense = Expense.create({
        description: "Test",
        amount: 10,
        category: "food",
      });
      const after = new Date();

      expect(expense.date.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(expense.date.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("update()", () => {
    it("should update description", () => {
      const expense = Expense.create({
        description: "Coffee",
        amount: 5.5,
        category: "food",
      });

      const updated = expense.update({ description: "Latte" });

      expect(updated.description).toBe("Latte");
      expect(updated.amount.amount).toBe(5.5);
      expect(updated.id).toBe(expense.id);
    });

    it("should update amount", () => {
      const expense = Expense.create({
        description: "Coffee",
        amount: 5.5,
        category: "food",
      });

      const updated = expense.update({ amount: 7.5 });

      expect(updated.amount.amount).toBe(7.5);
    });

    it("should update category", () => {
      const expense = Expense.create({
        description: "Coffee",
        amount: 5.5,
        category: "food",
      });

      const updated = expense.update({ category: "entertainment" });

      expect(updated.category).toBe("entertainment");
    });

    it("should update updatedAt timestamp", () => {
      const expense = Expense.create({
        description: "Coffee",
        amount: 5.5,
        category: "food",
      });

      const originalUpdatedAt = expense.updatedAt;

      // Small delay to ensure timestamp difference
      const updated = expense.update({ description: "Latte" });

      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(
        originalUpdatedAt.getTime()
      );
    });

    it("should validate updated values", () => {
      const expense = Expense.create({
        description: "Coffee",
        amount: 5.5,
        category: "food",
      });

      expect(() => expense.update({ description: "" })).toThrow(
        "Description is required"
      );
      expect(() => expense.update({ amount: -5 })).toThrow(
        "Amount must be positive"
      );
    });
  });

  describe("fromData()", () => {
    it("should reconstruct expense from data", () => {
      const original = Expense.create({
        description: "Coffee",
        amount: 5.5,
        category: "food",
      });

      const data = original.toData();
      const restored = Expense.fromData(data);

      expect(restored.id).toBe(original.id);
      expect(restored.description).toBe(original.description);
      expect(restored.amount.amount).toBe(original.amount.amount);
      expect(restored.category).toBe(original.category);
    });
  });

  describe("equals()", () => {
    it("should return true for same expense", () => {
      const expense = Expense.create({
        description: "Coffee",
        amount: 5.5,
        category: "food",
      });

      const restored = Expense.fromData(expense.toData());

      expect(expense.equals(restored)).toBe(true);
    });

    it("should return false for different expenses", () => {
      const a = Expense.create({
        description: "Coffee",
        amount: 5.5,
        category: "food",
      });

      const b = Expense.create({
        description: "Coffee",
        amount: 5.5,
        category: "food",
      });

      expect(a.equals(b)).toBe(false); // Different IDs
    });
  });
});

