/**
 * Counter Demo Component
 * Demonstrates basic store usage with actions
 */
import { memo } from "react";
import { useStore } from "storion/react";
import { counterStore } from "../stores";

export const CounterDemo = memo(function CounterDemo() {
  // Read specific values inside selector for proper tracking
  const { count, step, history, actions } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    return {
      count: state.count,
      step: state.step,
      history: state.history,
      actions,
    };
  });

  return (
    <div className="space-y-6">
      {/* Counter Display */}
      <div className="flex items-center justify-center gap-8">
        <button
          onClick={actions.decrement}
          className="w-14 h-14 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-2xl font-bold transition-colors"
        >
          −
        </button>
        <div className="text-center">
          <div className="text-6xl font-bold tabular-nums text-purple-400">
            {count}
          </div>
          <div className="text-sm text-zinc-500 mt-1">Step: {step}</div>
        </div>
        <button
          onClick={actions.increment}
          className="w-14 h-14 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-2xl font-bold transition-colors"
        >
          +
        </button>
      </div>

      {/* Step Control */}
      <div className="flex items-center justify-center gap-3">
        <span className="text-sm text-zinc-400">Step:</span>
        {[1, 5, 10].map((s) => (
          <button
            key={s}
            onClick={() => actions.setStep(s)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              step === s
                ? "bg-purple-600 text-white"
                : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={actions.undo}
          disabled={history.length === 0}
          className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          ↩ Undo
        </button>
        <button
          onClick={actions.reset}
          className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* History */}
      {history.length > 0 && (
        <div className="text-center">
          <span className="text-xs text-zinc-500">
            History: [{history.slice(-5).join(", ")}
            {history.length > 5 ? "..." : ""}]
          </span>
        </div>
      )}
    </div>
  );
});
