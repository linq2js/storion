# storion

A type-safe store specification library with dependency injection for React.

## Installation

```bash
pnpm add storion
```

## Features

- **Type-safe stores** - Full TypeScript support with inference
- **Dependency injection** - Stores can declare dependencies on other stores
- **Derived (computed) values** - Automatic recomputation when dependencies change
- **Lifetime management** - Control when stores are disposed
- **React integration** - Hooks for consuming stores in React components
- **Middleware support** - Extend store creation with custom logic

## Quick Start

```typescript
import { store, create, useStore } from 'storion';

// Define a store
const counterStore = store({
  name: 'counter',
  state: { count: 0 },
  actions: ({ state }) => ({
    increment: () => { state.count++; },
    decrement: () => { state.count--; },
  }),
});

// Create a container
const container = create();

// Use in React
function Counter() {
  const count = useStore(counterStore, s => s.state.count);
  const { increment, decrement } = useStore(counterStore, s => s.actions);
  
  return (
    <div>
      <button onClick={decrement}>-</button>
      <span>{count}</span>
      <button onClick={increment}>+</button>
    </div>
  );
}
```

## License

MIT

