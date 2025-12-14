import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeleteExpenseUseCase } from "./DeleteExpense";
import { Expense } from "@/domain/entities";
import { ExpenseRepository } from "../ports";

describe("DeleteExpenseUseCase", () => {
  let repository: ExpenseRepository;
  let useCase: DeleteExpenseUseCase;

  beforeEach(() => {
    repository = {
      findAll: vi.fn(),
      findById: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      clear: vi.fn(),
    };
    useCase = new DeleteExpenseUseCase(repository);
  });

  it("should delete existing expense", async () => {
    const expense = Expense.create({
      description: "Coffee",
      amount: 5.5,
      category: "food",
    });

    vi.mocked(repository.findById).mockResolvedValue(expense);

    await useCase.execute(expense.id);

    expect(repository.delete).toHaveBeenCalledWith(expense.id);
  });

  it("should throw for non-existent expense", async () => {
    vi.mocked(repository.findById).mockResolvedValue(null);

    await expect(useCase.execute("non-existent")).rejects.toThrow(
      "Expense not found"
    );
    expect(repository.delete).not.toHaveBeenCalled();
  });
});

