import { useStore } from "storion/react";
import { filterStore, DateRangePreset } from "../stores";
import { getAllCategories, CategoryType } from "@/domain/value-objects";

const DATE_PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "lastMonth", label: "Last Month" },
  { value: "all", label: "All Time" },
];

export function FilterBar() {
  const {
    dateRangePreset,
    category,
    setDateRangePreset,
    setCategory,
    reset,
  } = useStore(({ get }) => {
    const [state, actions] = get(filterStore);
    return {
      dateRangePreset: state.dateRangePreset,
      category: state.category,
      setDateRangePreset: actions.setDateRangePreset,
      setCategory: actions.setCategory,
      reset: actions.reset,
    };
  });

  const categories = getAllCategories();

  return (
    <div className="card p-4 mb-6">
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Date Range Filter */}
        <div className="flex-1">
          <label className="block text-xs font-medium text-slate-500 mb-2">
            Time Period
          </label>
          <div className="flex flex-wrap gap-2">
            {DATE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => setDateRangePreset(preset.value)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                  dateRangePreset === preset.value
                    ? "bg-primary-100 text-primary-700 font-medium"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Category Filter */}
        <div className="sm:w-48">
          <label className="block text-xs font-medium text-slate-500 mb-2">
            Category
          </label>
          <select
            value={category ?? ""}
            onChange={(e) =>
              setCategory(
                e.target.value ? (e.target.value as CategoryType) : null
              )
            }
            className="input py-1.5 text-sm"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.type} value={cat.type}>
                {cat.icon} {cat.label}
              </option>
            ))}
          </select>
        </div>

        {/* Reset Button */}
        <div className="flex items-end">
          <button onClick={reset} className="btn btn-ghost text-sm py-1.5">
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}

