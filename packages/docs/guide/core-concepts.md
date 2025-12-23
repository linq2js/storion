# Core Concepts

Storion is built on four core concepts that work together: **Stores**, **Containers**, **Services**, and **Reactivity**. Understanding how they interact is key to using Storion effectively.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        Container                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  userStore  │  │  cartStore  │  │  uiStore    │          │
│  │  [state]    │  │  [state]    │  │  [state]    │          │
│  │  [actions]  │←─│  [actions]  │  │  [actions]  │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│         ↓                                                    │
│  ┌─────────────┐  ┌─────────────┐                           │
│  │  apiService │  │ logService  │   ← Services               │
│  └─────────────┘  └─────────────┘                           │
└─────────────────────────────────────────────────────────────┘
         ↑
    Components subscribe to stores via useStore()
```

## Stores

A **store** is a self-contained unit of state and the logic to modify it. Think of it as a "smart model" that knows how to update itself.

### Why Stores?

Without stores, state management often becomes fragmented:

```tsx
// ❌ Scattered state across components
function App() {
  const [user, setUser] = useState(null);
  const [cart, setCart] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // Logic mixed with UI
  const addToCart = async (item) => {
    setLoading(true);
    await api.addToCart(user.id, item);
    setCart([...cart, item]);
    setLoading(false);
  };
  
  // Must pass everything down...
  return <ProductList user={user} cart={cart} addToCart={addToCart} />;
}
```

Stores co-locate state with behavior:

```ts
// ✅ Self-contained store
const cartStore = store({
  name: 'cart',
  state: { items: [], loading: false },
  setup({ state, get }) {
    const [userState] = get(userStore);
    const api = get(apiService);
    
    return {
      addItem: async (item) => {
        state.loading = true;
        await api.addToCart(userState.id, item);
        state.items.push(item);
        state.loading = false;
      },
    };
  },
});

// Components just use it
function ProductList() {
  const { addItem } = useStore(({ get }) => {
    const [, actions] = get(cartStore);
    return { addItem: actions.addItem };
  });
}
```

### Anatomy of a Store

```ts
const userStore = store({
  // 1. Identity (for debugging)
  name: 'user',
  
  // 2. Initial state
  state: {
    profile: { name: '', email: '' },
    preferences: { theme: 'light' },
    isLoggedIn: false,
  },
  
  // 3. Setup function - runs once when store is created
  setup({ state, update, get, focus, onDispose }) {
    // Access other stores/services
    const api = get(apiService);
    const logger = get(loggerService);
    
    // Set up side effects
    const unsubscribe = authEvents.on('logout', () => {
      state.isLoggedIn = false;
    });
    onDispose(() => unsubscribe());
    
    // Return actions
    return {
      login: async (credentials) => {
        const user = await api.login(credentials);
        update(draft => {
          draft.profile = user;
          draft.isLoggedIn = true;
        });
        logger.info('User logged in');
      },
      
      logout: () => {
        state.isLoggedIn = false;
      },
    };
  },
});
```

## Container

The **container** is the dependency injection hub that manages all store and service instances.

### Why a Container?

Without a container:

- Where do stores live? (Global variables? Module singletons?)
- How do stores find each other? (Import cycles?)
- How do you reset for testing? (Manual cleanup?)
- How do you isolate SSR requests? (Shared state = data leaks!)

The container solves all of these:

```ts
import { container } from 'storion';

// Create the app's container
const app = container();

// Get store instances (created on demand, cached)
const [userState, userActions] = app.get(userStore);
const [cartState, cartActions] = app.get(cartStore);

// Same store = same instance
app.get(userStore) === app.get(userStore); // true

// For testing: create isolated container
const testApp = container();
testApp.set(apiService, () => mockApiService);

// For SSR: one container per request
function handleRequest(req) {
  const requestApp = container();
  requestApp.set(sessionService, () => createSession(req));
  // ...render with requestApp...
  requestApp.dispose(); // Clean up after response
}
```

### Container in React

Provide the container to your React tree:

```tsx
import { container, StoreProvider } from 'storion/react';

const app = container();

function App() {
  return (
    <StoreProvider container={app}>
      <YourApp />
    </StoreProvider>
  );
}
```

Components access it automatically via `useStore`:

```tsx
function Profile() {
  const { name } = useStore(({ get }) => {
    // 'get' uses the container from StoreProvider
    const [state] = get(userStore);
    return { name: state.profile.name };
  });
}
```

### Container Methods

```ts
const app = container();

// Get or create instance (cached)
app.get(userStore);    // Returns [state, actions]
app.get(apiService);   // Returns service instance

// Create fresh instance (not cached)
app.create(loggerService, 'auth'); // With arguments

// Override for testing/mocking
app.set(apiService, () => mockApi);

// Lifecycle
app.delete(userStore); // Remove specific instance
app.clear();           // Remove all instances
app.dispose();         // Clean up everything
```

## Services

**Services** are plain factory functions for non-reactive dependencies like API clients, loggers, or utilities.

### Services vs Stores

| Aspect | Store | Service |
|--------|-------|---------|
| **State** | Has reactive state | No state (or non-reactive) |
| **Purpose** | Domain data & logic | Infrastructure & utilities |
| **Updates** | Changes trigger re-renders | No reactivity |
| **Examples** | User, Cart, UI | API client, Logger, Analytics |

### Defining Services

Services are just functions that return an object:

```ts
// Simple service
function apiService() {
  const baseUrl = '/api';
  
  return {
    get: (path: string) => fetch(`${baseUrl}${path}`).then(r => r.json()),
    post: (path: string, data: unknown) => fetch(`${baseUrl}${path}`, {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(r => r.json()),
  };
}

// Service with dependencies
function userApiService(resolver) {
  const api = resolver.get(apiService);
  const logger = resolver.get(loggerService);
  
  return {
    getUser: async (id: string) => {
      logger.info(`Fetching user ${id}`);
      return api.get(`/users/${id}`);
    },
  };
}

// Service with parameters (use create() instead of get())
function createLogger(resolver, namespace: string) {
  return {
    info: (msg: string) => console.log(`[${namespace}] ${msg}`),
    error: (msg: string) => console.error(`[${namespace}] ${msg}`),
  };
}
```

### Using Services in Stores

```ts
const userStore = store({
  name: 'user',
  state: { profile: null, loading: false },
  setup({ state, get, create }) {
    // get() - cached, shared instance
    const api = get(userApiService);
    
    // create() - fresh instance with parameters
    const logger = create(createLogger, 'user-store');
    
    return {
      fetchProfile: async (id: string) => {
        state.loading = true;
        logger.info(`Loading profile ${id}`);
        state.profile = await api.getUser(id);
        state.loading = false;
      },
    };
  },
});
```

### Typed Services with `service()`

For better TypeScript support, use the `service()` helper:

```ts
import { service } from 'storion';

interface ApiService {
  get: (path: string) => Promise<unknown>;
  post: (path: string, data: unknown) => Promise<unknown>;
}

const apiService = service<ApiService>(() => ({
  get: (path) => fetch(path).then(r => r.json()),
  post: (path, data) => fetch(path, {
    method: 'POST',
    body: JSON.stringify(data),
  }).then(r => r.json()),
}));
```

## Reactivity

Storion's reactivity system automatically tracks which state each component uses and only re-renders when that specific state changes.

### How It Works

1. **State is wrapped in a Proxy** that intercepts property access
2. **During render**, reads are recorded as dependencies
3. **On state change**, only subscribers of changed properties are notified

```tsx
function UserName() {
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore);
    
    // Accessing state.profile.name is tracked
    return { name: state.profile.name };
  });
  
  // This component ONLY re-renders when profile.name changes
  // Changes to profile.email, preferences, etc. are ignored
  return <h1>{name}</h1>;
}
```

### Tracking Granularity

Storion tracks **first-level property access**:

```tsx
const { profile } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { profile: state.profile }; // Tracks "profile"
});

// Re-renders when ANY property of profile changes
// (name, email, etc.)
```

For finer control, use `pick()`:

```tsx
import { pick } from 'storion';

const { name } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { name: pick(() => state.profile.name) }; // Tracks only "name"
});

// Only re-renders when profile.name specifically changes
```

### Comparison with Other Libraries

| Library | Tracking | Re-render Control |
|---------|----------|-------------------|
| **Redux** | Manual selectors | `useSelector(fn, equalityFn)` |
| **Zustand** | Manual selectors | `useStore(fn, shallow)` |
| **MobX** | Auto (deep) | `observer()` HOC |
| **Jotai** | Per-atom | N/A |
| **Storion** | Auto (first-level) | `pick()` for fine-tuning |

## Middleware

**Middleware** intercepts store creation for cross-cutting concerns like logging, persistence, or devtools.

```ts
import { container, applyFor, compose } from 'storion';

// Define middleware
const loggingMiddleware = (ctx) => {
  console.log(`Creating store: ${ctx.displayName}`);
  const instance = ctx.next(); // Create the store
  console.log(`Created: ${instance.id}`);
  return instance;
};

// Apply to container
const app = container({
  middleware: [
    loggingMiddleware,
    // Apply only to specific stores
    applyFor('user*', persistMiddleware),
  ],
});
```

See [Middleware](/api/container#middleware) for more details.

## Meta

**Meta** attaches metadata to stores for middleware to consume. It's a declarative way to configure cross-cutting concerns:

```ts
import { meta } from 'storion';

// Define meta types
const persist = meta();           // Boolean flag
const priority = meta<number>();  // Typed value

const userStore = store({
  name: 'user',
  state: { name: '', token: '' },
  meta: [
    persist(),                     // Mark entire store for persistence
    notPersisted.for('token'),     // Except the token field
    priority(10),                  // Custom priority value
  ],
});

// Middleware reads meta
const persistMiddleware = (ctx) => {
  const instance = ctx.next();
  
  if (ctx.getMeta(persist)) {
    // This store should be persisted
    const excludedFields = ctx.getMeta(notPersisted);
    // ... implement persistence logic
  }
  
  return instance;
};
```

See [Meta](/api/meta) for more details.

## Summary

| Concept | Purpose | Key Insight |
|---------|---------|-------------|
| **Store** | State + actions | Co-locate data with the logic that modifies it |
| **Container** | Instance management | Dependency injection without the ceremony |
| **Service** | Shared utilities | Non-reactive infrastructure (API, logging) |
| **Reactivity** | Auto-tracking | Read state naturally, updates are automatic |
| **Middleware** | Cross-cutting | Intercept store creation for logging, persistence |
| **Meta** | Store metadata | Declarative configuration for middleware |

## Next Steps

- **[Stores](/guide/stores)** — Deep dive into state mutation and focus
- **[Reactivity](/guide/reactivity)** — Understanding the tracking system
- **[Effects](/guide/effects)** — Reactive side effects
- **[Async](/guide/async)** — Loading states and data fetching
