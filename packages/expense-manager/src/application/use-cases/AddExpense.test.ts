import { describe, it, expect, vi, beforeEach } from "vitest";
import { AddExpenseUseCase } from "./AddExpense";
import { ExpenseRepository } from "../ports";

describe("AddExpenseUseCase", () => {
  let repository: ExpenseRepository;
  let useCase: AddExpenseUseCase;

  beforeEach(() => {
    repository = {
      findAll: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    };
    useCase = new AddExpenseUseCase(repository);
  });

  it("should create and save expense", async () => {
    const input = {
      description: "Coffee",
      amount: 5.5,
      category: "food" as const,
    };

    const expense = await useCase.execute(input);

    expect(expense.description).toBe("Coffee");
    expect(expense.amount.amount).toBe(5.5);
    expect(expense.category).toBe("food");
    expect(repository.save).toHaveBeenCalledWith(expense);
  });

  it("should validate input", async () => {
    const input = {
      description: "",
      amount: 5.5,
      category: "food" as const,
    };

    await expect(useCase.execute(input)).rejects.toThrow(
      "Description is required"
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("should use custom date", async () => {
    const date = new Date(2024, 5, 15);
    const input = {
      description: "Coffee",
      amount: 5.5,
      category: "food" as const,
      date,
    };

    const expense = await useCase.execute(input);

    expect(expense.date.getMonth()).toBe(5);
    expect(expense.date.getDate()).toBe(15);
  });
});

