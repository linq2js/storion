import { ExpenseRepository } from "../ports";

/**
 * Use case: Delete an expense.
 */
export class DeleteExpenseUseCase {
  constructor(private readonly repository: ExpenseRepository) {}

  async execute(id: string): Promise<void> {
    const expense = await this.repository.findById(id);

    if (!expense) {
      throw new Error(`Expense not found: ${id}`);
    }

    await this.repository.delete(id);
  }
}

