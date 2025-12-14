import { ExpenseStats } from "@/domain/services";
import { ExpenseCalculator, CategoryBreakdown } from "@/domain/services";
import { getCategory } from "@/domain/value-objects";
import { useStore } from "storion/react";
import { expenseStore, filterStore } from "../stores";
import { useMemo } from "react";

interface StatsPanelProps {
  stats: ExpenseStats;
  isLoading: boolean;
}

export function StatsPanel({ stats, isLoading }: StatsPanelProps) {
  const { expenses } = useStore(({ get }) => {
    const [state] = get(expenseStore);
    return { expenses: state.expenses };
  });

  const { dateRange } = useStore(({ get }) => {
    const [state] = get(filterStore);
    return { dateRange: state.dateRange };
  });

  const breakdown = useMemo(() => {
    const filtered = ExpenseCalculator.filterByDateRange(expenses, dateRange);
    return ExpenseCalculator.getCategoryBreakdown(filtered);
  }, [expenses, dateRange]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="stat-card animate-pulse">
            <div className="h-8 bg-slate-200 rounded w-24" />
            <div className="h-4 bg-slate-200 rounded w-16" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mb-8 space-y-6">
      {/* Main Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Spent"
          value={stats.total.format()}
          icon="💸"
          accent="primary"
        />
        <StatCard
          label="Transactions"
          value={stats.count.toString()}
          icon="📝"
          accent="blue"
        />
        <StatCard
          label="Average"
          value={stats.average.format()}
          icon="📊"
          accent="purple"
        />
        <StatCard
          label="Daily Average"
          value={stats.dailyAverage.format()}
          icon="📅"
          accent="amber"
        />
      </div>

      {/* Category Breakdown */}
      {breakdown.length > 0 && (
        <div className="card p-6">
          <h3 className="text-sm font-medium text-slate-500 mb-4">
            Spending by Category
          </h3>
          <div className="space-y-3">
            {breakdown.slice(0, 5).map((item) => (
              <CategoryBar key={item.category} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: string;
  icon: string;
  accent: "primary" | "blue" | "purple" | "amber";
}

function StatCard({ label, value, icon, accent }: StatCardProps) {
  const accentColors = {
    primary: "from-primary-500 to-primary-600",
    blue: "from-blue-500 to-blue-600",
    purple: "from-purple-500 to-purple-600",
    amber: "from-amber-500 to-amber-600",
  };

  return (
    <div className="stat-card group hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <span className="stat-value">{value}</span>
        <span
          className={`w-10 h-10 rounded-lg bg-gradient-to-br ${accentColors[accent]} 
                     flex items-center justify-center text-lg opacity-80 
                     group-hover:opacity-100 transition-opacity`}
        >
          {icon}
        </span>
      </div>
      <span className="stat-label">{label}</span>
    </div>
  );
}

function CategoryBar({ item }: { item: CategoryBreakdown }) {
  const category = getCategory(item.category);

  const colorMap: Record<string, string> = {
    "expense-food": "bg-red-500",
    "expense-transport": "bg-blue-500",
    "expense-entertainment": "bg-purple-500",
    "expense-shopping": "bg-amber-500",
    "expense-bills": "bg-cyan-500",
    "expense-health": "bg-emerald-500",
    "expense-other": "bg-slate-500",
  };

  return (
    <div className="flex items-center gap-4">
      <span className="text-xl w-8">{category.icon}</span>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-slate-700">
            {category.label}
          </span>
          <span className="text-sm text-slate-500">
            {item.amount.format()} ({item.percentage.toFixed(1)}%)
          </span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full ${colorMap[category.color]} rounded-full transition-all duration-500`}
            style={{ width: `${item.percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}

