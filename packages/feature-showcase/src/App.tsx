/**
 * Feature Showcase App
 * Demonstrates all Storion features in an interactive UI
 */
import { memo, useState } from "react";
import {
  CounterDemo,
  FocusDemo,
  AsyncDemo,
  TodoDemo,
  MutationDemo,
  NetworkDemo,
  AbortableDemo,
  ListDemo,
  MixinDemo,
} from "./components";
import { WithStoreDemo } from "./components/WithStoreDemo";

type Tab =
  | "counter"
  | "focus"
  | "list"
  | "async"
  | "mutations"
  | "network"
  | "selectors"
  | "mixins"
  | "withStore"
  | "abortable";

const tabs: { id: Tab; label: string; icon: string; description: string }[] = [
  {
    id: "counter",
    label: "Counter",
    icon: "🔢",
    description: "Basic store with state and actions",
  },
  {
    id: "focus",
    label: "Focus API",
    icon: "🔍",
    description: "Lens-like state access with getters/setters",
  },
  {
    id: "list",
    label: "List Helper",
    icon: "📋",
    description: "Array manipulation with drag-and-drop Kanban board",
  },
  {
    id: "async",
    label: "Async Actions",
    icon: "⚡",
    description: "Async operations with loading, error, and retry",
  },
  {
    id: "mutations",
    label: "Mutations",
    icon: "📝",
    description: "Component-local async state for forms and mutations",
  },
  {
    id: "network",
    label: "Network",
    icon: "🌐",
    description: "Network connectivity state and network-aware retry",
  },
  {
    id: "selectors",
    label: "Selectors",
    icon: "🎯",
    description: "Computed values and cross-store composition",
  },
  {
    id: "mixins",
    label: "Mixins",
    icon: "🔀",
    description: "useStore with array and object mixin syntax",
  },
  {
    id: "withStore",
    label: "withStore",
    icon: "🧩",
    description: "Automatic memoization for hooks + render",
  },
  {
    id: "abortable",
    label: "Abortable",
    icon: "⏯️",
    description: "Pause/resume, events, and workflow orchestration",
  },
];

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>("counter");

  const currentTab = tabs.find((t) => t.id === activeTab)!;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xl">
              ⚡
            </div>
            <div>
              <h1 className="text-xl font-bold">Storion Feature Showcase</h1>
              <p className="text-sm text-zinc-500">
                Explore all features with interactive demos
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Navigation Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3 py-2 rounded-xl border text-left transition-all flex items-center gap-2 ${
                activeTab === tab.id
                  ? "bg-purple-500/20 border-purple-500/50 text-purple-300"
                  : "bg-zinc-800/30 border-zinc-700/50 text-zinc-400 hover:bg-zinc-800/50 hover:border-zinc-600"
              }`}
            >
              <span className="text-lg">{tab.icon}</span>
              <span className="text-sm font-medium truncate">{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Header */}
        <div className="mb-6">
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <span>{currentTab.icon}</span>
            {currentTab.label}
          </h2>
          <p className="text-zinc-500 mt-1">{currentTab.description}</p>
        </div>

        {/* Tab Content */}
        <div className="bg-zinc-900/50 rounded-2xl border border-zinc-800 p-6 animate-fade-in">
          {activeTab === "counter" && <CounterDemo />}
          {activeTab === "focus" && <FocusDemo />}
          {activeTab === "list" && <ListDemo />}
          {activeTab === "async" && <AsyncDemo />}
          {activeTab === "mutations" && <MutationDemo />}
          {activeTab === "network" && <NetworkDemo />}
          {activeTab === "selectors" && <TodoDemo />}
          {activeTab === "mixins" && <MixinDemo />}
          {activeTab === "withStore" && <WithStoreDemo />}
          {activeTab === "abortable" && <AbortableDemo />}
        </div>

        {/* Feature Info */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <FeatureCard
            title="Type-Safe"
            description="Full TypeScript support with inferred types for state, actions, and selectors."
            icon="📝"
          />
          <FeatureCard
            title="Auto-Tracked"
            description="Fine-grained reactivity with automatic dependency tracking."
            icon="🎯"
          />
          <FeatureCard
            title="DevTools"
            description="Built-in devtools panel for debugging state changes and history."
            icon="🔧"
          />
          <FeatureCard
            title="Composable"
            description="Selectors and stores can be composed for complex state logic."
            icon="🧩"
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-12">
        <div className="max-w-5xl mx-auto px-6 py-6 text-center text-sm text-zinc-500">
          <p>
            Open the DevTools panel on the left to inspect store state and
            history
          </p>
          <p className="mt-1">
            Built with{" "}
            <a
              href="https://github.com/linq2js/storion"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:underline"
            >
              Storion
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

const FeatureCard = memo(function FeatureCard({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="bg-zinc-800/30 rounded-xl p-4 border border-zinc-700/50">
      <div className="flex items-start gap-3">
        <span className="text-xl">{icon}</span>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-zinc-500 mt-1">{description}</p>
        </div>
      </div>
    </div>
  );
});
