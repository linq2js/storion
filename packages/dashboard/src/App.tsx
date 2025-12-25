import { useStore } from "storion/react";
import {
  dashboardStore,
  type WidgetInstance,
  type WidgetType,
} from "./stores/dashboardStore";
import { useState, useEffect } from "react";

// =============================================================================
// HEADER
// =============================================================================

function Header() {
  const { widgetCount, isEditing, toggleEditing, clearAll, refreshAll } =
    useStore(({ get }) => {
      const [state, actions] = get(dashboardStore);
      return {
        widgetCount: actions.getWidgetCount(),
        isEditing: state.isEditing,
        toggleEditing: actions.toggleEditing,
        clearAll: actions.clearAll,
        refreshAll: actions.refreshAll,
      };
    });

  return (
    <header className="flex items-center justify-between mb-8">
      <div>
        <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
          Widget Dashboard
        </h1>
        <p className="text-slate-400 mt-1">
          Each widget is an isolated store using{" "}
          <code className="text-violet-400">create()</code> •{" "}
          {widgetCount} widget{widgetCount !== 1 ? "s" : ""}
        </p>
      </div>
      <div className="flex gap-3">
        {widgetCount > 0 && (
          <>
            <button
              onClick={refreshAll}
              className="px-4 py-2 text-slate-300 hover:text-violet-400 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Refresh All
            </button>
            <button
              onClick={clearAll}
              className="px-4 py-2 text-slate-400 hover:text-red-400 transition-colors"
            >
              Clear All
            </button>
          </>
        )}
        <button
          onClick={toggleEditing}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            isEditing
              ? "bg-violet-600 text-white"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
          }`}
        >
          {isEditing ? "Done Editing" : "Edit Dashboard"}
        </button>
      </div>
    </header>
  );
}

// =============================================================================
// ADD WIDGET PANEL
// =============================================================================

function AddWidgetPanel() {
  const { addWidget, isEditing } = useStore(({ get }) => {
    const [state, actions] = get(dashboardStore);
    return {
      addWidget: actions.addWidget,
      isEditing: state.isEditing,
    };
  });

  if (!isEditing) return null;

  const widgetTypes: { type: WidgetType; icon: string; label: string }[] = [
    { type: "metric", icon: "📊", label: "Metric" },
    { type: "chart", icon: "📈", label: "Chart" },
    { type: "list", icon: "📝", label: "List" },
    { type: "clock", icon: "🕐", label: "Clock" },
    { type: "weather", icon: "🌤️", label: "Weather" },
  ];

  return (
    <div className="mb-6 p-4 bg-slate-800/30 border border-dashed border-violet-500/30 rounded-xl">
      <p className="text-sm text-slate-400 mb-3">Add a widget:</p>
      <div className="flex flex-wrap gap-2">
        {widgetTypes.map(({ type, icon, label }) => (
          <button
            key={type}
            onClick={() => addWidget(type)}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-violet-600/20 border border-slate-700 hover:border-violet-500/50 rounded-lg transition-all"
          >
            <span>{icon}</span>
            <span className="text-sm">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// WIDGET CONTENT COMPONENTS
// =============================================================================

function MetricContent({ data }: { data: Record<string, unknown> }) {
  const value = (data.value as number) ?? 0;
  const label = (data.label as string) ?? "Total";
  const trend = (data.trend as string) ?? "up";

  return (
    <div className="text-center py-4">
      <p className="text-4xl font-bold text-white mb-2">
        {value.toLocaleString()}
      </p>
      <p className="text-slate-400 flex items-center justify-center gap-1">
        {label}
        <span className={trend === "up" ? "text-green-400" : "text-red-400"}>
          {trend === "up" ? "↑" : "↓"}
        </span>
      </p>
    </div>
  );
}

function ChartContent({ data }: { data: Record<string, unknown> }) {
  const chartData = (data.data as number[]) ?? [40, 65, 45, 80, 55, 70];
  const max = Math.max(...chartData);

  return (
    <div className="flex items-end justify-around h-32 gap-1 px-2">
      {chartData.map((value, i) => (
        <div
          key={i}
          className="flex-1 bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-t transition-all duration-500"
          style={{
            height: `${(value / max) * 100}%`,
            opacity: 0.8 + (i / chartData.length) * 0.2,
          }}
        />
      ))}
    </div>
  );
}

function ListContent({ data }: { data: Record<string, unknown> }) {
  const items = (data.items as string[]) ?? ["Item 1", "Item 2", "Item 3"];

  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li
          key={i}
          className="flex items-center gap-2 text-sm text-slate-300 py-1 border-b border-slate-700/50 last:border-0"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function ClockContent({ data }: { data: Record<string, unknown> }) {
  const [time, setTime] = useState(new Date());
  const format = (data.format as string) ?? "24h";

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = format === "24h" ? time.getHours() : time.getHours() % 12 || 12;
  const minutes = time.getMinutes().toString().padStart(2, "0");
  const seconds = time.getSeconds().toString().padStart(2, "0");

  return (
    <div className="text-center py-4">
      <p className="text-4xl font-mono font-bold text-white">
        {hours}:{minutes}
        <span className="text-2xl text-pink-400">:{seconds}</span>
      </p>
      <p className="text-slate-400 mt-2">
        {time.toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
        })}
      </p>
    </div>
  );
}

function WeatherContent({ data }: { data: Record<string, unknown> }) {
  const city = (data.city as string) ?? "San Francisco";
  const temp = (data.temp as number) ?? 72;
  const condition = (data.condition as string) ?? "sunny";

  const icons: Record<string, string> = {
    sunny: "☀️",
    cloudy: "☁️",
    rainy: "🌧️",
    snowy: "❄️",
  };

  return (
    <div className="text-center py-2">
      <p className="text-5xl mb-2">{icons[condition] || "🌤️"}</p>
      <p className="text-3xl font-bold text-white">{temp}°F</p>
      <p className="text-slate-400">{city}</p>
    </div>
  );
}

// =============================================================================
// WIDGET CARD
// =============================================================================

function WidgetCard({
  id,
  instance,
}: {
  id: string;
  instance: WidgetInstance;
}) {
  // Get widget state from its own store instance
  const { type, title, color, data, status, refresh } = useStore(() => {
    return {
      type: instance.state.type,
      title: instance.state.title,
      color: instance.state.color,
      data: instance.state.data.data ?? {},
      status: instance.state.data.status,
      refresh: instance.actions.refresh,
    };
  });

  // Get dashboard state for editing
  const { isEditing, selectedWidgetId, selectWidget, removeWidget, duplicateWidget } =
    useStore(({ get }) => {
      const [state, actions] = get(dashboardStore);
      return {
        isEditing: state.isEditing,
        selectedWidgetId: state.selectedWidgetId,
        selectWidget: actions.selectWidget,
        removeWidget: actions.removeWidget,
        duplicateWidget: actions.duplicateWidget,
      };
    });

  const isSelected = selectedWidgetId === id;
  const isPending = status === "pending";

  const renderContent = () => {
    switch (type) {
      case "metric":
        return <MetricContent data={data} />;
      case "chart":
        return <ChartContent data={data} />;
      case "list":
        return <ListContent data={data} />;
      case "clock":
        return <ClockContent data={data} />;
      case "weather":
        return <WeatherContent data={data} />;
      default:
        return null;
    }
  };

  return (
    <div
      className={`widget-enter relative bg-slate-900/50 backdrop-blur-sm rounded-xl border transition-all overflow-hidden ${
        isSelected
          ? "border-violet-500 ring-2 ring-violet-500/20"
          : "border-slate-700/50 hover:border-slate-600"
      }`}
      onClick={() => isEditing && selectWidget(id)}
    >
      {/* Color accent bar */}
      <div className="h-1 relative" style={{ backgroundColor: color }}>
        {isPending && (
          <div
            className="absolute inset-0 bg-white/30 animate-pulse"
            style={{ animation: "pulse 1s ease-in-out infinite" }}
          />
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <h3 className="font-medium text-white flex items-center gap-2">
          {title}
          {isPending && (
            <svg
              className="w-4 h-4 animate-spin text-violet-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          )}
        </h3>
        <div className="flex gap-1">
          {/* Refresh button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              refresh();
            }}
            disabled={isPending}
            className={`p-1 transition-colors ${
              isPending
                ? "text-slate-600 cursor-not-allowed"
                : "text-slate-400 hover:text-violet-400"
            }`}
            title="Refresh"
          >
            <svg
              className={`w-4 h-4 ${isPending ? "animate-spin" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
          {isEditing && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  duplicateWidget(id);
                }}
                className="p-1 text-slate-400 hover:text-violet-400 transition-colors"
                title="Duplicate"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeWidget(id);
                }}
                className="p-1 text-slate-400 hover:text-red-400 transition-colors"
                title="Remove"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div className={`p-4 ${isPending ? "opacity-50" : ""}`}>
        {renderContent()}
      </div>
    </div>
  );
}

// =============================================================================
// WIDGET EDITOR
// =============================================================================

function WidgetEditor() {
  const { selectedWidget, isEditing, selectWidget } = useStore(({ get }) => {
    const [state, actions] = get(dashboardStore);
    return {
      selectedWidget: actions.getSelectedWidget(),
      isEditing: state.isEditing,
      selectWidget: actions.selectWidget,
    };
  });

  // Get selected widget's state and actions
  const widgetData = useStore(() => {
    if (!selectedWidget) {
      return {
        title: "",
        color: "",
        setTitle: (_: string) => {},
        setColor: (_: string) => {},
      };
    }
    return {
      title: selectedWidget.state.title,
      color: selectedWidget.state.color,
      setTitle: selectedWidget.actions.setTitle,
      setColor: selectedWidget.actions.setColor,
    };
  });

  if (!isEditing || !selectedWidget) return null;

  const colors = [
    "#8b5cf6",
    "#06b6d4",
    "#f59e0b",
    "#ec4899",
    "#10b981",
    "#ef4444",
    "#3b82f6",
  ];

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-xl p-4 shadow-2xl min-w-80 animate-slide-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-white">Edit Widget</h3>
        <button
          onClick={() => selectWidget(null)}
          className="text-slate-400 hover:text-white"
        >
          ×
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1">Title</label>
          <input
            type="text"
            value={widgetData.title}
            onChange={(e) => widgetData.setTitle(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-2">Color</label>
          <div className="flex gap-2">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => widgetData.setColor(color)}
                className={`w-8 h-8 rounded-full transition-transform ${
                  widgetData.color === color
                    ? "scale-110 ring-2 ring-white/50"
                    : ""
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// WIDGET GRID
// =============================================================================

function WidgetGrid() {
  const { widgets } = useStore(({ get }) => {
    const [, actions] = get(dashboardStore);
    return { widgets: actions.getWidgets() };
  });

  if (widgets.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-6xl mb-4 animate-pulse-slow">📊</div>
        <h2 className="text-xl font-medium text-white mb-2">No widgets yet</h2>
        <p className="text-slate-400">
          Click "Edit Dashboard" to start adding widgets
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {widgets.map(({ id, instance }) => (
        <WidgetCard key={id} id={id} instance={instance} />
      ))}
    </div>
  );
}

// =============================================================================
// APP
// =============================================================================

export default function App() {
  return (
    <div className="min-h-screen grid-pattern">
      <div className="max-w-7xl mx-auto p-8">
        <Header />
        <AddWidgetPanel />
        <WidgetGrid />
        <WidgetEditor />

        <footer className="mt-12 text-center text-slate-500 text-sm">
          <p>
            This demo showcases Storion's{" "}
            <code className="text-violet-400">create()</code> for isolated child
            stores and <code className="text-violet-400">map()</code> with{" "}
            <code className="text-violet-400">autoDispose</code>.
          </p>
          <a
            href="/storion/guide/dynamic-stores.html"
            className="text-violet-400 hover:text-violet-300"
          >
            Learn more →
          </a>
        </footer>
      </div>
    </div>
  );
}
