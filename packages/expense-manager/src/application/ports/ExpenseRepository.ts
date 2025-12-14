import { Expense, ExpenseData } from "@/domain/entities";

/**
 * Port for expense persistence.
 */
export interface ExpenseRepository {
  findAll(): Promise<Expense[]>;
  findById(id: string): Promise<Expense | null>;
  save(expense: Expense): Promise<void>;
  delete(id: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Port for expense storage (raw data).
 */
export interface ExpenseStorage {
  getAll(): ExpenseData[];
  get(id: string): ExpenseData | undefined;
  set(id: string, data: ExpenseData): void;
  remove(id: string): void;
  clear(): void;
}

