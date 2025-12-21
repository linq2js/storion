# Getting Started

## Installation

::: code-group

```bash [npm]
npm install storion
```

```bash [pnpm]
pnpm add storion
```

```bash [yarn]
yarn add storion
```

:::

## Your First Store

### 1. Define a Store

```ts
// stores/counterStore.ts
import { store } from 'storion/react';

export const counterStore = store({
  name: 'counter',
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => { state.count++; },
      decrement: () => { state.count--; },
      reset: () => { state.count = 0; },
    };
  },
});
```

### 2. Create a Container

```tsx
// App.tsx
import { container, StoreProvider } from 'storion/react';

const app = container();

function App() {
  return (
    <StoreProvider container={app}>
      <Counter />
    </StoreProvider>
  );
}
```

### 3. Use the Store

```tsx
// components/Counter.tsx
import { useStore } from 'storion/react';
import { counterStore } from '../stores/counterStore';

function Counter() {
  const { count, increment, decrement } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    return {
      count: state.count,
      increment: actions.increment,
      decrement: actions.decrement,
    };
  });

  return (
    <div>
      <button onClick={decrement}>-</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  );
}
```

## Single-Store Shorthand

For simple apps with a single store, use `create()`:

```tsx
import { create } from 'storion/react';

const [counter, useCounter] = create({
  state: { count: 0 },
  setup({ state }) {
    return {
      increment: () => { state.count++; },
    };
  },
});

function Counter() {
  const { count, increment } = useCounter((state, actions) => ({
    count: state.count,
    increment: actions.increment,
  }));

  return <button onClick={increment}>{count}</button>;
}

// No StoreProvider needed!
```

## What's Next?

- Learn about [Core Concepts](/guide/core-concepts)
- Understand [Stores](/guide/stores) in depth
- Explore [Reactivity](/guide/reactivity)
- Handle [Async State](/guide/async)

