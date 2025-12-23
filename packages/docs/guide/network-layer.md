# Network Layer Architecture

Best practices for implementing a robust, multi-endpoint network layer using Storion's dependency injection, abortable functions, and offline retry capabilities.

## Overview

A well-structured network layer separates concerns into distinct layers:

```
┌─────────────────────────────────────────────────────────┐
│                   Business Services                      │
│         (userService, productService, orderService)      │
├─────────────────────────────────────────────────────────┤
│                   Request Services                       │
│              (restService, graphqlService)               │
├─────────────────────────────────────────────────────────┤
│                    Configuration                         │
│           (restConfigs, graphqlConfigs)                  │
└─────────────────────────────────────────────────────────┘
```

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

## Layer 1: Configuration

### REST Configuration

Define API endpoints, base URLs, and default options:

```ts
// services/configs/restConfigs.ts
import { service } from "storion";

export interface RestConfigs {
  baseUrl: string;
  defaultHeaders: Record<string, string>;
  timeout: number;
  endpoints: {
    users: string;
    products: string;
    orders: string;
    auth: {
      login: string;
      logout: string;
      refresh: string;
    };
  };
}

export const restConfigs = service<RestConfigs>(() => ({
  baseUrl: import.meta.env.VITE_API_URL || "https://api.example.com",
  defaultHeaders: {
    "Content-Type": "application/json",
  },
  timeout: 30000,
  endpoints: {
    users: "/users",
    products: "/products",
    orders: "/orders",
    auth: {
      login: "/auth/login",
      logout: "/auth/logout",
      refresh: "/auth/refresh",
    },
  },
}));
```

### GraphQL Configuration

```ts
// services/configs/graphqlConfigs.ts
import { service } from "storion";

export interface GraphqlConfigs {
  endpoint: string;
  wsEndpoint: string;
  defaultHeaders: Record<string, string>;
}

export const graphqlConfigs = service<GraphqlConfigs>(() => ({
  endpoint:
    import.meta.env.VITE_GRAPHQL_URL || "https://api.example.com/graphql",
  wsEndpoint:
    import.meta.env.VITE_GRAPHQL_WS_URL || "wss://api.example.com/graphql",
  defaultHeaders: {
    "Content-Type": "application/json",
  },
}));
```

## Layer 2: Request Services

### REST Service

The request layer handles HTTP communication with built-in resilience:

```ts
// services/request/restService.ts
import { service } from "storion";
import { abortable, retry, timeout, circuitBreaker, map } from "storion/async";
import { networkService } from "storion/network";
import { restConfigs } from "../configs/restConfigs";
import type { AbortableContext, Abortable } from "storion/async";

// Request options
export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
}

// REST service interface - returns untyped, caller casts with .as<T>()
export interface RestService {
  get: AbortableFn<[path: string, options?: RequestOptions], unknown>;
  post: AbortableFn<
    [path: string, body: unknown, options?: RequestOptions],
    unknown
  >;
  put: AbortableFn<
    [path: string, body: unknown, options?: RequestOptions],
    unknown
  >;
  patch: AbortableFn<
    [path: string, body: unknown, options?: RequestOptions],
    unknown
  >;
  delete: AbortableFn<[path: string, options?: RequestOptions], unknown>;
}

// Error class for API errors
export class ApiError extends Error {
  constructor(message: string, public status: number, public data?: unknown) {
    super(message);
    this.name = "ApiError";
  }
}

export const restService = service<RestService>(({ get }) => {
  const config = get(restConfigs);
  const network = get(networkService);

  // Build URL with params
  const buildUrl = (path: string, params?: Record<string, string>) => {
    const url = new URL(path, config.baseUrl);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }
    return url.toString();
  };

  // Base fetch - pure, no wrappers
  const baseFetch = abortable(
    async (
      { signal }: AbortableContext,
      method: string,
      path: string,
      body?: unknown,
      options?: RequestOptions
    ) => {
      const url = buildUrl(path, options?.params);

      const response = await fetch(url, {
        method,
        signal,
        headers: { ...config.defaultHeaders, ...options?.headers },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new ApiError(
          data?.message || `HTTP ${response.status}`,
          response.status,
          data
        );
      }

      const text = await response.text();
      return text ? JSON.parse(text) : null;
    }
  );

  // Query fetch - for GET requests (idempotent, safe to retry)
  const queryFetch = baseFetch
    .use(network.offlineRetry())
    .use(retry(3))
    .use(timeout(config.timeout))
    .use(circuitBreaker({ threshold: 5 }));

  // Mutation fetch - for POST/PUT/PATCH/DELETE
  // No retry for POST (not idempotent), retry for PUT/DELETE (idempotent)
  const mutationFetch = baseFetch
    .use(timeout(config.timeout))
    .use(circuitBreaker({ threshold: 5 }));

  const idempotentMutationFetch = mutationFetch.use(retry(3));

  return {
    // GET: retry + offline retry
    get: queryFetch.use(
      map((fetch, path: string, options?: RequestOptions) =>
        fetch("GET", path, undefined, options)
      )
    ),

    // POST: no retry (not idempotent - risk of duplicates)
    post: mutationFetch.use(
      map((fetch, path: string, body: unknown, options?: RequestOptions) =>
        fetch("POST", path, body, options)
      )
    ),

    // PUT/DELETE: retry (idempotent)
    put: idempotentMutationFetch.use(
      map((fetch, path: string, body: unknown, options?: RequestOptions) =>
        fetch("PUT", path, body, options)
      )
    ),

    patch: mutationFetch.use(
      map((fetch, path: string, body: unknown, options?: RequestOptions) =>
        fetch("PATCH", path, body, options)
      )
    ),

    delete: idempotentMutationFetch.use(
      map((fetch, path: string, options?: RequestOptions) =>
        fetch("DELETE", path, undefined, options)
      )
    ),
  };
});
```

### GraphQL Service

```ts
// services/request/graphqlService.ts
import { service } from "storion";
import { abortable, retry, timeout, circuitBreaker } from "storion/async";
import { networkService } from "storion/network";
import { graphqlConfigs } from "../configs/graphqlConfigs";
import type { AbortableContext, AbortableFn } from "storion/async";

// GraphQL types
export interface GraphqlVariables {
  [key: string]: unknown;
}

export interface GraphqlResponse {
  data: unknown;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

// Service interface - returns untyped, caller casts with .as<T>()
export interface GraphqlService {
  query: AbortableFn<[query: string, variables?: GraphqlVariables], unknown>;
  mutate: AbortableFn<
    [mutation: string, variables?: GraphqlVariables],
    unknown
  >;
}

export class GraphqlError extends Error {
  constructor(message: string, public errors: GraphqlResponse["errors"]) {
    super(message);
    this.name = "GraphqlError";
  }
}

export const graphqlService = service<GraphqlService>(({ get }) => {
  const config = get(graphqlConfigs);
  const network = get(networkService);

  // Base GraphQL fetch - no wrappers
  const baseFetch = abortable(
    async (
      { signal }: AbortableContext,
      query: string,
      variables?: GraphqlVariables
    ) => {
      const response = await fetch(config.endpoint, {
        method: "POST",
        headers: config.defaultHeaders,
        body: JSON.stringify({ query, variables }),
        signal,
      });

      const result: GraphqlResponse = await response.json();

      if (result.errors?.length) {
        throw new GraphqlError(
          result.errors.map((e) => e.message).join(", "),
          result.errors
        );
      }

      return result.data;
    }
  );

  // Query fetch - with offline retry (runs last after other retries)
  const queryFetch = baseFetch
    .use(network.offlineRetry())
    .use(retry(3))
    .use(timeout(30000))
    .use(circuitBreaker({ threshold: 5 }));

  // Mutation fetch - no offline retry, no retry (not idempotent)
  const mutationFetch = baseFetch
    .use(timeout(30000))
    .use(circuitBreaker({ threshold: 5 }));

  return {
    query: queryFetch,
    mutate: mutationFetch,
  };
});
```

## Layer 3: Business Domain Services

### Type Safety with Abortable Functions

TypeScript cannot infer generic types through wrapper chains. When you chain multiple `.use()` calls, the generic type parameter `<T>` gets lost:

```ts
// ❌ TypeScript loses the generic - result is `unknown`
const getData = baseFetch.use(retry(3)).use(timeout(5000));

// Even if baseFetch was generic, the type is lost through the chain
```

**Solution: Use `.as<T>()` at the domain layer**

The `.as<T>()` method provides explicit type assertions at the point where you know the actual return type:

```ts
// ✅ Type assertion at domain layer
const getUser = rest.get
  .use(map((fetch, id: string) => fetch(`/users/${id}`)))
  .as<User>(); // Now getUser returns Promise<User>

// The type flows correctly:
// - rest.get returns unknown
// - .as<User>() asserts the return type
// - getUser: AbortableFn<[id: string], User>
```

**Why this approach?**

1. **Request layer stays generic** - `restService.get` handles any response type
2. **Domain layer knows the types** - Only `userService` knows it returns `User`
3. **Type safety at boundaries** - Explicit assertions at the layer that owns the types
4. **Clean separation** - Request logic separate from type knowledge

```ts
// Request layer - no type knowledge
const baseFetch = abortable(async ({ signal }, method, path, body?) => {
  const res = await fetch(url, { signal, method, body });
  return res.json(); // Returns unknown
});

// Domain layer - owns the types
export const userService = service(({ get }) => {
  const rest = get(restService);

  return {
    // Type assertion here - userService knows it returns User
    getUser: rest.get
      .use(map((fetch, id: string) => fetch(`/users/${id}`)))
      .as<User>(),
  };
});
```

**Alternative: Type the `next` function in `map()`**

For stronger type safety, you can explicitly type the `next` function parameter in `map()`. This approach provides compile-time checks on the inner call:

```ts
// Define typed function signatures
type QueryFn<TVariables, TResult> = (
  document: unknown,
  variables?: TVariables
) => Promise<TResult>;

// Base query - returns Promise<any>, parameters are unknown
const baseQuery = abortable(
  async (_ctx, document: unknown, variables?: unknown): Promise<any> => {
    const res = await fetch("/graphql", {
      method: "POST",
      body: JSON.stringify({ query: document, variables }),
      signal: _ctx.signal,
    });
    return res.json();
  }
);

// Domain layer - type the next function for compile-time safety
type SearchVariables = { keyword: string };
type SearchResult = { results: { id: string; name: string }[] };

const searchQuery = baseQuery.use(
  map(
    (
      // Explicitly type the next function
      query: QueryFn<SearchVariables, SearchResult>,
      variables: SearchVariables
    ) => {
      return query(SEARCH_DOCUMENT, variables);
    }
  )
);

// ✅ Fully typed - TypeScript knows the exact types
const result = await searchQuery({ keyword: "test" });
// result: SearchResult
```

**When to use each approach:**

| Approach                | Use Case                                         |
| ----------------------- | ------------------------------------------------ |
| `.as<T>()`              | Simple type assertion, most common case          |
| Typed `next` in `map()` | Need compile-time checks on inner function calls |

### User Service (REST)

```ts
// services/domain/userService.ts
import { service } from "storion";
import { map } from "storion/async";
import { restService } from "../request/restService";
import { restConfigs } from "../configs/restConfigs";

// Domain types
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: string;
}

export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
}

export interface UpdateUserDto {
  name?: string;
  avatar?: string;
}

// Let TypeScript infer the service type
export const userService = service(({ get }) => {
  const rest = get(restService);
  const config = get(restConfigs);
  const endpoint = config.endpoints.users;

  return {
    // Cast with .as<T>() at domain layer
    getUsers: rest.get.use(map((fetch) => fetch(endpoint))).as<User[]>(),

    getUser: rest.get
      .use(map((fetch, id: string) => fetch(`${endpoint}/${id}`)))
      .as<User>(),

    createUser: rest.post
      .use(map((fetch, data: CreateUserDto) => fetch(endpoint, data)))
      .as<User>(),

    updateUser: rest.patch
      .use(
        map((fetch, id: string, data: UpdateUserDto) =>
          fetch(`${endpoint}/${id}`, data)
        )
      )
      .as<User>(),

    deleteUser: rest.delete
      .use(map((fetch, id: string) => fetch(`${endpoint}/${id}`)))
      .as<void>(),
  };
});
```

### Product Service (GraphQL)

```ts
// services/domain/productService.ts
import { service } from "storion";
import { map } from "storion/async";
import { graphqlService } from "../request/graphqlService";

// Domain types
export interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  inStock: boolean;
}

export interface CreateProductDto {
  name: string;
  price: number;
  description: string;
}

// GraphQL queries
const GET_PRODUCTS = `
  query GetProducts($limit: Int, $offset: Int) {
    products(limit: $limit, offset: $offset) {
      id
      name
      price
      description
      inStock
    }
  }
`;

const GET_PRODUCT = `
  query GetProduct($id: ID!) {
    product(id: $id) {
      id
      name
      price
      description
      inStock
    }
  }
`;

const CREATE_PRODUCT = `
  mutation CreateProduct($input: CreateProductInput!) {
    createProduct(input: $input) {
      id
      name
      price
      description
      inStock
    }
  }
`;

// Let TypeScript infer the service type
export const productService = service(({ get }) => {
  const graphql = get(graphqlService);

  return {
    // Cast with .as<T>() and extract nested data with map()
    getProducts: graphql.query
      .use(
        map(async (query, options?: { limit?: number; offset?: number }) => {
          const data = await query(GET_PRODUCTS, options);
          return (data as { products: Product[] }).products;
        })
      )
      .as<Product[]>(),

    getProduct: graphql.query
      .use(
        map(async (query, id: string) => {
          const data = await query(GET_PRODUCT, { id });
          return (data as { product: Product }).product;
        })
      )
      .as<Product>(),

    createProduct: graphql.mutate
      .use(
        map(async (mutate, input: CreateProductDto) => {
          const data = await mutate(CREATE_PRODUCT, { input });
          return (data as { createProduct: Product }).createProduct;
        })
      )
      .as<Product>(),
  };
});
```

## Using Services in Stores

### Store with REST Service

```ts
// stores/userStore.ts
import { store } from "storion/react";
import { async } from "storion/async";
import { userService } from "../services/domain/userService";
import type { User } from "../services/domain/userService";

export const userStore = store({
  name: "user",
  state: {
    users: async.stale<User[]>([]),
    currentUser: async.fresh<User>(),
  },
  setup({ get, focus }) {
    const users = get(userService);

    // Use *Query for read operations
    const usersQuery = async(focus("users"), users.getUsers);

    const userQuery = async(focus("currentUser"), async (ctx, id: string) => {
      // Abortable can be called with ctx.safe for signal injection
      return ctx.safe(users.getUser, id);
    });

    return {
      fetchUsers: usersQuery.dispatch,
      refreshUsers: usersQuery.refresh,
      fetchUser: userQuery.dispatch,
    };
  },
});
```

### Store with GraphQL Service

```ts
// stores/productStore.ts
import { store } from "storion/react";
import { async } from "storion/async";
import { productService } from "../services/domain/productService";
import type { Product } from "../services/domain/productService";

export const productStore = store({
  name: "product",
  state: {
    products: async.stale<Product[]>([]),
    currentProduct: async.fresh<Product>(),
  },
  setup({ get, focus }) {
    const products = get(productService);

    // Use *Query for read operations
    const productsQuery = async(focus("products"), products.getProducts);
    const productQuery = async(focus("currentProduct"), products.getProduct);

    return {
      fetchProducts: productsQuery.dispatch,
      fetchProduct: productQuery.dispatch,
    };
  },
});
```

## Component Usage

```tsx
// components/UserList.tsx
import { useStore, trigger } from "storion/react";
import { userStore } from "../stores/userStore";
import { networkStore } from "storion/network";

function UserList() {
  const { users, online, refresh } = useStore(({ get }) => {
    const [network] = get(networkStore);
    const [state, actions] = get(userStore);

    trigger(actions.fetchUsers, []);

    return {
      users: state.users,
      online: network.online,
      refresh: actions.refreshUsers,
    };
  });

  return (
    <div>
      {!online && (
        <div className="offline-banner">
          You are offline. Showing cached data.
        </div>
      )}

      <div className="header">
        <h1>Users</h1>
        <button onClick={refresh} disabled={users.status === "pending"}>
          {users.status === "pending" ? "Loading..." : "Refresh"}
        </button>
      </div>

      {users.status === "error" && (
        <div className="error">
          Error: {users.error.message}
          <button onClick={refresh}>Retry</button>
        </div>
      )}

      <ul>
        {users.data.map((user) => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Authentication Integration

### Auth Token Interceptor

Extend `restService` to include auth tokens:

```ts
// services/request/restService.ts (enhanced)
import { authStore } from "../../stores/authStore";

export const restService = service<RestService>(({ get }) => {
  const config = get(restConfigs);
  const network = get(networkService);

  // Get auth token lazily (read at request time, not setup time)
  const getAuthHeaders = () => {
    try {
      const [auth] = get(authStore);
      if (auth.token) {
        return { Authorization: `Bearer ${auth.token}` };
      }
    } catch {
      // authStore not initialized yet
    }
    return {};
  };

  const coreFetch = async <T>(
    ctx: AbortableContext,
    method: string,
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> => {
    const url = buildUrl(path, options?.params);

    const response = await fetch(url, {
      method,
      headers: {
        ...config.defaultHeaders,
        ...getAuthHeaders(), // Include auth token
        ...options?.headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctx.signal,
    });

    // Handle 401 - could trigger token refresh
    if (response.status === 401) {
      // Option 1: Throw special error
      throw new ApiError("Unauthorized", 401);

      // Option 2: Trigger refresh and retry
      // const [, authActions] = get(authStore);
      // await authActions.refreshToken();
      // return coreFetch(ctx, method, path, body, options);
    }

    // ... rest of implementation
  };

  // ...
});
```

## Testing

### Mocking Services

```ts
// services/__mocks__/userService.ts
import { service } from "storion";
import { abortable } from "storion/async";
import type { UserService, User } from "../domain/userService";

const mockUsers: User[] = [
  { id: "1", email: "john@example.com", name: "John", createdAt: "2024-01-01" },
  { id: "2", email: "jane@example.com", name: "Jane", createdAt: "2024-01-02" },
];

export const mockUserService = service<UserService>(() => ({
  getUsers: abortable(async () => mockUsers),
  getUser: abortable(async (ctx, id: string) => {
    const user = mockUsers.find((u) => u.id === id);
    if (!user) throw new Error("User not found");
    return user;
  }),
  createUser: abortable(async (ctx, data) => ({
    id: "3",
    ...data,
    createdAt: new Date().toISOString(),
  })),
  updateUser: abortable(async (ctx, id, data) => ({
    ...mockUsers[0],
    ...data,
  })),
  deleteUser: abortable(async () => {}),
}));
```

### Test Setup

```ts
// tests/userStore.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { container } from "storion";
import { userStore } from "../stores/userStore";
import { userService } from "../services/domain/userService";
import { mockUserService } from "../services/__mocks__/userService";

describe("userStore", () => {
  let app: ReturnType<typeof container>;

  beforeEach(() => {
    app = container();
    // Override with mock
    app.set(userService, mockUserService);
  });

  it("should fetch users", async () => {
    const [, actions] = app.get(userStore);

    await actions.fetchUsers();

    const [state] = app.get(userStore);
    expect(state.users.status).toBe("success");
    expect(state.users.data).toHaveLength(2);
  });
});
```

## Summary

| Layer                | Purpose                       | Key Features                                   |
| -------------------- | ----------------------------- | ---------------------------------------------- |
| **Configs**          | Environment-specific settings | Base URLs, endpoints, timeouts                 |
| **Request Services** | HTTP communication            | Retry, timeout, circuit breaker, offline retry |
| **Domain Services**  | Business logic                | Type-safe APIs, domain-specific methods        |
| **Stores**           | State management              | Async state, caching, reactivity               |

### Best Practices

1. **Separate concerns** - Keep configs, request layer, and domain logic in separate files
2. **Use offline retry for queries** - GET requests should retry when back online
3. **Skip offline retry for mutations** - POST/PUT/DELETE should fail fast
4. **Add circuit breaker** - Prevent cascading failures
5. **Type everything** - Use TypeScript interfaces for all APIs
6. **Mock at service level** - Replace entire services in tests
7. **Lazy auth token** - Read auth state at request time, not setup time
