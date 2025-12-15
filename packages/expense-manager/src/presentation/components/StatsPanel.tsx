import { memo, useMemo } from "react";
import { useStore } from "storion/react";
import { Expense } from "@/domain/entities";
import { getCategory } from "@/domain/value-objects";
import { ExpenseCalculator } from "@/domain/services";
import { uiStore, filterStore } from "../stores";

interface StatsPanelProps {
  expenses: Expense[];
  isLoading: boolean;
}

export const StatsPanel = memo(function StatsPanel({
  expenses,
  isLoading,
}: StatsPanelProps) {
  const { openEditModal, setDateRangePreset } = useStore(({ resolve }) => {
    const [, uiActions] = resolve(uiStore);
    const [, filterActions] = resolve(filterStore);
    return {
      openEditModal: uiActions.openEditModal,
      setDateRangePreset: filterActions.setDateRangePreset,
    };
  });

  // Calculate stats
  const { lastExpense, todayTotal, monthTotal, todayCount, monthCount } = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Sort by date descending to get last expense
    const sorted = ExpenseCalculator.sortByDate(expenses, false);
    const last = sorted[0] ?? null;

    // Today's expenses
    const todayExpenses = expenses.filter(e => e.date >= todayStart);
    const todaySum = ExpenseCalculator.calculateTotal(todayExpenses);

    // This month's expenses (MTD)
    const monthExpenses = expenses.filter(e => e.date >= monthStart);
    const monthSum = ExpenseCalculator.calculateTotal(monthExpenses);

    return {
      lastExpense: last,
      todayTotal: todaySum,
      monthTotal: monthSum,
      todayCount: todayExpenses.length,
      monthCount: monthExpenses.length,
    };
  }, [expenses]);

  if (isLoading) {
    return (
      <div className="mb-6 space-y-3 sm:space-y-4 animate-stagger">
        {/* Last Expense skeleton - visible on mobile only */}
        <div className="lg:hidden card p-5">
          <div className="skeleton h-4 w-24 mb-2" />
          <div className="skeleton h-6 w-48 mb-1" />
          <div className="skeleton h-4 w-32" />
        </div>
        {/* Grid skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {/* Last Expense skeleton - visible on large only */}
          <div className="hidden lg:block card p-5">
            <div className="skeleton h-4 w-24 mb-2" />
            <div className="skeleton h-6 w-48 mb-1" />
            <div className="skeleton h-4 w-32" />
          </div>
          {[...Array(2)].map((_, i) => (
            <div key={i} className="stat-card">
              <div className="skeleton w-9 h-9 rounded-xl mb-2" />
              <div className="skeleton h-5 w-20 mb-1" />
              <div className="skeleton h-4 w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-3 sm:space-y-4">
      {/* Last Expense Card - full width on mobile, 1/3 on large */}
      <div className="lg:hidden">
        {lastExpense ? (
          <button
            onClick={() => openEditModal(lastExpense)}
            className="card p-5 relative overflow-hidden w-full text-left cursor-pointer hover:shadow-md transition-shadow duration-200 group"
          >
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-primary-100/50 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 group-hover:from-primary-200/50 transition-colors duration-200" />
            <div className="relative">
              <p className="section-title mb-2">Last Expense</p>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{getCategory(lastExpense.category).icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-surface-900 truncate">
                    {lastExpense.description}
                  </p>
                  <p className="text-xs text-surface-500">
                    {formatRelativeDate(lastExpense.date)}
                  </p>
                </div>
                <p className="money-md text-surface-900">
                  {lastExpense.amount.format()}
                </p>
              </div>
            </div>
          </button>
        ) : (
          <div className="card p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-primary-100/50 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative">
              <p className="section-title mb-2">Last Expense</p>
              <p className="text-surface-500 text-sm">No expenses yet</p>
            </div>
          </div>
        )}
      </div>

      {/* Quick Stats - 2 cols on mobile, 3 cols on large (with Last Expense) */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Last Expense - only visible on large screens */}
        <div className="hidden lg:block">
          {lastExpense ? (
            <button
              onClick={() => openEditModal(lastExpense)}
              className="card p-5 relative overflow-hidden w-full h-full text-left cursor-pointer hover:shadow-md transition-shadow duration-200 group"
            >
              <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-primary-100/50 to-transparent rounded-full -translate-y-1/2 translate-x-1/2 group-hover:from-primary-200/50 transition-colors duration-200" />
              <div className="relative">
                <p className="section-title mb-2">Last Expense</p>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{getCategory(lastExpense.category).icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-surface-900 truncate">
                      {lastExpense.description}
                    </p>
                    <p className="text-xs text-surface-500">
                      {formatRelativeDate(lastExpense.date)}
                    </p>
                  </div>
                  <p className="money-md text-surface-900">
                    {lastExpense.amount.format()}
                  </p>
                </div>
              </div>
            </button>
          ) : (
            <div className="card p-5 relative overflow-hidden h-full">
              <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-primary-100/50 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
              <div className="relative">
                <p className="section-title mb-2">Last Expense</p>
                <p className="text-surface-500 text-sm">No expenses yet</p>
              </div>
            </div>
          )}
        </div>

        {/* Today Stat */}
        <QuickStat
          label="Today"
          value={todayTotal.format()}
          subtext={`${todayCount} expense${todayCount !== 1 ? "s" : ""}`}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
          color="amber"
          isEmpty={todayCount === 0}
          onClick={() => setDateRangePreset("today")}
        />

        {/* This Month Stat */}
        <QuickStat
          label="This Month"
          value={monthTotal.format()}
          subtext={`${monthCount} expense${monthCount !== 1 ? "s" : ""} MTD`}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
          color="purple"
          isEmpty={monthCount === 0}
          onClick={() => setDateRangePreset("month")}
        />
      </div>
    </div>
  );
});

// Format date relative to now
function formatRelativeDate(date: Date): string {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (date >= todayStart) {
    return `Today at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }
  if (date >= yesterdayStart) {
    return `Yesterday at ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  }

  const diffDays = Math.floor((todayStart.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return `${diffDays} days ago`;
  }

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Format large numbers compactly
export function formatCompact(value: string): string {
  const numStr = value.replace(/[^0-9.-]/g, "");
  const num = parseFloat(numStr);

  if (isNaN(num)) return value;
  if (num < 100000) return value;

  const numPattern = /[\d,]+(\.\d+)?/;

  if (num >= 1000000000) {
    return value.replace(numPattern, (num / 1000000000).toFixed(1).replace(/\.0$/, "") + "B");
  }
  if (num >= 1000000) {
    return value.replace(numPattern, (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M");
  }
  if (num >= 100000) {
    return value.replace(numPattern, (num / 1000).toFixed(0) + "K");
  }

  return value;
}

interface QuickStatProps {
  label: string;
  value: string;
  subtext: string;
  icon: React.ReactNode;
  color: "purple" | "amber" | "rose" | "teal";
  isEmpty?: boolean;
  onClick?: () => void;
}

const QuickStat = memo(function QuickStat({
  label,
  value,
  subtext,
  icon,
  color,
  isEmpty,
  onClick,
}: QuickStatProps) {
  const colorClasses = {
    purple: "text-purple-200",
    amber: "text-amber-200",
    rose: "text-rose-200",
    teal: "text-primary-200",
  };

  return (
    <button
      onClick={onClick}
      className="stat-card relative overflow-hidden text-left cursor-pointer hover:shadow-md transition-shadow duration-200"
    >
      {/* Background icon decoration */}
      <div className={`absolute top-2 right-2 w-16 h-16 ${colorClasses[color]} opacity-40 [&>svg]:w-full [&>svg]:h-full`}>
        {icon}
      </div>
      
      {/* Content */}
      <div className="relative z-10">
        <p className={`money-sm ${isEmpty ? "text-surface-400" : "text-surface-900"}`} title={value}>
          {formatCompact(value)}
        </p>
        <p className="stat-label">{label}</p>
        <p className="text-[10px] text-surface-400 mt-0.5">{subtext}</p>
      </div>
    </button>
  );
});
