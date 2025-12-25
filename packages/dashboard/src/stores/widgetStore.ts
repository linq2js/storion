import { store, StoreInstanceOf } from "storion/react";
import { async } from "storion/async";

// =============================================================================
// TYPES
// =============================================================================

export type WidgetType = "metric" | "chart" | "list" | "clock" | "weather";

export interface WidgetConfig {
  type: WidgetType;
  title: string;
  color: string;
}

export type WidgetInstance = StoreInstanceOf<typeof widgetStore>;

// =============================================================================
// WIDGET STORE (for each widget instance)
// =============================================================================

export const widgetStore = store({
  name: "widget",
  lifetime: "autoDispose",
  state: {
    /** Widget type */
    type: "metric" as WidgetType,
    /** Widget title */
    title: "Widget",
    /** Widget accent color */
    color: "#8b5cf6",
    /** Widget data (varies by type) */
    data: async.stale<Record<string, unknown>>({}),
  },
  setup({ state, focus }) {
    const dataFocus = focus("data");

    // Async action to refresh widget data
    const refreshQuery = async.action(dataFocus, async (ctx) => {
      // Simulate network delay (random 500ms - 2000ms)
      const delay = 500 + Math.random() * 1500;
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Check if cancelled
      if (ctx.signal.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      // Generate random data based on widget type
      switch (state.type) {
        case "metric":
          return {
            value: Math.floor(Math.random() * 10000),
            label: "Total",
            trend: Math.random() > 0.5 ? "up" : "down",
          };
        case "chart":
          return {
            chartType: "bar",
            data: Array.from({ length: 6 }, () =>
              Math.floor(Math.random() * 100)
            ),
          };
        case "list":
          return {
            items: [
              `Item ${Math.floor(Math.random() * 100)}`,
              `Item ${Math.floor(Math.random() * 100)}`,
              `Item ${Math.floor(Math.random() * 100)}`,
            ],
          };
        case "clock":
          return {
            timezone: "local",
            format: Math.random() > 0.5 ? "24h" : "12h",
          };
        case "weather":
          const conditions = ["sunny", "cloudy", "rainy", "snowy"];
          return {
            city: "San Francisco",
            temp: Math.floor(50 + Math.random() * 40),
            condition:
              conditions[Math.floor(Math.random() * conditions.length)],
          };
        default:
          return {};
      }
    });

    return {
      /** Initialize widget with config */
      init: (config: WidgetConfig) => {
        state.type = config.type;
        state.title = config.title;
        state.color = config.color;
        // Trigger initial data fetch
        refreshQuery.dispatch();
      },

      /** Refresh widget data */
      refresh: refreshQuery.dispatch,

      /** Update widget title */
      setTitle: (title: string) => {
        state.title = title;
      },

      /** Update widget color */
      setColor: (color: string) => {
        state.color = color;
      },
    };
  },
});
