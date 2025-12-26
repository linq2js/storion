# StoreProvider

`StoreProvider` is a React context provider that makes a container available to all child components.

## Overview

```tsx
import { container } from "storion";
import { StoreProvider } from "storion/react";

const app = container();

function App() {
  return (
    <StoreProvider container={app}>
      <MyApp />
    </StoreProvider>
  );
}
```

## Why Use StoreProvider?

`StoreProvider` is **required** for [`useStore()`](/api/use-store) to work. Without a provider, `useStore()` will throw an error:

```tsx
// ❌ Error - "No StoreProvider found"
function App() {
  return <Counter />; // useStore inside Counter will throw!
}

// ✅ Works - components wrapped with StoreProvider
function App() {
  return (
    <StoreProvider container={app}>
      <Counter />
    </StoreProvider>
  );
}
```

With a provider, all components share the same container:

```tsx
// ✅ With provider - shared stores
<StoreProvider container={app}>
  <Counter /> {/* Same counter */}
  <Counter /> {/* Same counter */}
</StoreProvider>
```

::: info One App, One StoreProvider
Ideally, your app should have **one `StoreProvider` at the root**. Only use multiple providers if you have specific use cases like:

- Super/universal apps where each sub-app has its own business logic
- Different middleware configurations per container
- Complete isolation between app sections
  :::

## Basic Setup

### 1. Create the Container

```tsx
// app/container.ts
import { container } from "storion";
import { devtoolsMiddleware } from "storion/devtools";
import { persist } from "storion/persist";

export const app = container({
  middleware: [
    devtoolsMiddleware(),
    persist({
      load: (spec) => localStorage.getItem(`app:${spec.displayName}`),
      save: (spec, state) =>
        localStorage.setItem(`app:${spec.displayName}`, JSON.stringify(state)),
    }),
  ],
});
```

### 2. Wrap Your App

```tsx
// app/index.tsx
import { StoreProvider } from "storion/react";
import { app } from "./container";

function App() {
  return (
    <StoreProvider container={app}>
      <Router>
        <Header />
        <Main />
        <Footer />
      </Router>
    </StoreProvider>
  );
}
```

### 3. Use Stores in Components

```tsx
// components/Header.tsx
import { useStore } from "storion/react";
import { userStore } from "../stores/user";

function Header() {
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore);
    return { name: state.name };
  });

  return <header>Welcome, {name}</header>;
}
```

## Multiple Providers

::: warning Advanced Use Case
Multiple providers are an advanced pattern. Most apps only need one `StoreProvider` at the root. Only use multiple providers when you have specific requirements like different middleware per container.
:::

### Feature Isolation with Different Middleware

Use separate containers when features need different middleware configurations:

```tsx
const globalContainer = container({
  middleware: [devtoolsMiddleware()],
});

const analyticsContainer = container({
  middleware: [analyticsMiddleware()], // Different middleware
});

function App() {
  return (
    <StoreProvider container={globalContainer}>
      <Header />

      {/* Analytics feature has its own middleware */}
      <StoreProvider container={analyticsContainer}>
        <AnalyticsModule />
      </StoreProvider>

      <Footer />
    </StoreProvider>
  );
}
```

## Server-Side Rendering

### Per-Request Container

Create a fresh container for each request:

```tsx
// server.tsx
import { renderToString } from "react-dom/server";
import { container } from "storion";
import { StoreProvider } from "storion/react";

export async function handleRequest(req: Request) {
  // Fresh container per request
  const app = container();

  // Pre-fetch data using store instance
  const userInstance = app.get(userStore);
  await userInstance.actions.fetchUser(req.userId);

  // Render
  const html = renderToString(
    <StoreProvider container={app}>
      <App />
    </StoreProvider>
  );

  // Serialize state for hydration
  const initialState = {
    user: app.get(userStore).state,
  };

  return `
    <!DOCTYPE html>
    <html>
      <body>
        <div id="root">${html}</div>
        <script>
          window.__INITIAL_STATE__ = ${JSON.stringify(initialState)}
        </script>
      </body>
    </html>
  `;
}
```

### Client Hydration

```tsx
// client.tsx
import { hydrateRoot } from "react-dom/client";
import { container } from "storion";
import { StoreProvider } from "storion/react";

const app = container();

// Hydrate stores with server state
if (window.__INITIAL_STATE__) {
  const userInstance = app.get(userStore);
  userInstance.hydrate(window.__INITIAL_STATE__.user);
}

hydrateRoot(
  document.getElementById("root"),
  <StoreProvider container={app}>
    <App />
  </StoreProvider>
);
```

## Testing

### Test Utilities

```tsx
// test/utils.tsx
import { render } from "@testing-library/react";
import { container } from "storion";
import { StoreProvider } from "storion/react";

export function renderWithStore(
  ui: React.ReactElement,
  options?: { container?: Container }
) {
  const testContainer = options?.container ?? container();

  return {
    ...render(<StoreProvider container={testContainer}>{ui}</StoreProvider>),
    container: testContainer,
  };
}
```

### Using in Tests

```tsx
import { renderWithStore } from "./utils";
import { counterStore } from "../stores/counter";

describe("Counter", () => {
  it("increments count", async () => {
    const { getByRole, container } = renderWithStore(<Counter />);

    // Get store instance for assertions
    const counterInstance = container.get(counterStore);
    expect(counterInstance.state.count).toBe(0);

    // Click increment
    fireEvent.click(getByRole("button", { name: /increment/i }));

    expect(counterInstance.state.count).toBe(1);
  });
});
```

### Pre-populated State

```tsx
it("shows user name", () => {
  const testContainer = container();

  // Pre-populate store
  const userInstance = testContainer.get(userStore);
  userInstance.hydrate({ name: "Test User", email: "test@example.com" });

  const { getByText } = renderWithStore(<UserProfile />, {
    container: testContainer,
  });

  expect(getByText("Test User")).toBeInTheDocument();
});
```

## Accessing Container Outside React

For code outside React components (e.g., API interceptors), import the container directly:

```tsx
import { app } from "./container";

// API interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const authInstance = app.get(authStore);
      authInstance.actions.logout();
    }
    return Promise.reject(error);
  }
);
```

## Framework Integration

### Next.js App Router

```tsx
// app/providers.tsx
"use client";

import { StoreProvider } from "storion/react";
import { app } from "./container";

export function Providers({ children }: { children: React.ReactNode }) {
  return <StoreProvider container={app}>{children}</StoreProvider>;
}

// app/layout.tsx
import { Providers } from "./providers";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

### Remix

```tsx
// app/root.tsx
import { container } from "storion";
import { StoreProvider } from "storion/react";

const app = container();

export default function App() {
  return (
    <html>
      <body>
        <StoreProvider container={app}>
          <Outlet />
        </StoreProvider>
      </body>
    </html>
  );
}
```

### Vite

```tsx
// src/main.tsx
import { createRoot } from "react-dom/client";
import { container } from "storion";
import { StoreProvider } from "storion/react";
import App from "./App";

const app = container();

createRoot(document.getElementById("root")!).render(
  <StoreProvider container={app}>
    <App />
  </StoreProvider>
);
```

## Best Practices

### 1. Single Root Provider

```tsx
// ✅ Good - one provider at root
function App() {
  return (
    <StoreProvider container={app}>
      <Router />
    </StoreProvider>
  );
}

// ❌ Avoid - multiple providers without reason
function App() {
  return (
    <StoreProvider container={app}>
      <Header />
      <StoreProvider container={app}>
        {" "}
        {/* Unnecessary! */}
        <Main />
      </StoreProvider>
    </StoreProvider>
  );
}
```

### 2. Container Outside Component

```tsx
// ✅ Good - container created once at module level
const app = container();

function App() {
  return (
    <StoreProvider container={app}>
      <MyApp />
    </StoreProvider>
  );
}

// ❌ Avoid - new container every render
function App() {
  const app = container(); // Creates new container each render!
  return (
    <StoreProvider container={app}>
      <MyApp />
    </StoreProvider>
  );
}
```

::: tip No Cleanup Needed
When the container is created outside the component (at module level), it lives for the app's entire lifetime. No cleanup is needed - it will be garbage collected when the app closes.
:::

## Troubleshooting

### "No StoreProvider found"

Ensure your component is inside a provider:

```tsx
// ❌ Error - no provider
function App() {
  return <Counter />; // Error!
}

// ✅ Fixed
function App() {
  return (
    <StoreProvider container={app}>
      <Counter />
    </StoreProvider>
  );
}
```

### State Not Shared

Check you're using the same container:

```tsx
// ❌ Different containers = different state
<StoreProvider container={container()}>
  <A />
</StoreProvider>
<StoreProvider container={container()}>
  <B /> {/* Different state than A! */}
</StoreProvider>

// ✅ Same container = shared state
const app = container();

<StoreProvider container={app}>
  <A />
  <B /> {/* Same state as A */}
</StoreProvider>
```

## Understanding get() Return Values

::: warning Important Distinction
The `get()` function returns different types depending on where it's used:

| Context                 | Usage                  | Returns                                            |
| ----------------------- | ---------------------- | -------------------------------------------------- |
| `container.get(store)`  | Outside React          | `StoreInstance` (object with `.state`, `.actions`) |
| Selector's `get(store)` | Inside `useStore()`    | `[state, actions]` tuple                           |
| Setup's `get(store)`    | Inside store `setup()` | `[state, actions]` tuple                           |

:::

```tsx
// ❌ WRONG - container.get() returns StoreInstance, not tuple
const [state, actions] = app.get(userStore);

// ✅ CORRECT - container.get() returns StoreInstance
const userInstance = app.get(userStore);
userInstance.state.name;
userInstance.actions.setName("John");

// ✅ CORRECT - selector's get() returns tuple
const { name } = useStore(({ get }) => {
  const [state, actions] = get(userStore);
  return { name: state.name };
});
```

## Next Steps

- **[useStore](/guide/react/use-store)** — Using stores in components
- **[withStore](/guide/react/with-store)** — HOC pattern
- **[StoreProvider API](/api/store-provider)** — Complete API reference
