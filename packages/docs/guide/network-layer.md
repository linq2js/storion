# Network Layer Architecture

Best practices for implementing a robust, multi-endpoint network layer using Storion's dependency injection, abortable functions, and offline retry capabilities.

## What's This For?

Building a production-ready API layer is complex. You need:
- **Retry logic** — Transient failures shouldn't crash your app
- **Timeouts** — Don't wait forever for slow servers
- **Circuit breakers** — Protect against cascading failures
- **Offline support** — Queue requests when network is unavailable
- **Type safety** — Know exactly what your API returns

This guide shows how to build a layered network architecture that handles all of these concerns cleanly.

---

## Architecture Overview

A well-structured network layer separates concerns into distinct layers:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Business Domain Services                           │
│                   (userService, productService, orderService)                │
│                                                                              │
│   "What data do I need?"                                                     │
│   - getUser(id) → User                                                       │
│   - createOrder(items) → Order                                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                            Request Services                                   │
│                      (restService, graphqlService)                           │
│                                                                              │
│   "How do I fetch it?"                                                       │
│   - HTTP methods with retry, timeout, circuit breaker                        │
│   - Error handling, offline retry                                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                              Configuration                                    │
│                     (restConfigs, graphqlConfigs)                            │
│                                                                              │
│   "Where is the API?"                                                        │
│   - Base URLs, endpoints, timeouts                                           │
│   - Environment-specific settings                                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why This Architecture?

| Benefit | How It Helps |
|---------|--------------|
| **Testability** | Mock any layer independently |
| **Reusability** | Same retry logic for all endpoints |
| **Maintainability** | Change API URL in one place |
| **Type Safety** | Domain services know exact return types |

---

## Project Structure

```
src/
├── services/
│   ├── configs/
│   │   ├── restConfigs.ts      # REST API configuration
│   │   └── graphqlConfigs.ts   # GraphQL configuration
│   ├── request/
│   │   ├── restService.ts      # HTTP request layer
│   │   └── graphqlService.ts   # GraphQL request layer
│   └── domain/
│       ├── userService.ts      # User business logic
│       ├── productService.ts   # Product business logic
│       └── orderService.ts     # Order business logic
└── stores/
    └── ...
```

---

## Layer 1: Configuration

Configuration services provide environment-specific settings.

### REST Configuration

```ts
// services/configs/restConfigs.ts
import { service } from 'storion'

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ Define the shape of your REST API configuration.                            │
// │ This includes base URLs, endpoints, and default settings.                   │
// └─────────────────────────────────────────────────────────────────────────────┘
export interface RestConfigs {
  baseUrl: string
  defaultHeaders: Record<string, string>
  timeout: number
  endpoints: {
    users: string
    products: string
    orders: string
    auth: {
      login: string
      logout: string
      refresh: string
    }
  }
}

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │ service<T>() creates a typed service factory.                               │
// │ The function returns the configuration object.                              │
// │ Use environment variables for deployment flexibility.                       │
// └─────────────────────────────────────────────────────────────────────────────┘
export const restConfigs = service<RestConfigs>(() => ({
  baseUrl: import.meta.env.VITE_API_URL || 'https://api.example.com',
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,  // 30 seconds
  endpoints: {
    users: '/users',
    products: '/products',
    orders: '/orders',
    auth: {
      login: '/auth/login',
      logout: '/auth/logout',
      refresh: '/auth/refresh',
    },
  },
}))
```

### GraphQL Configuration

```ts
// services/configs/graphqlConfigs.ts
import { service } from 'storion'

export interface GraphqlConfigs {
  endpoint: string
  wsEndpoint: string
  defaultHeaders: Record<string, string>
}

export const graphqlConfigs = service<GraphqlConfigs>(() => ({
  endpoint: import.meta.env.VITE_GRAPHQL_URL || 'https://api.example.com/graphql',
  wsEndpoint: import.meta.env.VITE_GRAPHQL_WS_URL || 'wss://api.example.com/graphql',
  defaultHeaders: {
    'Content-Type': 'application/json',
  },
}))
```

---

## Layer 2: Request Services

The request layer handles HTTP communication with built-in resilience patterns.

### REST Service

```ts
// services/request/restService.ts
import { service } from 'storion'
import { abortable, retry, timeout, circuitBreaker, map } from 'storion/async'
import { networkService } from 'storion/network'
import { restConfigs } from '../configs/restConfigs'
import type { AbortableContext, Abortable } from 'storion/async'

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface RequestOptions {
  headers?: Record<string, string>
  params?: Record<string, string>
}

export interface RestService {
  get: Abortable<[path: string, options?: RequestOptions], unknown>
  post: Abortable<[path: string, body: unknown, options?: RequestOptions], unknown>
  put: Abortable<[path: string, body: unknown, options?: RequestOptions], unknown>
  patch: Abortable<[path: string, body: unknown, options?: RequestOptions], unknown>
  delete: Abortable<[path: string, options?: RequestOptions], unknown>
}

// Custom error class for better error handling
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public data?: unknown
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Service Implementation
// ═══════════════════════════════════════════════════════════════════════════════

export const restService = service<RestService>(({ get }) => {
  // ┌─────────────────────────────────────────────────────────────────────────
  // │ Inject dependencies via get()
  // └─────────────────────────────────────────────────────────────────────────
  const config = get(restConfigs)
  const network = get(networkService)

  // ┌─────────────────────────────────────────────────────────────────────────
  // │ Helper: Build URL with query parameters
  // └─────────────────────────────────────────────────────────────────────────
  const buildUrl = (path: string, params?: Record<string, string>) => {
    const url = new URL(path, config.baseUrl)
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value)
      })
    }
    return url.toString()
  }

  // ┌─────────────────────────────────────────────────────────────────────────
  // │ Base fetch: Core HTTP logic without any wrappers
  // │
  // │ abortable() makes the function cancellable via AbortSignal.
  // │ The signal is automatically propagated to fetch().
  // └─────────────────────────────────────────────────────────────────────────
  const baseFetch = abortable(
    async (
      { signal }: AbortableContext,
      method: string,
      path: string,
      body?: unknown,
      options?: RequestOptions
    ) => {
      const url = buildUrl(path, options?.params)

      const response = await fetch(url, {
        method,
        signal,  // ← Enables cancellation
        headers: { ...config.defaultHeaders, ...options?.headers },
        body: body ? JSON.stringify(body) : undefined,
      })

      // Handle HTTP errors
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new ApiError(
          data?.message || `HTTP ${response.status}`,
          response.status,
          data
        )
      }

      // Parse response
      const text = await response.text()
      return text ? JSON.parse(text) : null
    }
  )

  // ┌─────────────────────────────────────────────────────────────────────────
  // │ Query fetch: For GET requests (idempotent, safe to retry)
  // │
  // │ Wrapper order matters! They execute outside-in:
  // │ 1. circuitBreaker - Check if circuit is open (fail fast)
  // │ 2. offlineRetry   - Wait for network if offline
  // │ 3. retry          - Retry on transient failures
  // │ 4. timeout        - Timeout per individual attempt
  // │ 5. baseFetch      - Actual HTTP request
  // └─────────────────────────────────────────────────────────────────────────
  const queryFetch = baseFetch
    .use(timeout(config.timeout))    // Timeout per attempt
    .use(retry(3))                   // Retry up to 3 times
    .use(network.offlineRetry())     // Wait for network when offline
    .use(circuitBreaker({ threshold: 5 }))  // Trip after 5 failures

  // ┌─────────────────────────────────────────────────────────────────────────
  // │ Mutation fetch: For POST/PATCH (NOT idempotent - don't retry)
  // │
  // │ POST requests should NOT be retried automatically because:
  // │ - Server might process the first request before returning error
  // │ - Retrying could create duplicate records
  // └─────────────────────────────────────────────────────────────────────────
  const mutationFetch = baseFetch
    .use(timeout(config.timeout))
    .use(circuitBreaker({ threshold: 5 }))

  // ┌─────────────────────────────────────────────────────────────────────────
  // │ Idempotent mutation fetch: For PUT/DELETE (safe to retry)
  // │
  // │ PUT and DELETE are idempotent - same request multiple times
  // │ produces the same result - so retrying is safe.
  // └─────────────────────────────────────────────────────────────────────────
  const idempotentMutationFetch = mutationFetch.use(retry(3))

  // ┌─────────────────────────────────────────────────────────────────────────
  // │ Return the service interface
  // │
  // │ map() transforms the function signature to be more ergonomic.
  // │ Instead of (method, path, body, options), callers use (path, body, options).
  // └─────────────────────────────────────────────────────────────────────────
  return {
    get: queryFetch.use(
      map((fetch, path: string, options?: RequestOptions) =>
        fetch('GET', path, undefined, options)
      )
    ),

    // POST: No retry (not idempotent)
    post: mutationFetch.use(
      map((fetch, path: string, body: unknown, options?: RequestOptions) =>
        fetch('POST', path, body, options)
      )
    ),

    // PUT: With retry (idempotent)
    put: idempotentMutationFetch.use(
      map((fetch, path: string, body: unknown, options?: RequestOptions) =>
        fetch('PUT', path, body, options)
      )
    ),

    // PATCH: No retry (not idempotent)
    patch: mutationFetch.use(
      map((fetch, path: string, body: unknown, options?: RequestOptions) =>
        fetch('PATCH', path, body, options)
      )
    ),

    // DELETE: With retry (idempotent)
    delete: idempotentMutationFetch.use(
      map((fetch, path: string, options?: RequestOptions) =>
        fetch('DELETE', path, undefined, options)
      )
    ),
  }
})
```

### Understanding Wrapper Order

```
Request Flow (wrappers execute outside-in):
┌───────────────────────────────────────────────────────────────────────────┐
│                         circuitBreaker                                     │
│   ┌───────────────────────────────────────────────────────────────────┐   │
│   │                     offlineRetry                                   │   │
│   │   ┌───────────────────────────────────────────────────────────┐   │   │
│   │   │                      retry(3)                              │   │   │
│   │   │   ┌───────────────────────────────────────────────────┐   │   │   │
│   │   │   │                 timeout(30s)                       │   │   │   │
│   │   │   │   ┌───────────────────────────────────────────┐   │   │   │   │
│   │   │   │   │              baseFetch                     │   │   │   │   │
│   │   │   │   │          (actual HTTP call)                │   │   │   │   │
│   │   │   │   └───────────────────────────────────────────┘   │   │   │   │
│   │   │   └───────────────────────────────────────────────────┘   │   │   │
│   │   └───────────────────────────────────────────────────────────┘   │   │
│   └───────────────────────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────────────────────────┘

What happens on a request:
1. circuitBreaker checks if circuit is open → fails fast if so
2. offlineRetry checks network → waits if offline
3. retry wrapper starts
4. timeout starts 30s timer
5. baseFetch makes HTTP request
6. If timeout expires → retry catches error → tries again (up to 3 times)
7. If all retries fail → offlineRetry might retry when network returns
8. If too many failures → circuitBreaker trips (opens)
```

---

## Layer 3: Business Domain Services

Domain services provide type-safe APIs for specific business entities.

### Type Safety with `.as<T>()`

TypeScript loses generic types through wrapper chains. Use `.as<T>()` to restore type safety:

```ts
// ❌ PROBLEM: Generic type is lost through .use() chain
const getData = baseFetch.use(retry(3)).use(timeout(5000))
// getData returns Promise<unknown>

// ✅ SOLUTION: Use .as<T>() at domain layer
const getUser = rest.get
  .use(map((fetch, id: string) => fetch(`/users/${id}`)))
  .as<User>()  // ← Assert the return type
// getUser returns Promise<User>
```

**Why at the domain layer?**
- Request layer stays generic (handles any response)
- Domain layer knows the actual types (User, Product, etc.)
- Type safety at the boundary where you actually know the types

### User Service (REST Example)

```ts
// services/domain/userService.ts
import { service } from 'storion'
import { map } from 'storion/async'
import { restService } from '../request/restService'
import { restConfigs } from '../configs/restConfigs'

// ═══════════════════════════════════════════════════════════════════════════════
// Domain Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface User {
  id: string
  email: string
  name: string
  avatar?: string
  createdAt: string
}

export interface CreateUserDto {
  email: string
  name: string
  password: string
}

export interface UpdateUserDto {
  name?: string
  avatar?: string
}

// ═══════════════════════════════════════════════════════════════════════════════
// Service Implementation
// ═══════════════════════════════════════════════════════════════════════════════

export const userService = service(({ get }) => {
  const rest = get(restService)
  const config = get(restConfigs)
  const endpoint = config.endpoints.users

  return {
    // ┌─────────────────────────────────────────────────────────────────────────
    // │ Get all users
    // │ .use(map(...)) transforms the API to be more ergonomic
    // │ .as<User[]>() asserts the return type
    // └─────────────────────────────────────────────────────────────────────────
    getUsers: rest.get
      .use(map((fetch) => fetch(endpoint)))
      .as<User[]>(),

    // ┌─────────────────────────────────────────────────────────────────────────
    // │ Get single user by ID
    // └─────────────────────────────────────────────────────────────────────────
    getUser: rest.get
      .use(map((fetch, id: string) => fetch(`${endpoint}/${id}`)))
      .as<User>(),

    // ┌─────────────────────────────────────────────────────────────────────────
    // │ Create new user
    // └─────────────────────────────────────────────────────────────────────────
    createUser: rest.post
      .use(map((fetch, data: CreateUserDto) => fetch(endpoint, data)))
      .as<User>(),

    // ┌─────────────────────────────────────────────────────────────────────────
    // │ Update existing user
    // └─────────────────────────────────────────────────────────────────────────
    updateUser: rest.patch
      .use(map((fetch, id: string, data: UpdateUserDto) =>
        fetch(`${endpoint}/${id}`, data)
      ))
      .as<User>(),

    // ┌─────────────────────────────────────────────────────────────────────────
    // │ Delete user
    // └─────────────────────────────────────────────────────────────────────────
    deleteUser: rest.delete
      .use(map((fetch, id: string) => fetch(`${endpoint}/${id}`)))
      .as<void>(),
  }
})
```

---

## Using Services in Stores

### Store with Domain Service

```ts
// stores/userStore.ts
import { store } from 'storion/react'
import { async } from 'storion/async'
import { userService } from '../services/domain/userService'
import type { User } from '../services/domain/userService'

export const userStore = store({
  name: 'user',
  state: {
    // ┌─────────────────────────────────────────────────────────────────────────
    // │ async.stale<T>(initial) - Keeps previous data while loading
    // │ async.fresh<T>() - Shows loading state, no stale data
    // └─────────────────────────────────────────────────────────────────────────
    users: async.stale<User[]>([]),
    currentUser: async.fresh<User>(),
  },
  setup({ get, focus }) {
    const users = get(userService)

    // ┌─────────────────────────────────────────────────────────────────────────
    // │ async.action binds an async function to a state field
    // │ It automatically handles loading/success/error states
    // └─────────────────────────────────────────────────────────────────────────
    const usersQuery = async(focus('users'), users.getUsers)
    const userQuery = async(focus('currentUser'), users.getUser)

    return {
      fetchUsers: usersQuery.dispatch,
      refreshUsers: usersQuery.refresh,
      fetchUser: userQuery.dispatch,
    }
  },
})
```

### Component Usage

```tsx
// components/UserList.tsx
import { useStore, trigger } from 'storion/react'
import { userStore } from '../stores/userStore'
import { networkStore } from 'storion/network'

function UserList() {
  const { users, online, refresh } = useStore(({ get }) => {
    const [network] = get(networkStore)
    const [state, actions] = get(userStore)

    // ┌─────────────────────────────────────────────────────────────────────────
    // │ trigger() fetches data when dependencies change
    // │ Empty array = fetch once on mount
    // └─────────────────────────────────────────────────────────────────────────
    trigger(actions.fetchUsers, [])

    return {
      users: state.users,
      online: network.online,
      refresh: actions.refreshUsers,
    }
  })

  return (
    <div>
      {/* Offline indicator */}
      {!online && (
        <div className="offline-banner">
          You are offline. Showing cached data.
        </div>
      )}

      {/* Header with refresh */}
      <div className="header">
        <h1>Users</h1>
        <button onClick={refresh} disabled={users.status === 'pending'}>
          {users.status === 'pending' ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {/* Error state */}
      {users.status === 'error' && (
        <div className="error">
          Error: {users.error.message}
          <button onClick={refresh}>Retry</button>
        </div>
      )}

      {/* User list (shows stale data while refreshing) */}
      <ul>
        {users.data.map(user => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    </div>
  )
}
```

---

## Authentication Integration

Add auth tokens to requests:

```ts
// Enhanced restService with auth
export const restService = service<RestService>(({ get }) => {
  const config = get(restConfigs)
  const network = get(networkService)

  // ┌─────────────────────────────────────────────────────────────────────────
  // │ Get auth token lazily (at request time, not setup time)
  // │ This ensures we always have the current token
  // └─────────────────────────────────────────────────────────────────────────
  const getAuthHeaders = () => {
    try {
      const [auth] = get(authStore)
      if (auth.token) {
        return { Authorization: `Bearer ${auth.token}` }
      }
    } catch {
      // authStore not initialized yet
    }
    return {}
  }

  const baseFetch = abortable(async ({ signal }, method, path, body?, options?) => {
    const response = await fetch(buildUrl(path, options?.params), {
      method,
      signal,
      headers: {
        ...config.defaultHeaders,
        ...getAuthHeaders(),  // ← Include auth token
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    // Handle 401 Unauthorized
    if (response.status === 401) {
      throw new ApiError('Unauthorized', 401)
      // Or: trigger token refresh and retry
    }

    // ... rest of implementation
  })

  // ...
})
```

---

## Testing

### Mock Services

```ts
// services/__mocks__/userService.ts
import { service } from 'storion'
import { abortable } from 'storion/async'
import type { User } from '../domain/userService'

const mockUsers: User[] = [
  { id: '1', email: 'john@example.com', name: 'John', createdAt: '2024-01-01' },
  { id: '2', email: 'jane@example.com', name: 'Jane', createdAt: '2024-01-02' },
]

export const mockUserService = service(() => ({
  getUsers: abortable(async () => mockUsers),
  getUser: abortable(async (ctx, id: string) => {
    const user = mockUsers.find(u => u.id === id)
    if (!user) throw new Error('User not found')
    return user
  }),
  createUser: abortable(async (ctx, data) => ({
    id: '3',
    ...data,
    createdAt: new Date().toISOString(),
  })),
  updateUser: abortable(async (ctx, id, data) => ({
    ...mockUsers[0],
    ...data,
  })),
  deleteUser: abortable(async () => {}),
}))
```

### Test Setup

```ts
// tests/userStore.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { container } from 'storion'
import { userStore } from '../stores/userStore'
import { userService } from '../services/domain/userService'
import { mockUserService } from '../services/__mocks__/userService'

describe('userStore', () => {
  let app: ReturnType<typeof container>

  beforeEach(() => {
    app = container()
    // Override real service with mock
    app.set(userService, mockUserService)
  })

  it('should fetch users', async () => {
    const [, actions] = app.get(userStore)

    await actions.fetchUsers()

    const [state] = app.get(userStore)
    expect(state.users.status).toBe('success')
    expect(state.users.data).toHaveLength(2)
  })
})
```

---

## Summary

| Layer | Purpose | Key Features |
|-------|---------|--------------|
| **Configs** | Environment settings | Base URLs, endpoints, timeouts |
| **Request Services** | HTTP communication | Retry, timeout, circuit breaker, offline retry |
| **Domain Services** | Business logic | Type-safe APIs, domain-specific methods |
| **Stores** | State management | Async state, caching, reactivity |

### Best Practices

| Practice | Why |
|----------|-----|
| **Separate concerns** | Each layer has one job |
| **Retry GET, not POST** | GET is idempotent, POST might create duplicates |
| **Use circuit breaker** | Prevent cascading failures |
| **Type at domain layer** | Request layer stays generic |
| **Lazy auth tokens** | Read at request time, not setup time |
| **Mock at service level** | Replace entire services in tests |

---

## Next Steps

| Topic | What You'll Learn |
|-------|-------------------|
| [Async](/guide/async) | Loading states and data fetching |
| [abortable() API](/api/abortable) | Complete abortable function reference |
| [Network](/guide/network) | Offline detection and retry |
| [Dependency Injection](/guide/dependency-injection) | Service patterns and testing |

---

**Ready?** [Learn about React Provider →](/guide/react/provider)
