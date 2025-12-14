import { Money, CategoryType } from "../value-objects";

/**
 * Budget entity - represents monthly budget limits.
 */
export interface BudgetData {
  totalLimit: number;
  categoryLimits: Partial<Record<CategoryType, number>>;
  currency: string;
}

export class Budget {
  private constructor(private readonly data: BudgetData) {}

  static create(
    totalLimit: number,
    categoryLimits: Partial<Record<CategoryType, number>> = {}
  ): Budget {
    if (totalLimit < 0) {
      throw new Error("Budget limit cannot be negative");
    }

    for (const [category, limit] of Object.entries(categoryLimits)) {
      if (limit !== undefined && limit < 0) {
        throw new Error(`Budget limit for ${category} cannot be negative`);
      }
    }

    return new Budget({
      totalLimit,
      categoryLimits,
      currency: "USD",
    });
  }

  static fromData(data: BudgetData): Budget {
    return new Budget(data);
  }

  static default(): Budget {
    return Budget.create(2000, {
      food: 500,
      transport: 300,
      entertainment: 200,
      shopping: 400,
      bills: 400,
      health: 100,
      other: 100,
    });
  }

  get totalLimit(): Money {
    return Money.create(this.data.totalLimit, this.data.currency);
  }

  getCategoryLimit(category: CategoryType): Money | null {
    const limit = this.data.categoryLimits[category];
    return limit !== undefined
      ? Money.create(limit, this.data.currency)
      : null;
  }

  setTotalLimit(amount: number): Budget {
    return Budget.create(amount, this.data.categoryLimits);
  }

  setCategoryLimit(category: CategoryType, amount: number | null): Budget {
    const newLimits = { ...this.data.categoryLimits };
    if (amount === null) {
      delete newLimits[category];
    } else {
      newLimits[category] = amount;
    }
    return Budget.create(this.data.totalLimit, newLimits);
  }

  getRemainingTotal(spent: Money): Money {
    const remaining = this.data.totalLimit - spent.amount;
    return Money.create(Math.max(0, remaining), this.data.currency);
  }

  getRemainingCategory(category: CategoryType, spent: Money): Money | null {
    const limit = this.data.categoryLimits[category];
    if (limit === undefined) return null;
    const remaining = limit - spent.amount;
    return Money.create(Math.max(0, remaining), this.data.currency);
  }

  isOverBudget(spent: Money): boolean {
    return spent.amount > this.data.totalLimit;
  }

  isCategoryOverBudget(category: CategoryType, spent: Money): boolean {
    const limit = this.data.categoryLimits[category];
    return limit !== undefined && spent.amount > limit;
  }

  getPercentUsed(spent: Money): number {
    if (this.data.totalLimit === 0) return 0;
    return Math.min(100, (spent.amount / this.data.totalLimit) * 100);
  }

  toData(): BudgetData {
    return { ...this.data };
  }
}

