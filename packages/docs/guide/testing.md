# Testing

Learn how to test Storion stores, hooks, and async operations effectively.

## Why Test Storion Apps?

Storion's architecture makes testing straightforward:

| Feature                   | Benefit for Testing                 |
| ------------------------- | ----------------------------------- |
| **Dependency Injection**  | Swap real services for mocks easily |
| **Container Isolation**   | Each test gets a fresh container    |
| **Stores are Pure Logic** | Test stores without React           |
| **Actions are Functions** | Unit test actions directly          |

---

## Setup

### Vitest (Recommended)

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

```ts
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
  },
});
```

```ts
// src/test/setup.ts
import { expect, beforeEach, afterEach, vi } from "vitest";
import * as matchers from "@testing-library/jest-dom/matchers";

// Extend expect with jest-dom matchers
expect.extend(matchers);

// Clear mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
```

### Jest

```bash
pnpm add -D jest @testing-library/react @testing-library/jest-dom ts-jest
```

```js
// jest.config.js
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
};
```

---

## Testing Stores (Unit Tests)

Test store logic without React. Create a fresh container per test.

### Basic Store Test

```ts
import { describe, it, expect } from "vitest";
import { container } from "storion";
import { counterStore } from "./counterStore";

describe("counterStore", () => {
  it("should start with initial count", () => {
    const app = container();
    const instance = app.get(counterStore);

    expect(instance.state.count).toBe(0);
  });

  it("should increment count", () => {
    const app = container();
    const instance = app.get(counterStore);

    instance.actions.increment();

    expect(instance.state.count).toBe(1);
  });

  it("should decrement count", () => {
    const app = container();
    const instance = app.get(counterStore);

    instance.actions.increment();
    instance.actions.increment();
    instance.actions.decrement();

    expect(instance.state.count).toBe(1);
  });
});
```

### Testing with Dependencies

Use dependency injection to mock services:

```ts
// stores/userStore.ts
import { store } from "storion/react";
import { apiService } from "../services/apiService";

export const userStore = store({
  name: "user",
  state: { users: [] as User[], loading: false },
  setup({ state, get }) {
    const api = get(apiService);

    return {
      fetchUsers: async () => {
        state.loading = true;
        try {
          state.users = await api.getUsers();
        } finally {
          state.loading = false;
        }
      },
    };
  },
});
```

```ts
// stores/userStore.test.ts
import { describe, it, expect, vi } from "vitest";
import { container } from "storion";
import { userStore } from "./userStore";
import { apiService } from "../services/apiService";

describe("userStore", () => {
  it("should fetch users from API", async () => {
    // Create mock API
    const mockApi = {
      getUsers: vi.fn().mockResolvedValue([
        { id: "1", name: "Alice" },
        { id: "2", name: "Bob" },
      ]),
    };

    // Create container with mock
    const app = container();
    app.set(apiService, () => mockApi);

    // Get store instance (uses mock API)
    const instance = app.get(userStore);

    // Test action
    await instance.actions.fetchUsers();

    expect(mockApi.getUsers).toHaveBeenCalled();
    expect(instance.state.users).toHaveLength(2);
    expect(instance.state.users[0].name).toBe("Alice");
  });

  it("should set loading state during fetch", async () => {
    const mockApi = {
      getUsers: vi.fn().mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => resolve([]), 100);
        });
      }),
    };

    const app = container();
    app.set(apiService, () => mockApi);
    const instance = app.get(userStore);

    const promise = instance.actions.fetchUsers();

    // Check loading state immediately
    expect(instance.state.loading).toBe(true);

    await promise;

    // Check loading state after completion
    expect(instance.state.loading).toBe(false);
  });
});
```

### Testing Store-to-Store Communication

```ts
// stores/cartStore.ts
export const cartStore = store({
  name: "cart",
  state: { items: [] as CartItem[] },
  setup({ state, get }) {
    return {
      addItem: (product: Product) => {
        const [userState] = get(userStore);

        // Only premium users get discount
        const discount = userState.isPremium ? 0.1 : 0;

        state.items.push({
          ...product,
          discount,
        });
      },
    };
  },
});
```

```ts
// stores/cartStore.test.ts
describe("cartStore", () => {
  it("should apply discount for premium users", () => {
    const app = container();

    // Set up user as premium
    const userInstance = app.get(userStore);
    userInstance.actions.setPremium(true);

    // Add item to cart
    const cartInstance = app.get(cartStore);
    cartInstance.actions.addItem({ id: "1", name: "Product", price: 100 });

    expect(cartInstance.state.items[0].discount).toBe(0.1);
  });

  it("should not apply discount for regular users", () => {
    const app = container();

    // User is not premium by default
    const cartInstance = app.get(cartStore);
    cartInstance.actions.addItem({ id: "1", name: "Product", price: 100 });

    expect(cartInstance.state.items[0].discount).toBe(0);
  });
});
```

---

## Testing React Components

Use `@testing-library/react` with a test container.

### Test Wrapper Setup

```tsx
// test/renderWithStore.tsx
import { render, renderHook } from "@testing-library/react";
import { container, StoreProvider } from "storion/react";

export function renderWithStore(
  ui: React.ReactElement,
  options?: {
    container?: ReturnType<typeof container>;
  }
) {
  const stores = options?.container ?? container();

  return {
    ...render(<StoreProvider container={stores}>{ui}</StoreProvider>),
    stores,
  };
}

export function renderHookWithStore<T>(
  hook: () => T,
  options?: {
    container?: ReturnType<typeof container>;
  }
) {
  const stores = options?.container ?? container();

  return {
    ...renderHook(hook, {
      wrapper: ({ children }) => (
        <StoreProvider container={stores}>{children}</StoreProvider>
      ),
    }),
    stores,
  };
}
```

### Testing Components

```tsx
// components/Counter.test.tsx
import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithStore } from "../test/renderWithStore";
import { Counter } from "./Counter";

describe("Counter", () => {
  it("should display initial count", () => {
    renderWithStore(<Counter />);

    expect(screen.getByText("Count: 0")).toBeInTheDocument();
  });

  it("should increment count on button click", () => {
    renderWithStore(<Counter />);

    fireEvent.click(screen.getByRole("button", { name: /increment/i }));

    expect(screen.getByText("Count: 1")).toBeInTheDocument();
  });

  it("should share state between components", () => {
    const { stores } = renderWithStore(
      <>
        <Counter />
        <CounterDisplay />
      </>
    );

    // Click increment in Counter
    fireEvent.click(screen.getByRole("button", { name: /increment/i }));

    // Both components should show updated count
    expect(screen.getAllByText("1")).toHaveLength(2);
  });
});
```

### Testing useStore Hook

```tsx
// hooks/useCounter.test.tsx
import { describe, it, expect } from "vitest";
import { act } from "@testing-library/react";
import { renderHookWithStore } from "../test/renderWithStore";
import { useStore } from "storion/react";
import { counterStore } from "../stores/counterStore";

describe("useCounter", () => {
  it("should return count and actions", () => {
    const { result } = renderHookWithStore(() =>
      useStore(({ get }) => {
        const [state, actions] = get(counterStore);
        return { count: state.count, increment: actions.increment };
      })
    );

    expect(result.current.count).toBe(0);
    expect(typeof result.current.increment).toBe("function");
  });

  it("should update when state changes", () => {
    const { result } = renderHookWithStore(() =>
      useStore(({ get }) => {
        const [state, actions] = get(counterStore);
        return { count: state.count, increment: actions.increment };
      })
    );

    act(() => {
      result.current.increment();
    });

    expect(result.current.count).toBe(1);
  });
});
```

---

## Testing Async Operations

### Testing async.action()

```ts
// stores/userStore.test.ts
import { describe, it, expect, vi } from "vitest";
import { container } from "storion";
import { userStore } from "./userStore";

describe("userStore async", () => {
  it("should fetch user and update state", async () => {
    // Mock fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "1", name: "Alice" }),
    });

    const app = container();
    const instance = app.get(userStore);

    // Initially idle
    expect(instance.state.user.status).toBe("idle");

    // Start fetch
    const promise = instance.actions.fetchUser("1");

    // Should be pending
    expect(instance.state.user.status).toBe("pending");

    // Wait for completion
    await promise;

    // Should be success
    expect(instance.state.user.status).toBe("success");
    expect(instance.state.user.data).toEqual({ id: "1", name: "Alice" });
  });

  it("should handle fetch errors", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const app = container();
    const instance = app.get(userStore);

    await expect(instance.actions.fetchUser("1")).rejects.toThrow(
      "Network error"
    );

    expect(instance.state.user.status).toBe("error");
    expect(instance.state.user.error?.message).toBe("Network error");
  });

  it("should cancel previous request on new dispatch", async () => {
    let resolveFirst: () => void;
    let resolveSecond: () => void;

    global.fetch = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = () =>
              resolve({ ok: true, json: () => ({ id: "1" }) });
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecond = () =>
              resolve({ ok: true, json: () => ({ id: "2" }) });
          })
      );

    const app = container();
    const instance = app.get(userStore);

    // Start first fetch
    const first = instance.actions.fetchUser("1");

    // Start second fetch (should cancel first)
    const second = instance.actions.fetchUser("2");

    // Resolve second first
    resolveSecond!();
    await second;

    // State should reflect second request
    expect(instance.state.user.data?.id).toBe("2");
  });
});
```

### Testing async.mixin()

```tsx
// components/ContactForm.test.tsx
import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithStore } from "../test/renderWithStore";
import { ContactForm } from "./ContactForm";

describe("ContactForm", () => {
  it("should submit form and show success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    renderWithStore(<ContactForm />);

    // Fill form
    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Alice" },
    });
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: "alice@example.com" },
    });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    // Should show loading
    expect(screen.getByText(/submitting/i)).toBeInTheDocument();

    // Wait for success
    await waitFor(() => {
      expect(screen.getByText(/success/i)).toBeInTheDocument();
    });
  });

  it("should show error on failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Server error"));

    renderWithStore(<ContactForm />);

    fireEvent.change(screen.getByLabelText(/name/i), {
      target: { value: "Alice" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    await waitFor(() => {
      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
  });
});
```

---

## Testing Effects

```ts
// stores/syncStore.test.ts
import { describe, it, expect, vi } from "vitest";
import { container, effect } from "storion";
import { userStore } from "./userStore";

describe("effect", () => {
  it("should run when dependencies change", () => {
    const app = container();
    const instance = app.get(userStore);
    const callback = vi.fn();

    // Create effect that tracks user name
    const dispose = effect(() => {
      callback(instance.state.name);
    });

    // Effect runs immediately
    expect(callback).toHaveBeenCalledWith("");

    // Update name
    instance.actions.setName("Alice");

    // Effect runs again
    expect(callback).toHaveBeenCalledWith("Alice");
    expect(callback).toHaveBeenCalledTimes(2);

    // Cleanup
    dispose();

    // No more updates after dispose
    instance.actions.setName("Bob");
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
```

---

## Testing with Middleware

```ts
// middleware/logging.test.ts
import { describe, it, expect, vi } from "vitest";
import { container, store, forStores } from "storion";

describe("logging middleware", () => {
  it("should log state changes", () => {
    const logger = vi.fn();

    const loggingMiddleware = () => (ctx) => {
      const instance = ctx.next();

      // Log on state change
      instance.on("change", (event) => {
        logger(event.key, event.value);
      });

      return instance;
    };

    const counter = store({
      name: "counter",
      state: { count: 0 },
      setup: ({ state }) => ({
        increment: () => {
          state.count++;
        },
      }),
    });

    const app = container({
      middleware: forStores([loggingMiddleware()]),
    });

    const instance = app.get(counter);
    instance.actions.increment();

    expect(logger).toHaveBeenCalledWith("count", 1);
  });
});
```

---

## Testing Patterns

### Pattern 1: Arrange-Act-Assert

```ts
it("should calculate total with discount", () => {
  // Arrange
  const app = container();
  const cart = app.get(cartStore);
  cart.actions.addItem({ id: "1", price: 100 });
  cart.actions.addItem({ id: "2", price: 50 });

  // Act
  cart.actions.applyDiscount(10); // 10% discount

  // Assert
  expect(cart.state.total).toBe(135); // (100 + 50) * 0.9
});
```

### Pattern 2: Test Factories

```ts
// test/factories.ts
import { container } from "storion";
import { userStore } from "../stores/userStore";

export function createUserWithItems(itemCount: number) {
  const app = container();
  const user = app.get(userStore);

  user.actions.setName("Test User");

  for (let i = 0; i < itemCount; i++) {
    user.actions.addItem({ id: `item-${i}`, name: `Item ${i}` });
  }

  return { app, user };
}

// Usage
it("should calculate stats for user with items", () => {
  const { user } = createUserWithItems(5);

  expect(user.state.itemCount).toBe(5);
});
```

### Pattern 3: Snapshot Testing

```ts
it("should match store state snapshot", () => {
  const app = container();
  const instance = app.get(userStore);

  instance.actions.setProfile({
    name: "Alice",
    email: "alice@example.com",
    preferences: { theme: "dark" },
  });

  expect(instance.state).toMatchSnapshot();
});
```

### Pattern 4: Testing State Transitions

```ts
describe("order state machine", () => {
  it("should transition through states correctly", async () => {
    const app = container();
    const order = app.get(orderStore);

    // Initial state
    expect(order.state.status).toBe("draft");

    // Submit order
    await order.actions.submit();
    expect(order.state.status).toBe("pending");

    // Process payment
    await order.actions.processPayment();
    expect(order.state.status).toBe("paid");

    // Ship order
    await order.actions.ship();
    expect(order.state.status).toBe("shipped");

    // Complete delivery
    await order.actions.deliver();
    expect(order.state.status).toBe("delivered");
  });

  it("should not allow invalid transitions", async () => {
    const app = container();
    const order = app.get(orderStore);

    // Can't ship a draft order
    await expect(order.actions.ship()).rejects.toThrow(
      "Cannot ship order in draft status"
    );
  });
});
```

---

## Best Practices

### ✅ Do

```ts
// Create fresh container per test
it("test 1", () => {
  const app = container();
  // ...
});

it("test 2", () => {
  const app = container(); // Fresh container
  // ...
});

// Use dependency injection for external services
const app = container();
app.set(apiService, () => mockApi);

// Test behavior, not implementation
expect(instance.state.items).toHaveLength(3);

// Use meaningful assertions
expect(instance.state.user).toEqual({
  id: "1",
  name: "Alice",
  email: "alice@example.com",
});
```

### ❌ Don't

```ts
// Don't share container between tests
const app = container(); // Shared = test pollution!

it("test 1", () => {
  app.get(store).actions.increment();
});

it("test 2", () => {
  // State leaked from test 1!
});

// Don't test internal implementation
expect(instance._internalMethod).toBeCalled(); // Brittle

// Don't forget to await async operations
it("async test", () => {
  instance.actions.fetchData(); // Missing await!
  expect(instance.state.data).toBeDefined(); // May fail randomly
});
```

---

## Debugging Tests

### Enable Verbose Logging

```ts
// vite.config.ts
export default defineConfig({
  test: {
    reporters: ["verbose"],
  },
});
```

### Inspect State in Tests

```ts
it("debugging example", () => {
  const app = container();
  const instance = app.get(userStore);

  instance.actions.complexOperation();

  // Log state for debugging
  console.log("State:", JSON.stringify(instance.state, null, 2));

  expect(instance.state).toBeDefined();
});
```

### Use Vitest UI

```bash
pnpm vitest --ui
```

---

## See Also

- **[Dependency Injection](/guide/dependency-injection)** — Mock services easily
- **[Async](/guide/async)** — Testing async operations
- **[Effects](/guide/effects)** — Testing side effects
- **[container()](/api/container)** — Container API for test isolation
