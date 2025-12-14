import { Expense, UpdateExpenseInput } from "@/domain/entities";
import { ExpenseRepository } from "../ports";

/**
 * Use case: Update an existing expense.
 */
export class UpdateExpenseUseCase {
  constructor(private readonly repository: ExpenseRepository) {}

  async execute(id: string, input: UpdateExpenseInput): Promise<Expense> {
    const expense = await this.repository.findById(id);

    if (!expense) {
      throw new Error(`Expense not found: ${id}`);
    }

    const updated = expense.update(input);
    await this.repository.save(updated);
    return updated;
  }
}

