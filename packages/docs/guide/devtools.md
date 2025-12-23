# DevTools

Storion includes a built-in devtools system for debugging stores, tracking state changes, and time-travel debugging.

## Quick Start

```ts
import { container } from 'storion';
import { devtoolsMiddleware } from 'storion/devtools';

const app = container({
  middleware: [
    devtoolsMiddleware(),
  ],
});
```

The devtools are automatically exposed at `window.__STORION_DEVTOOLS__`.

## Features

- **Store Inspector** — View all registered stores and their current state
- **State History** — Track state changes over time
- **Time Travel** — Revert to previous states
- **Action Tracking** — See which actions triggered state changes
- **Snapshots** — Take and restore state snapshots

## Configuration

```ts
devtoolsMiddleware({
  // Maximum number of state changes to keep in history
  maxHistory: 50,
  
  // Custom window object (for SSR or testing)
  windowObject: window,
});
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxHistory` | `number` | `5` | Max history entries per store |
| `windowObject` | `Window` | `window` | Window object for global access |

## DevTools API

Access the devtools controller:

```ts
const devtools = window.__STORION_DEVTOOLS__;
```

### Available Methods

```ts
interface DevtoolsController {
  // Get all registered stores
  getStores(): StoreEntry[];
  
  // Get store by ID
  getStore(id: string): StoreEntry | undefined;
  
  // Get state history for a store
  getHistory(id: string): StateHistoryEntry[];
  
  // Subscribe to devtools events
  subscribe(listener: (event: DevtoolsEvent) => void): () => void;
  
  // Revert store to previous state
  revertState(storeId: string, historyIndex: number): void;
  
  // Take snapshot of a store
  takeSnapshot(storeId: string): void;
}
```

### Store Entry

```ts
interface StoreEntry {
  id: string;
  name: string;
  state: Record<string, unknown>;
  disposed: boolean;
  createdAt: number;
  instance: StoreInstance;
}
```

### History Entry

```ts
interface StateHistoryEntry {
  state: Record<string, unknown>;
  timestamp: number;
  action?: string;
  actionArgs?: unknown[];
}
```

## Using the DevTools

### Inspect Stores

```ts
const devtools = window.__STORION_DEVTOOLS__;

// List all stores
const stores = devtools.getStores();
stores.forEach(store => {
  console.log(`${store.name}:`, store.state);
});

// Get specific store
const userStore = devtools.getStore('user-store-1');
console.log(userStore?.state);
```

### View History

```ts
// Get state history for a store
const history = devtools.getHistory('user-store-1');

history.forEach((entry, index) => {
  console.log(`[${index}] ${entry.action || 'initial'}:`, entry.state);
});
```

### Time Travel

```ts
// Revert to a previous state
devtools.revertState('user-store-1', 2); // Revert to index 2

// This triggers a state update in the store
```

### Subscribe to Events

```ts
const unsubscribe = devtools.subscribe((event) => {
  switch (event.type) {
    case 'store:registered':
      console.log('New store:', event.store.name);
      break;
    case 'store:unregistered':
      console.log('Store removed:', event.storeId);
      break;
    case 'state:changed':
      console.log('State changed:', event.storeId, event.state);
      break;
  }
});

// Later: cleanup
unsubscribe();
```

## DevTools Panel

Storion provides an optional in-browser devtools panel:

```ts
import { mountDevtoolsPanel } from 'storion/devtools-panel';

// Mount the panel
mountDevtoolsPanel();

// Or mount to specific container
mountDevtoolsPanel({
  container: document.getElementById('devtools'),
});
```

### Panel Features

- **Stores Tab** — Browse all stores and their state
- **Events Tab** — View action dispatch history
- **Compare Modal** — Diff state between history entries
- **State Revert** — Click to restore previous states

## Integration Examples

### Development Only

```ts
import { container } from 'storion';
import { devtoolsMiddleware } from 'storion/devtools';

const middleware = [];

if (process.env.NODE_ENV === 'development') {
  middleware.push(devtoolsMiddleware({ maxHistory: 50 }));
}

const app = container({ middleware });
```

### With React

```tsx
import { useEffect } from 'react';
import { mountDevtoolsPanel } from 'storion/devtools-panel';

function App() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      mountDevtoolsPanel();
    }
  }, []);
  
  return <MyApp />;
}
```

### Custom DevTools UI

```tsx
import { useState, useEffect } from 'react';

function CustomDevtools() {
  const [stores, setStores] = useState([]);
  
  useEffect(() => {
    const devtools = window.__STORION_DEVTOOLS__;
    if (!devtools) return;
    
    // Initial load
    setStores(devtools.getStores());
    
    // Subscribe to changes
    return devtools.subscribe((event) => {
      setStores(devtools.getStores());
    });
  }, []);
  
  return (
    <div>
      <h2>Stores</h2>
      {stores.map(store => (
        <div key={store.id}>
          <h3>{store.name}</h3>
          <pre>{JSON.stringify(store.state, null, 2)}</pre>
        </div>
      ))}
    </div>
  );
}
```

## Injected Actions

The devtools middleware injects special actions into each store:

### __revertState

Revert the store to a specific state:

```ts
const instance = app.get(userStore);

// Access the injected action
instance.actions.__revertState({ name: 'Old Name', age: 25 });
```

### __takeSnapshot

Manually trigger a snapshot (for history):

```ts
instance.actions.__takeSnapshot();
```

::: warning Internal Actions
Actions prefixed with `__` are internal and not tracked in action history.
:::

## Meta Integration

Use meta to customize devtools behavior:

```ts
import { meta, store } from 'storion';

const devtools = meta<{ hidden?: boolean; label?: string }>();

const userStore = store({
  name: 'user',
  state: { name: '', _internal: '' },
  meta: [
    devtools({ label: 'User Profile' }),
    devtools.for('_internal', { hidden: true }),
  ],
  setup: /* ... */,
});
```

## Debugging Tips

### 1. Track Specific Actions

```ts
const devtools = window.__STORION_DEVTOOLS__;

devtools.subscribe((event) => {
  if (event.type === 'state:changed' && event.action === 'setUser') {
    console.log('User updated:', event.state);
  }
});
```

### 2. Compare States

```ts
const history = devtools.getHistory('user-store-1');

if (history.length >= 2) {
  const prev = history[history.length - 2].state;
  const curr = history[history.length - 1].state;
  
  // Find what changed
  for (const key of Object.keys(curr)) {
    if (prev[key] !== curr[key]) {
      console.log(`Changed: ${key}`, prev[key], '→', curr[key]);
    }
  }
}
```

### 3. Export/Import State

```ts
// Export current state
const stores = devtools.getStores();
const snapshot = stores.map(s => ({ name: s.name, state: s.state }));
localStorage.setItem('debug-snapshot', JSON.stringify(snapshot));

// Import state
const saved = JSON.parse(localStorage.getItem('debug-snapshot') || '[]');
saved.forEach(({ name, state }) => {
  const store = stores.find(s => s.name === name);
  store?.instance.actions.__revertState(state);
});
```

## Performance Considerations

- **History Size** — Keep `maxHistory` low in development (5-50)
- **Large States** — History stores full state copies; large states increase memory
- **Production** — Disable devtools in production builds
- **Selective Tracking** — Use `applyFor` to only track specific stores

```ts
import { applyFor } from 'storion';
import { devtoolsMiddleware } from 'storion/devtools';

const app = container({
  middleware: [
    // Only track stores ending with 'Store'
    applyFor('*Store', devtoolsMiddleware()),
  ],
});
```

## Troubleshooting

### DevTools Not Appearing

1. Check middleware is added:
   ```ts
   container({ middleware: [devtoolsMiddleware()] })
   ```

2. Check global variable:
   ```ts
   console.log(window.__STORION_DEVTOOLS__);
   ```

3. Ensure stores are created after middleware setup

### History Not Updating

- State changes must go through actions
- Direct state mutations outside actions won't trigger history

### Memory Issues

- Reduce `maxHistory` value
- Disable devtools for large stores
- Use `applyExcept` to exclude cache stores

## Next Steps

- **[Middleware](/guide/middleware)** — Creating custom middleware
- **[Meta System](/guide/meta)** — Configuring stores with meta
- **[Persistence](/guide/persistence)** — Saving and loading state

