import { store } from "storion";
import { DateRange, CategoryType } from "@/domain/value-objects";

export type DateRangePreset = "today" | "week" | "month" | "lastMonth" | "all";

/**
 * Filter store - manages expense filters.
 */
export const filterStore = store({
  name: "filters",

  state: {
    dateRangePreset: "month" as DateRangePreset,
    dateRange: DateRange.thisMonth(),
    category: null as CategoryType | null,
    searchQuery: "",
  },

  setup: ({ state }) => ({
    /**
     * Set date range preset.
     */
    setDateRangePreset(preset: DateRangePreset) {
      state.dateRangePreset = preset;
      state.dateRange = getDateRangeFromPreset(preset);
    },

    /**
     * Set custom date range.
     */
    setCustomDateRange(start: Date, end: Date) {
      state.dateRangePreset = "month"; // Reset preset indicator
      state.dateRange = DateRange.create(start, end);
    },

    /**
     * Set category filter.
     */
    setCategory(category: CategoryType | null) {
      state.category = category;
    },

    /**
     * Set search query.
     */
    setSearchQuery(query: string) {
      state.searchQuery = query;
    },

    /**
     * Reset all filters.
     */
    reset() {
      state.dateRangePreset = "month";
      state.dateRange = DateRange.thisMonth();
      state.category = null;
      state.searchQuery = "";
    },
  }),
});

function getDateRangeFromPreset(preset: DateRangePreset): DateRange {
  switch (preset) {
    case "today":
      return DateRange.today();
    case "week":
      return DateRange.thisWeek();
    case "month":
      return DateRange.thisMonth();
    case "lastMonth":
      return DateRange.lastMonth();
    case "all":
      return DateRange.allTime();
  }
}

