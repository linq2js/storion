/**
 * Expense categories.
 */
export const CATEGORIES = [
  "food",
  "transport",
  "entertainment",
  "shopping",
  "bills",
  "health",
  "other",
] as const;

export type CategoryType = (typeof CATEGORIES)[number];

/**
 * Category value object with metadata.
 */
export interface Category {
  readonly type: CategoryType;
  readonly label: string;
  readonly icon: string;
  readonly color: string;
}

const CATEGORY_DATA: Record<CategoryType, Omit<Category, "type">> = {
  food: { label: "Food & Dining", icon: "🍔", color: "expense-food" },
  transport: { label: "Transportation", icon: "🚗", color: "expense-transport" },
  entertainment: {
    label: "Entertainment",
    icon: "🎬",
    color: "expense-entertainment",
  },
  shopping: { label: "Shopping", icon: "🛍️", color: "expense-shopping" },
  bills: { label: "Bills & Utilities", icon: "📄", color: "expense-bills" },
  health: { label: "Health", icon: "💊", color: "expense-health" },
  other: { label: "Other", icon: "📦", color: "expense-other" },
};

export function getCategory(type: CategoryType): Category {
  return { type, ...CATEGORY_DATA[type] };
}

export function getAllCategories(): Category[] {
  return CATEGORIES.map(getCategory);
}

export function isValidCategory(type: string): type is CategoryType {
  return CATEGORIES.includes(type as CategoryType);
}

