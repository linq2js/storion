import { memo, useMemo } from "react";
import { useStore } from "storion/react";
import { expenseStore, filterStore, uiStore } from "../stores";
import { ExpenseCalculator } from "@/domain/services";
import { DateRange, getCategory, Money } from "@/domain/value-objects";
import { Expense } from "@/domain/entities";

interface MonthlyData {
  month: string;
  shortMonth: string;
  amount: Money;
  count: number;
}

function getMonthlyTrend(
  expenses: Expense[],
  months: number = 6
): MonthlyData[] {
  const result: MonthlyData[] = [];
  const now = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(
      date.getFullYear(),
      date.getMonth() + 1,
      0,
      23,
      59,
      59
    );

    const monthExpenses = expenses.filter(
      (e) => e.date >= monthStart && e.date <= monthEnd
    );

    result.push({
      month: date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      }),
      shortMonth: date.toLocaleDateString("en-US", { month: "short" }),
      amount: ExpenseCalculator.calculateTotal(monthExpenses),
      count: monthExpenses.length,
    });
  }

  return result;
}

function formatCompact(amount: number): string {
  if (amount >= 1000000) {
    const value = (amount / 1000000).toFixed(1);
    return `$${value.replace(/\.0$/, "")}M`;
  }
  if (amount >= 1000) {
    const value = (amount / 1000).toFixed(1);
    return `$${value.replace(/\.0$/, "")}K`;
  }
  return `$${Math.round(amount)}`;
}

// Simple bar chart component
const BarChart = memo(function BarChart({
  data,
  maxValue,
}: {
  data: MonthlyData[];
  maxValue: number;
}) {
  return (
    <div className="flex items-end gap-2 h-40">
      {data.map((item, index) => {
        const height = maxValue > 0 ? (item.amount.amount / maxValue) * 100 : 0;
        const isCurrentMonth = index === data.length - 1;

        return (
          <div
            key={item.month}
            className="flex-1 flex flex-col items-center gap-2"
          >
            <div className="text-xs text-surface-500 font-medium">
              {formatCompact(item.amount.amount)}
            </div>
            <div
              className="w-full flex justify-center items-end"
              style={{ height: "100px" }}
            >
              <div
                className={`w-full max-w-12 rounded-t-lg transition-all duration-500 ${
                  isCurrentMonth
                    ? "bg-gradient-to-t from-primary-500 to-primary-400"
                    : "bg-gradient-to-t from-surface-300 to-surface-200"
                }`}
                style={{ height: `${Math.max(height, 4)}%` }}
              />
            </div>
            <div className="text-xs text-surface-600 font-medium">
              {item.shortMonth}
            </div>
          </div>
        );
      })}
    </div>
  );
});

// Category bar component
const CategoryBar = memo(function CategoryBar({
  category,
  amount,
  percentage,
  count,
  maxPercentage,
}: {
  category: string;
  amount: Money;
  percentage: number;
  count: number;
  maxPercentage: number;
}) {
  const info = getCategory(category as any);
  const barWidth = maxPercentage > 0 ? (percentage / maxPercentage) * 100 : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">{info?.icon}</span>
          <span className="text-sm font-medium text-surface-700">
            {info?.label || category}
          </span>
          <span className="text-xs text-surface-400">({count})</span>
        </div>
        <div className="text-right">
          <span className="text-sm font-semibold text-surface-800">
            {amount.format()}
          </span>
          <span className="text-xs text-surface-500 ml-2">
            {percentage.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="h-2 bg-surface-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-primary-400 to-primary-500 rounded-full transition-all duration-500"
          style={{ width: `${barWidth}%` }}
        />
      </div>
    </div>
  );
});

// Top expense item
const TopExpenseItem = memo(function TopExpenseItem({
  expense,
  rank,
  onClick,
}: {
  expense: Expense;
  rank: number;
  onClick?: () => void;
}) {
  const info = getCategory(expense.category);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-3 rounded-lg hover:bg-surface-50 transition-colors cursor-pointer text-left"
    >
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
          rank === 1
            ? "bg-amber-100 text-amber-700"
            : rank === 2
            ? "bg-slate-100 text-slate-600"
            : rank === 3
            ? "bg-orange-100 text-orange-700"
            : "bg-surface-100 text-surface-600"
        }`}
      >
        {rank}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span>{info?.icon}</span>
          <span className="text-sm font-medium text-surface-800 truncate">
            {expense.description}
          </span>
        </div>
        <div className="text-xs text-surface-500">
          {expense.date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </div>
      </div>
      <div className="text-sm font-semibold text-surface-800">
        {expense.amount.format()}
      </div>
    </button>
  );
});

// Insight card
const InsightCard = memo(function InsightCard({
  icon,
  label,
  value,
  subtext,
  trend,
}: {
  icon: string;
  label: string;
  value: string;
  subtext?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <div className="bg-white rounded-xl p-4 border border-surface-200">
      <div className="flex items-start gap-3">
        <div className="text-2xl">{icon}</div>
        <div className="flex-1">
          <div className="text-xs text-surface-500 uppercase tracking-wide mb-1 truncate">
            {label}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-surface-800">{value}</span>
            {trend && (
              <span
                className={`text-xs font-medium ${
                  trend === "up"
                    ? "text-rose-500"
                    : trend === "down"
                    ? "text-emerald-500"
                    : "text-surface-400"
                }`}
              >
                {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
              </span>
            )}
          </div>
          {subtext && (
            <div className="text-xs text-surface-500 mt-1">{subtext}</div>
          )}
        </div>
      </div>
    </div>
  );
});

export const ReportPage = memo(function ReportPage() {
  const { expenses, dateRange, openEditModal } = useStore(({ resolve }) => {
    const [expenseState] = resolve(expenseStore);
    const [filterState] = resolve(filterStore);
    const [, uiActions] = resolve(uiStore);
    return {
      expenses: expenseState.expenses,
      dateRange: filterState.dateRange,
      openEditModal: uiActions.openEditModal,
    };
  });

  // Monthly trend data
  const monthlyTrend = useMemo(() => getMonthlyTrend(expenses, 6), [expenses]);
  const maxMonthlyAmount = useMemo(
    () => Math.max(...monthlyTrend.map((m) => m.amount.amount), 1),
    [monthlyTrend]
  );

  // Filtered expenses for current period
  const filteredExpenses = useMemo(
    () => ExpenseCalculator.filterByDateRange(expenses, dateRange),
    [expenses, dateRange]
  );

  // Category breakdown
  const categoryBreakdown = useMemo(
    () => ExpenseCalculator.getCategoryBreakdown(filteredExpenses),
    [filteredExpenses]
  );
  const maxCategoryPercentage = useMemo(
    () => Math.max(...categoryBreakdown.map((c) => c.percentage), 1),
    [categoryBreakdown]
  );

  // Top expenses
  const topExpenses = useMemo(
    () => ExpenseCalculator.getTopExpenses(filteredExpenses, 5),
    [filteredExpenses]
  );

  // Stats
  const stats = useMemo(
    () => ExpenseCalculator.calculateStats(filteredExpenses, dateRange),
    [filteredExpenses, dateRange]
  );

  // Calculate previous period for comparison
  const previousPeriodStats = useMemo(() => {
    const days = dateRange.getDays();
    const prevStart = new Date(dateRange.start);
    prevStart.setDate(prevStart.getDate() - days);
    const prevEnd = new Date(dateRange.start);
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevRange = DateRange.create(prevStart, prevEnd);
    const prevExpenses = ExpenseCalculator.filterByDateRange(
      expenses,
      prevRange
    );
    return ExpenseCalculator.calculateStats(prevExpenses, prevRange);
  }, [expenses, dateRange]);

  // Trend calculation
  const spendingTrend = useMemo(() => {
    if (previousPeriodStats.total.amount === 0) return "neutral";
    return stats.total.amount > previousPeriodStats.total.amount
      ? "up"
      : "down";
  }, [stats, previousPeriodStats]);

  const trendPercentage = useMemo(() => {
    if (previousPeriodStats.total.amount === 0) return 0;
    return (
      ((stats.total.amount - previousPeriodStats.total.amount) /
        previousPeriodStats.total.amount) *
      100
    );
  }, [stats, previousPeriodStats]);

  return (
    <div className="space-y-6">
      {/* Insights Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <InsightCard
          icon="💰"
          label="Total Spent"
          value={stats.total.format()}
          subtext={`${stats.count} transactions`}
          trend={spendingTrend as "up" | "down" | "neutral"}
        />
        <InsightCard
          icon="📊"
          label="Daily Average"
          value={stats.dailyAverage.format()}
          subtext="per day"
        />
        <InsightCard
          icon="🎯"
          label="Avg Transaction"
          value={stats.average.format()}
          subtext={`${stats.count} total`}
        />
        <InsightCard
          icon="📈"
          label="vs Previous"
          value={`${trendPercentage >= 0 ? "+" : ""}${trendPercentage.toFixed(
            1
          )}%`}
          subtext={previousPeriodStats.total.format()}
          trend={spendingTrend as "up" | "down" | "neutral"}
        />
      </div>

      {/* Monthly Trend */}
      <div className="card p-5">
        <h3 className="section-title mb-4">Monthly Spending Trend</h3>
        {monthlyTrend.length > 0 ? (
          <BarChart data={monthlyTrend} maxValue={maxMonthlyAmount} />
        ) : (
          <div className="text-center text-surface-500 py-8">
            No data available
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Category Breakdown */}
        <div className="card p-5">
          <h3 className="section-title mb-4">Spending by Category</h3>
          {categoryBreakdown.length > 0 ? (
            <div className="space-y-4">
              {categoryBreakdown.map((item) => (
                <CategoryBar
                  key={item.category}
                  category={item.category}
                  amount={item.amount}
                  percentage={item.percentage}
                  count={item.count}
                  maxPercentage={maxCategoryPercentage}
                />
              ))}
            </div>
          ) : (
            <div className="text-center text-surface-500 py-8">
              No expenses in this period
            </div>
          )}
        </div>

        {/* Top Expenses */}
        <div className="card p-5">
          <h3 className="section-title mb-4">Top Expenses</h3>
          {topExpenses.length > 0 ? (
            <div className="space-y-1">
              {topExpenses.map((expense, index) => (
                <TopExpenseItem
                  key={expense.id}
                  expense={expense}
                  rank={index + 1}
                  onClick={() => openEditModal(expense)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center text-surface-500 py-8">
              No expenses in this period
            </div>
          )}
        </div>
      </div>

      {/* Spending Summary */}
      <div className="card p-5">
        <h3 className="section-title mb-4">Period Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-surface-50 rounded-xl">
            <div className="text-2xl font-bold text-surface-800">
              {stats.count}
            </div>
            <div className="text-xs text-surface-500 mt-1">Transactions</div>
          </div>
          <div className="text-center p-4 bg-surface-50 rounded-xl">
            <div className="text-2xl font-bold text-surface-800">
              {categoryBreakdown.length}
            </div>
            <div className="text-xs text-surface-500 mt-1">Categories</div>
          </div>
          <div className="text-center p-4 bg-surface-50 rounded-xl">
            <div className="text-2xl font-bold text-surface-800">
              {dateRange.getDays()}
            </div>
            <div className="text-xs text-surface-500 mt-1">Days</div>
          </div>
          <div className="text-center p-4 bg-surface-50 rounded-xl">
            <div className="text-2xl font-bold text-surface-800">
              {stats.highest?.format() ?? "-"}
            </div>
            <div className="text-xs text-surface-500 mt-1">Highest</div>
          </div>
        </div>
      </div>
    </div>
  );
});
