import { Expense, ExpenseData } from "@/domain/entities";
import { ExpenseRepository, ExpenseStorage } from "@/application/ports";

/**
 * In-memory storage implementation.
 */
export class InMemoryStorage implements ExpenseStorage {
  private data = new Map<string, ExpenseData>();

  getAll(): ExpenseData[] {
    return Array.from(this.data.values());
  }

  get(id: string): ExpenseData | undefined {
    return this.data.get(id);
  }

  set(id: string, data: ExpenseData): void {
    this.data.set(id, data);
  }

  remove(id: string): void {
    this.data.delete(id);
  }

  clear(): void {
    this.data.clear();
  }
}

/**
 * LocalStorage implementation for persistence.
 */
export class LocalStorageExpenseStorage implements ExpenseStorage {
  private readonly key = "expense-manager:expenses";

  private loadData(): Map<string, ExpenseData> {
    try {
      const json = localStorage.getItem(this.key);
      if (!json) return new Map();
      const data = JSON.parse(json) as ExpenseData[];
      return new Map(data.map((d) => [d.id, d]));
    } catch {
      return new Map();
    }
  }

  private saveData(data: Map<string, ExpenseData>): void {
    const array = Array.from(data.values());
    localStorage.setItem(this.key, JSON.stringify(array));
  }

  getAll(): ExpenseData[] {
    return Array.from(this.loadData().values());
  }

  get(id: string): ExpenseData | undefined {
    return this.loadData().get(id);
  }

  set(id: string, data: ExpenseData): void {
    const all = this.loadData();
    all.set(id, data);
    this.saveData(all);
  }

  remove(id: string): void {
    const all = this.loadData();
    all.delete(id);
    this.saveData(all);
  }

  clear(): void {
    localStorage.removeItem(this.key);
  }
}

/**
 * Repository implementation using storage adapter.
 */
export class ExpenseRepositoryImpl implements ExpenseRepository {
  constructor(private readonly storage: ExpenseStorage) {}

  async findAll(): Promise<Expense[]> {
    return this.storage.getAll().map(Expense.fromData);
  }

  async findById(id: string): Promise<Expense | null> {
    const data = this.storage.get(id);
    return data ? Expense.fromData(data) : null;
  }

  async save(expense: Expense): Promise<void> {
    this.storage.set(expense.id, expense.toData());
  }

  async delete(id: string): Promise<void> {
    this.storage.remove(id);
  }

  async clear(): Promise<void> {
    this.storage.clear();
  }
}

