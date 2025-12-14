import { v4 as uuid } from "uuid";
import { Money, CategoryType, isValidCategory } from "../value-objects";

/**
 * Expense entity - represents a single expense record.
 */
export interface ExpenseData {
  id: string;
  description: string;
  amount: number;
  currency: string;
  category: CategoryType;
  date: string; // ISO string
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseInput {
  description: string;
  amount: number;
  category: CategoryType;
  date?: Date;
}

export interface UpdateExpenseInput {
  description?: string;
  amount?: number;
  category?: CategoryType;
  date?: Date;
}

export class Expense {
  private constructor(private readonly data: ExpenseData) {}

  static create(input: CreateExpenseInput): Expense {
    const now = new Date().toISOString();

    if (!input.description.trim()) {
      throw new Error("Description is required");
    }

    if (input.amount <= 0) {
      throw new Error("Amount must be positive");
    }

    if (!isValidCategory(input.category)) {
      throw new Error(`Invalid category: ${input.category}`);
    }

    return new Expense({
      id: uuid(),
      description: input.description.trim(),
      amount: Math.round(input.amount * 100) / 100,
      currency: "USD",
      category: input.category,
      date: (input.date ?? new Date()).toISOString(),
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromData(data: ExpenseData): Expense {
    return new Expense(data);
  }

  get id(): string {
    return this.data.id;
  }

  get description(): string {
    return this.data.description;
  }

  get amount(): Money {
    return Money.create(this.data.amount, this.data.currency);
  }

  get category(): CategoryType {
    return this.data.category;
  }

  get date(): Date {
    return new Date(this.data.date);
  }

  get createdAt(): Date {
    return new Date(this.data.createdAt);
  }

  get updatedAt(): Date {
    return new Date(this.data.updatedAt);
  }

  update(input: UpdateExpenseInput): Expense {
    const updates: Partial<ExpenseData> = {
      updatedAt: new Date().toISOString(),
    };

    if (input.description !== undefined) {
      if (!input.description.trim()) {
        throw new Error("Description is required");
      }
      updates.description = input.description.trim();
    }

    if (input.amount !== undefined) {
      if (input.amount <= 0) {
        throw new Error("Amount must be positive");
      }
      updates.amount = Math.round(input.amount * 100) / 100;
    }

    if (input.category !== undefined) {
      if (!isValidCategory(input.category)) {
        throw new Error(`Invalid category: ${input.category}`);
      }
      updates.category = input.category;
    }

    if (input.date !== undefined) {
      updates.date = input.date.toISOString();
    }

    return new Expense({ ...this.data, ...updates });
  }

  toData(): ExpenseData {
    return { ...this.data };
  }

  equals(other: Expense): boolean {
    return this.data.id === other.data.id;
  }
}

