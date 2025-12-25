import { store } from "storion/react";
import {
  widgetStore,
  type WidgetType,
  type WidgetConfig,
  WidgetInstance,
} from "./widgetStore";

// =============================================================================
// TYPES
// =============================================================================

// =============================================================================
// DASHBOARD STORE
// =============================================================================

export { type WidgetInstance };

export const dashboardStore = store({
  name: "dashboard",
  state: {
    /** All widget instances keyed by ID */
    widgets: {} as Record<string, WidgetInstance>,
    /** Currently selected widget for editing */
    selectedWidgetId: null as string | null,
    /** Edit mode toggle */
    isEditing: false,
  },
  setup({ state, update, create }) {
    // Widget templates
    const widgetTemplates: Record<WidgetType, Omit<WidgetConfig, "type">> = {
      metric: { title: "Metric", color: "#8b5cf6" },
      chart: { title: "Chart", color: "#06b6d4" },
      list: { title: "Recent Items", color: "#f59e0b" },
      clock: { title: "Clock", color: "#ec4899" },
      weather: { title: "Weather", color: "#10b981" },
    };

    return {
      // ===== Widget CRUD =====

      /** Add a new widget */
      addWidget: (type: WidgetType) => {
        const id = crypto.randomUUID();
        const template = widgetTemplates[type];

        // Create child store instance
        const instance = create(widgetStore);

        // Initialize with config
        instance.actions.init({ type, ...template });

        // Add to widgets map
        update((draft) => {
          draft.widgets[id] = instance;
        });
        return id;
      },

      /** Remove a widget */
      removeWidget: (id: string) => {
        const instance = state.widgets[id];
        if (instance) {
          instance.dispose();
        }
        update((draft) => {
          delete draft.widgets[id];
          if (draft.selectedWidgetId === id) {
            draft.selectedWidgetId = null;
          }
        });
      },

      /** Duplicate a widget */
      duplicateWidget: (id: string) => {
        const original = state.widgets[id];
        if (original) {
          const newId = crypto.randomUUID();

          // Create new child store
          const instance = create(widgetStore);
          instance.actions.init({
            type: original.state.type,
            title: `${original.state.title} (copy)`,
            color: original.state.color,
          });

          update((draft) => {
            draft.widgets[newId] = instance;
          });
          return newId;
        }
        return null;
      },

      // ===== Selection =====

      /** Select a widget for editing */
      selectWidget: (id: string | null) => {
        state.selectedWidgetId = id;
      },

      /** Get selected widget instance */
      getSelectedWidget: (): WidgetInstance | undefined => {
        return state.selectedWidgetId
          ? state.widgets[state.selectedWidgetId]
          : undefined;
      },

      // ===== Edit Mode =====

      /** Toggle edit mode */
      toggleEditing: () => {
        state.isEditing = !state.isEditing;
        if (!state.isEditing) {
          state.selectedWidgetId = null;
        }
      },

      // ===== Getters =====

      /** Get all widget instances */
      getWidgets: (): Array<{ id: string; instance: WidgetInstance }> => {
        return Object.entries(state.widgets).map(([id, instance]) => ({
          id,
          instance,
        }));
      },

      /** Get widget by ID */
      getWidget: (id: string): WidgetInstance | undefined => state.widgets[id],

      /** Get widget count */
      getWidgetCount: () => Object.keys(state.widgets).length,

      /** Clear all widgets */
      clearAll: () => {
        // Dispose all widgets
        for (const instance of Object.values(state.widgets)) {
          instance.dispose();
        }
        update((draft) => {
          draft.widgets = {};
          draft.selectedWidgetId = null;
        });
      },

      /** Refresh all widgets */
      refreshAll: () => {
        for (const instance of Object.values(state.widgets)) {
          instance.actions.refresh();
        }
      },
    };
  },
});

// Re-export types
export type { WidgetType, WidgetConfig } from "./widgetStore";
