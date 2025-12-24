# Dependency Injection

Storion provides a lightweight dependency injection (DI) system through containers and services. This enables loose coupling, testability, and clean architecture.

## Overview

The DI system consists of:

- **Containers** — Manage store and service instances
- **Services** — Non-reactive utilities (API clients, loggers, etc.)
- **Stores** — Reactive state with automatic dependency resolution

```ts
import { container, store, service } from 'storion';

// Define a service
const apiService = service(() => ({
  get: (url: string) => fetch(url).then(r => r.json()),
}));

// Define a store that depends on the service
const userStore = store({
  name: 'user',
  state: { user: null },
  setup({ state, get }) {
    const api = get(apiService);
    return {
      fetchUser: async (id: string) => {
        state.user = await api.get(`/api/users/${id}`);
      },
    };
  },
});

// Container resolves all dependencies
const app = container();
const [state, actions] = app.get(userStore);
```

## Services vs Stores

| Aspect | Store | Service |
|--------|-------|---------|
| **State** | Has reactive state | No state (or non-reactive) |
| **Purpose** | Domain data & logic | Infrastructure & utilities |
| **Updates** | Changes trigger re-renders | No reactivity |
| **Lifecycle** | Managed by container | Singleton per container |
| **Examples** | User, Cart, UI | API client, Logger, Analytics |

## Defining Services

### Simple Service

Services are factory functions that return an object:

```ts
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
```

### Typed Services

Services are plain functions — use explicit return types for best TypeScript support:

```ts
interface ApiService {
  get: (path: string) => Promise<unknown>;
  post: (path: string, data: unknown) => Promise<unknown>;
}

// Annotate return type for full type inference
const apiService = (): ApiService => ({
  get: (path) => fetch(path).then(r => r.json()),
  post: (path, data) => fetch(path, {
    method: 'POST',
    body: JSON.stringify(data),
  }).then(r => r.json()),
});
```

### Service with Dependencies

Services can depend on other services:

```ts
function userApiService(resolver) {
  const api = resolver.get(apiService);
  const logger = resolver.get(loggerService);
  
  return {
    getUser: async (id: string) => {
      logger.info(`Fetching user ${id}`);
      return api.get(`/users/${id}`);
    },
    createUser: async (data: UserData) => {
      logger.info('Creating user');
      return api.post('/users', data);
    },
  };
}
```

### Parameterized Services

Use `create()` for services that need parameters:

```ts
function createLogger(resolver, namespace: string) {
  return {
    info: (msg: string) => console.log(`[${namespace}] ${msg}`),
    error: (msg: string) => console.error(`[${namespace}] ${msg}`),
    warn: (msg: string) => console.warn(`[${namespace}] ${msg}`),
  };
}

// In store setup
setup({ create }) {
  const logger = create(createLogger, 'user-store');
  // ...
}
```

## Using Services in Stores

### get() — Shared Instance

Use `get()` for singleton services shared across stores:

```ts
const userStore = store({
  name: 'user',
  state: { profile: null, loading: false },
  setup({ state, get }) {
    // get() returns the same instance every time
    const api = get(userApiService);
    
    return {
      fetchProfile: async (id: string) => {
        state.loading = true;
        state.profile = await api.getUser(id);
        state.loading = false;
      },
    };
  },
});
```

### create() — Fresh Instance

Use `create()` for unique instances or parameterized services:

```ts
const orderStore = store({
  name: 'order',
  state: { items: [] },
  setup({ state, get, create }) {
    const api = get(apiService);           // Shared
    const logger = create(createLogger, 'orders');  // Unique
    
    return {
      addItem: (item: OrderItem) => {
        logger.info(`Adding item: ${item.name}`);
        state.items.push(item);
      },
    };
  },
});
```

## Store Dependencies

Stores can depend on other stores:

```ts
const cartStore = store({
  name: 'cart',
  state: { items: [] },
  setup({ state, get }) {
    // Depend on user store
    const [userState] = get(userStore);
    
    return {
      checkout: async () => {
        if (!userState.user) {
          throw new Error('Must be logged in');
        }
        // Use user data for checkout
      },
    };
  },
});
```

::: warning Dependency Order
When using `get()` for stores, declare dependencies at the top of setup. The container resolves them in order.
:::

## Containers

### Creating Containers

```ts
import { container } from 'storion';

const app = container();

// Get store instances
const [userState, userActions] = app.get(userStore);
const [cartState, cartActions] = app.get(cartStore);

// Get service instances
const api = app.get(apiService);
```

### Container Lifecycle

```ts
// Create
const app = container();

// Use
const instance = app.get(myStore);

// Delete specific instance
app.delete(myStore);

// Clear all instances
app.clear();

// Dispose container (cleanup subscriptions)
app.dispose();
```

### Multiple Containers

Create separate containers for isolation:

```ts
// Main app container
const app = container();

// Feature-specific container
const featureContainer = container();

// Testing container
const testContainer = container();
```

## Dependency Injection Patterns

### Repository Pattern

```ts
// Repository interface
interface UserRepository {
  findById(id: string): Promise<User | null>;
  save(user: User): Promise<void>;
}

// Implementation
const userRepository = service<UserRepository>((resolver) => {
  const api = resolver.get(apiService);
  
  return {
    findById: (id) => api.get(`/users/${id}`),
    save: (user) => api.post('/users', user),
  };
});

// Store uses repository
const userStore = store({
  name: 'user',
  state: { user: null },
  setup({ state, get }) {
    const repo = get(userRepository);
    
    return {
      loadUser: async (id: string) => {
        state.user = await repo.findById(id);
      },
    };
  },
});
```

### Factory Pattern

```ts
// Factory service with parameters
function createNotificationService(resolver, options: NotificationOptions) {
  const api = resolver.get(apiService);
  
  return {
    send: async (message: string) => {
      if (options.enabled) {
        await api.post('/notifications', {
          message,
          channel: options.channel,
        });
      }
    },
  };
}

// Use with create()
setup({ create }) {
  const notifications = create(createNotificationService, {
    enabled: true,
    channel: 'email',
  });
}
```

### Decorator Pattern

```ts
// Base service
const baseApi = service(() => ({
  fetch: (url: string) => fetch(url),
}));

// Decorated service with logging
const loggingApi = service((resolver) => {
  const api = resolver.get(baseApi);
  const logger = resolver.get(loggerService);
  
  return {
    fetch: async (url: string) => {
      logger.info(`Fetching: ${url}`);
      const result = await api.fetch(url);
      logger.info(`Completed: ${url}`);
      return result;
    },
  };
});
```

## Testing with DI

### Mocking Services

```ts
import { container, service } from 'storion';

// Mock service
const mockApi = service(() => ({
  get: vi.fn().mockResolvedValue({ id: '1', name: 'Test' }),
  post: vi.fn().mockResolvedValue({ success: true }),
}));

// Test
it('should fetch user', async () => {
  const testContainer = container();
  
  // Override the real service with mock
  // by creating the mock first
  testContainer.get(mockApi);
  
  const [state, actions] = testContainer.get(userStore);
  await actions.fetchUser('1');
  
  expect(state.user).toEqual({ id: '1', name: 'Test' });
});
```

### Isolated Test Containers

```ts
function createTestContainer() {
  return container({
    middleware: [
      // Test-specific middleware
    ],
  });
}

describe('UserStore', () => {
  let app: Container;
  
  beforeEach(() => {
    app = createTestContainer();
  });
  
  afterEach(() => {
    app.dispose();
  });
  
  it('should work', () => {
    const [state, actions] = app.get(userStore);
    // ...
  });
});
```

## Best Practices

### 1. Declare Dependencies Early

```ts
// ✅ Good - declare at top of setup
setup({ get, create }) {
  const api = get(apiService);
  const logger = create(createLogger, 'store');
  
  return {
    action: () => {
      // Use api and logger
    },
  };
}

// ❌ Bad - late declaration
setup({ get }) {
  return {
    action: () => {
      const api = get(apiService); // Will throw!
    },
  };
}
```

### 2. Use Typed Services

```ts
// ✅ Good - typed service
const apiService = service<ApiService>(() => ({
  // TypeScript knows the shape
}));

// ❌ Avoid - untyped
function apiService() {
  return { /* no type info */ };
}
```

### 3. Single Responsibility

```ts
// ✅ Good - focused services
const authService = service(() => ({ login, logout }));
const userService = service(() => ({ getUser, updateUser }));

// ❌ Avoid - god service
const everythingService = service(() => ({
  login, logout, getUser, updateUser, fetchProducts, ...
}));
```

## Next Steps

- **[Stores](/guide/stores)** — Deep dive into store creation
- **[Middleware](/guide/middleware)** — Intercept store creation
- **[container() API](/api/container)** — Complete API reference

