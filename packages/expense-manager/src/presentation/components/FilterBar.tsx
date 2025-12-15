import { memo } from "react";
import { useStore } from "storion/react";
import { filterStore, DateRangePreset } from "../stores";
import { getAllCategories, CategoryType } from "@/domain/value-objects";

const DATE_PRESETS: { value: DateRangePreset; label: string; short: string }[] = [
  { value: "today", label: "Today", short: "1D" },
  { value: "week", label: "This Week", short: "1W" },
  { value: "month", label: "This Month", short: "1M" },
  { value: "lastMonth", label: "Last Month", short: "LM" },
  { value: "all", label: "All Time", short: "All" },
];

export const FilterBar = memo(function FilterBar() {
  const { dateRangePreset, category, setDateRangePreset, setCategory, reset } =
    useStore(({ resolve }) => {
      const [state, actions] = resolve(filterStore);
      return {
        dateRangePreset: state.dateRangePreset,
        category: state.category,
        setDateRangePreset: actions.setDateRangePreset,
        setCategory: actions.setCategory,
        reset: actions.reset,
      };
    });

  const categories = getAllCategories();
  const hasFilters = category !== null;

  return (
    <div className="card p-4 sm:p-5 mb-6">
      <div className="flex flex-col sm:flex-row gap-4 sm:items-end">
        {/* Date Range Pills */}
        <div className="flex-1">
          <label className="section-title block mb-3">Time Period</label>
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setDateRangePreset(preset.value)}
                className={`tag transition-all ${
                  dateRangePreset === preset.value
                    ? "tag-active shadow-sm"
                    : "tag-inactive"
                }`}
              >
                <span className="hidden sm:inline">{preset.label}</span>
                <span className="sm:hidden">{preset.short}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Category Dropdown + Clear */}
        <div className="flex items-end gap-2 sm:w-[40%]">
          <div className="flex-1">
            <label className="section-title block mb-3">Category</label>
            <div className="relative">
              <select
                value={category ?? ""}
                onChange={(e) =>
                  setCategory(
                    e.target.value ? (e.target.value as CategoryType) : null
                  )
                }
                className="input w-full py-2 pr-10 text-sm appearance-none cursor-pointer"
              >
                <option value="">All</option>
                {categories.map((cat) => (
                  <option key={cat.type} value={cat.type}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-surface-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Clear button */}
          {hasFilters && (
            <button
              onClick={reset}
              className="btn btn-ghost text-sm gap-1.5 text-surface-500 hover:text-surface-700 mb-px shrink-0"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
