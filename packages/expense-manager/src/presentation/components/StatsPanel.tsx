import { memo } from "react";
import { ExpenseStats } from "@/domain/services";

interface StatsPanelProps {
  stats: ExpenseStats;
  isLoading: boolean;
}

export const StatsPanel = memo(function StatsPanel({
  stats,
  isLoading,
}: StatsPanelProps) {
  if (isLoading) {
    return (
      <div className="mb-6 space-y-6 animate-stagger">
        <div className="card p-6 sm:p-8">
          <div className="skeleton h-4 w-24 mb-2" />
          <div className="skeleton h-10 w-40 mb-2" />
          <div className="skeleton h-4 w-32" />
        </div>
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {[...Array(3)].map((_, i) => (
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
    <div className="mb-6 space-y-4">
      {/* Hero Stat */}
      <div className="card p-6 sm:p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-primary-100/50 to-transparent rounded-full -translate-y-1/2 translate-x-1/2" />
        <div className="relative">
          <p className="section-title mb-2">Total Spent</p>
          <p className="money-lg text-surface-900" title={stats.total.format()}>
            {formatCompact(stats.total.format())}
          </p>
          <p className="text-sm text-surface-500 mt-1">
            {stats.count} transaction{stats.count !== 1 ? "s" : ""} this period
          </p>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4 animate-stagger">
        <QuickStat
          label="Average"
          value={stats.average.format()}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
          color="purple"
        />
        <QuickStat
          label="Daily Avg"
          value={stats.dailyAverage.format()}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
          color="amber"
        />
        <QuickStat
          label="Highest"
          value={stats.highest?.format() ?? "$0.00"}
          icon={
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
            </svg>
          }
          color="rose"
        />
      </div>
    </div>
  );
});

// Format large numbers compactly
export function formatCompact(value: string): string {
  // Extract numeric part (assumes format like "$1,234.56")
  const numStr = value.replace(/[^0-9.-]/g, "");
  const num = parseFloat(numStr);

  if (isNaN(num)) return value;

  // Keep original format for reasonable numbers
  if (num < 100000) return value;

  // Match digits, commas, and decimal portion (e.g., "1,234,567.89")
  const numPattern = /[\d,]+(\.\d+)?/;

  // Compact format for very large numbers
  if (num >= 1000000000) {
    return value.replace(numPattern, (num / 1000000000).toFixed(1) + "B");
  }
  if (num >= 1000000) {
    return value.replace(numPattern, (num / 1000000).toFixed(1) + "M");
  }
  if (num >= 100000) {
    return value.replace(numPattern, (num / 1000).toFixed(0) + "K");
  }

  return value;
}

interface QuickStatProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: "purple" | "amber" | "rose" | "teal";
}

const QuickStat = memo(function QuickStat({
  label,
  value,
  icon,
  color,
}: QuickStatProps) {
  const colorClasses = {
    purple: "bg-purple-50 text-purple-600",
    amber: "bg-amber-50 text-amber-600",
    rose: "bg-rose-50 text-rose-600",
    teal: "bg-primary-50 text-primary-600",
  };

  return (
    <div className="stat-card">
      <div className={`w-9 h-9 rounded-xl ${colorClasses[color]} flex items-center justify-center mb-2`}>
        {icon}
      </div>
      <p className="money-sm text-surface-900" title={value}>
        {formatCompact(value)}
      </p>
      <p className="stat-label">{label}</p>
    </div>
  );
});
