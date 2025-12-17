import React, { useRef } from "react";
import { withStore } from "storion/react";
import { counterStore } from "../stores/counterStore";

/**
 * Demo: withStore pattern for automatic memoization
 *
 * Benefits:
 * - Separates hook logic from rendering
 * - Automatically memoizes render function
 * - Supports both direct and HOC usage
 * - Auto-detects ref support based on function arity
 */

// Example 1: Direct usage - no ref
const CounterDisplay = withStore(
  (ctx) => {
    const [counter] = ctx.get(counterStore);
    return {
      count: counter.count,
      step: counter.step,
    };
  },
  ({ count, step }: { count: number; step: number }) => (
    <div className="space-y-2">
      <div className="text-lg">
        Count: <span className="font-bold">{count}</span>
      </div>
      <div className="text-sm text-gray-600">Step: {step}</div>
    </div>
  )
);

// Example 2: Direct usage - with ref (auto-detected by 2 params)
const CounterInput = withStore(
  (ctx) => {
    const [counter] = ctx.get(counterStore);
    return { value: counter.count };
  },
  ({ value }: { value: number }, ref: React.Ref<HTMLInputElement>) => (
    <input
      ref={ref}
      type="number"
      value={value}
      readOnly
      className="w-24 px-3 py-2 border border-gray-300 rounded-md"
    />
  )
);

// Example 3: HOC usage - normal component
const withCounterData = withStore((ctx) => {
  const [counter, actions] = ctx.get(counterStore);
  return {
    count: counter.count,
    step: counter.step,
    increment: actions.increment,
    decrement: actions.decrement,
  };
});

// Simple component to be wrapped - no memo needed, withStore handles it
function CounterControlsBase({
  count,
  step,
  increment,
  decrement,
}: {
  count: number;
  step: number;
  increment: () => void;
  decrement: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="text-xl font-bold">Count: {count}</div>
      <div className="flex gap-2">
        <button
          onClick={decrement}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          - {step}
        </button>
        <button
          onClick={increment}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          + {step}
        </button>
      </div>
    </div>
  );
}

const ConnectedControls = withCounterData(CounterControlsBase);

// Example 4: HOC usage - with forwardRef
const withCounterValue = withStore((ctx) => {
  const [counter, actions] = ctx.get(counterStore);
  return {
    value: counter.count,
    onChange: (value: number) => actions.setCount(value),
  };
});

// ForwardRef component to be wrapped
const CounterInputBase = React.forwardRef<
  HTMLInputElement,
  { value: number; onChange: (value: number) => void }
>(({ value, onChange }, ref) => (
  <input
    ref={ref}
    type="number"
    value={value}
    onChange={(e) => onChange(parseInt(e.target.value) || 0)}
    className="w-32 px-3 py-2 border border-gray-300 rounded-md"
  />
));
CounterInputBase.displayName = "CounterInputBase";

// Type assertion to work around React type version mismatch
const ConnectedInput = withCounterValue(CounterInputBase as any) as React.ForwardRefExoticComponent<
  React.RefAttributes<HTMLInputElement>
>;

// Main demo component
export const WithStoreDemo = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const connectedInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="p-6 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4">withStore Pattern Demo</h2>
        <p className="text-gray-600 mb-6">
          Demonstrates automatic memoization by separating hooks from rendering.
        </p>
      </div>

      <div className="space-y-6">
        {/* Example 1: Direct - no ref */}
        <div className="p-4 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">
            1. Direct Mode (no ref)
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Hook + render function, automatically memoized
          </p>
          <CounterDisplay />
        </div>

        {/* Example 2: Direct - with ref */}
        <div className="p-4 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">
            2. Direct Mode (with ref)
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Auto-detected ref support by function arity (2 params)
          </p>
          <div className="flex gap-2 items-center">
            <CounterInput ref={inputRef} />
            <button
              onClick={() => inputRef.current?.focus()}
              className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Focus Input
            </button>
          </div>
        </div>

        {/* Example 3: HOC - normal component */}
        <div className="p-4 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">3. HOC Mode (no ref)</h3>
          <p className="text-sm text-gray-600 mb-3">
            Higher-order component pattern
          </p>
          <ConnectedControls />
        </div>

        {/* Example 4: HOC - with ref */}
        <div className="p-4 border border-gray-200 rounded-lg">
          <h3 className="text-lg font-semibold mb-2">
            4. HOC Mode (with ref)
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Component with ref forwarding
          </p>
          <div className="flex gap-2 items-center">
            <ConnectedInput ref={connectedInputRef} />
            <button
              onClick={() => connectedInputRef.current?.focus()}
              className="px-3 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
            >
              Focus
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h4 className="font-semibold text-blue-900 mb-2">Key Benefits:</h4>
        <ul className="list-disc list-inside text-sm text-blue-800 space-y-1">
          <li>Automatic render memoization - no manual memo() needed</li>
          <li>Clean separation of hook logic and JSX</li>
          <li>Auto-detects ref support (2+ params = ref forwarding)</li>
          <li>Works with both direct and HOC patterns</li>
          <li>Type-safe props transformation</li>
        </ul>
      </div>
    </div>
  );
};
