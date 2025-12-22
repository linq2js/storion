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
} from "./components";
import { WithStoreDemo } from "./components/WithStoreDemo";

type Tab =
  | "counter"
  | "focus"
  | "async"
  | "mutations"
  | "network"
  | "selectors"
  | "withStore";

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
    id: "withStore",
    label: "withStore",
    icon: "🧩",
    description: "Automatic memoization for hooks + render",
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

      {/* Navigation */}
      <nav className="border-b border-zinc-800 bg-zinc-900/30">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex gap-1 -mb-px overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? "border-purple-500 text-purple-400"
                    : "border-transparent text-zinc-500 hover:text-zinc-300"
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Tab Header */}
        <div className="mb-8">
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
          {activeTab === "async" && <AsyncDemo />}
          {activeTab === "mutations" && <MutationDemo />}
          {activeTab === "network" && <NetworkDemo />}
          {activeTab === "selectors" && <TodoDemo />}
          {activeTab === "withStore" && <WithStoreDemo />}
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
