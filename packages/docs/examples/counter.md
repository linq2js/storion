# Counter Example

The classic counter example to understand the basics.

## Store Definition

```ts
// stores/counterStore.ts
import { store } from 'storion/react';

export const counterStore = store({
  name: 'counter',
  state: {
    count: 0,
    step: 1,
  },
  setup({ state }) {
    return {
      increment: () => {
        state.count += state.step;
      },
      decrement: () => {
        state.count -= state.step;
      },
      setStep: (step: number) => {
        state.step = step;
      },
      reset: () => {
        state.count = 0;
      },
    };
  },
});
```

## Basic Usage

```tsx
// components/Counter.tsx
import { useStore } from 'storion/react';
import { counterStore } from '../stores/counterStore';

export function Counter() {
  const { count, step, increment, decrement, setStep, reset } = useStore(
    ({ get }) => {
      const [state, actions] = get(counterStore);
      return {
        count: state.count,
        step: state.step,
        ...actions,
      };
    }
  );

  return (
    <div className="counter">
      <h1>{count}</h1>
      
      <div className="controls">
        <button onClick={decrement}>-{step}</button>
        <button onClick={increment}>+{step}</button>
      </div>
      
      <div className="step-control">
        <label>Step:</label>
        <input
          type="number"
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
          min={1}
        />
      </div>
      
      <button onClick={reset}>Reset</button>
    </div>
  );
}
```

## App Setup

```tsx
// App.tsx
import { container, StoreProvider } from 'storion/react';
import { Counter } from './components/Counter';

const app = container();

export function App() {
  return (
    <StoreProvider container={app}>
      <Counter />
    </StoreProvider>
  );
}
```

## Single-Store Shorthand

For a standalone counter, use `create()`:

```tsx
import { create } from 'storion/react';

const [counter, useCounter] = create({
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => { state.count++; },
      decrement: () => { state.count--; },
    };
  },
});

function Counter() {
  const { count, increment, decrement } = useCounter((state, actions) => ({
    count: state.count,
    ...actions,
  }));

  return (
    <div>
      <button onClick={decrement}>-</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  );
}

// No StoreProvider needed!
```

## Key Takeaways

1. **Direct mutation** works for top-level properties
2. **useStore** selector determines what triggers re-renders
3. **create()** is a shorthand for single-store apps
4. Actions are stable references (safe for deps arrays)

