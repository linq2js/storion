import { Expense, CreateExpenseInput } from "@/domain/entities";
import { ExpenseRepository } from "../ports";

/**
 * Use case: Add a new expense.
 */
export class AddExpenseUseCase {
  constructor(private readonly repository: ExpenseRepository) {}

  async execute(input: CreateExpenseInput): Promise<Expense> {
    const expense = Expense.create(input);
    await this.repository.save(expense);
    return expense;
  }
}

