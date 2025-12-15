import { memo, useMemo } from "react";
import { ExpenseCalculator, CategoryBreakdown as CategoryBreakdownType } from "@/domain/services";
import { getCategory } from "@/domain/value-objects";
import { useStore } from "storion/react";
import { expenseStore, filterStore } from "../stores";
import { formatCompact } from "./StatsPanel";

export const CategoryBreakdown = memo(function CategoryBreakdown() {
  const { expenses } = useStore(({ resolve }) => {
    const [state] = resolve(expenseStore);
    return { expenses: state.expenses };
  });

  const { dateRange } = useStore(({ resolve }) => {
    const [state] = resolve(filterStore);
    return { dateRange: state.dateRange };
  });

  const breakdown = useMemo(() => {
    const filtered = ExpenseCalculator.filterByDateRange(expenses, dateRange);
    return ExpenseCalculator.getCategoryBreakdown(filtered);
  }, [expenses, dateRange]);

  if (breakdown.length === 0) return null;

  return (
    <div className="card p-5 sm:p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title">By Category</h3>
        <span className="text-xs text-surface-400">
          {breakdown.length} categor{breakdown.length === 1 ? "y" : "ies"}
        </span>
      </div>
      <div className="space-y-4">
        {breakdown.slice(0, 5).map((item, index) => (
          <CategoryBar key={item.category} item={item} delay={index * 50} />
        ))}
      </div>
    </div>
  );
});

const CategoryBar = memo(function CategoryBar({
  item,
  delay = 0,
}: {
  item: CategoryBreakdownType;
  delay?: number;
}) {
  const category = getCategory(item.category);

  const colorMap: Record<string, { bar: string; bg: string }> = {
    "expense-food": { bar: "bg-rose-500", bg: "bg-rose-50" },
    "expense-transport": { bar: "bg-sky-500", bg: "bg-sky-50" },
    "expense-entertainment": { bar: "bg-purple-500", bg: "bg-purple-50" },
    "expense-shopping": { bar: "bg-orange-500", bg: "bg-orange-50" },
    "expense-bills": { bar: "bg-cyan-500", bg: "bg-cyan-50" },
    "expense-health": { bar: "bg-emerald-500", bg: "bg-emerald-50" },
    "expense-other": { bar: "bg-surface-400", bg: "bg-surface-50" },
  };

  const colors = colorMap[category.color] ?? colorMap["expense-other"];

  return (
    <div
      className="animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-3 mb-2">
        <span
          className={`w-8 h-8 rounded-lg ${colors.bg} flex items-center justify-center text-base`}
        >
          {category.icon}
        </span>
        <span className="flex-1 text-sm font-medium text-surface-700 truncate">
          {category.label}
        </span>
        <span className="money-sm text-surface-600" title={item.amount.format()}>
          {formatCompact(item.amount.format())}
        </span>
        <span className="text-xs text-surface-400 w-12 text-right">
          {item.percentage.toFixed(0)}%
        </span>
      </div>
      <div className="progress-bar">
        <div
          className={`progress-fill ${colors.bar}`}
          style={{
            width: `${item.percentage}%`,
            transitionDelay: `${delay + 100}ms`,
          }}
        />
      </div>
    </div>
  );
});

