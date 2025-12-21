# StoreProvider

React context provider that makes a container available to child components.

## Signature

```tsx
function StoreProvider(props: {
  container: Container;
  children: React.ReactNode;
}): JSX.Element
```

## Props

### container

The container instance to provide.

- **Type:** `Container`
- **Required:** Yes

### children

Child components that can access the container.

- **Type:** `React.ReactNode`
- **Required:** Yes

## Basic Example

```tsx
import { container } from 'storion';
import { StoreProvider } from 'storion/react';

const app = container();

function App() {
  return (
    <StoreProvider container={app}>
      <Header />
      <Main />
      <Footer />
    </StoreProvider>
  );
}
```

## With Middleware

```tsx
import { container } from 'storion';
import { StoreProvider } from 'storion/react';
import { devtoolsMiddleware } from 'storion/devtools';
import { persistMiddleware } from 'storion/persist';

const app = container({
  middleware: [
    devtoolsMiddleware({ maxHistory: 50 }),
    persistMiddleware({
      load: spec => JSON.parse(localStorage.getItem(`app:${spec.displayName}`) || 'null'),
      save: (spec, state) => localStorage.setItem(`app:${spec.displayName}`, JSON.stringify(state)),
    }),
  ],
});

function App() {
  return (
    <StoreProvider container={app}>
      <MyApp />
    </StoreProvider>
  );
}
```

## Multiple Providers

You can nest providers for different scopes:

```tsx
const globalApp = container();
const featureApp = container();

function App() {
  return (
    <StoreProvider container={globalApp}>
      <Header />
      
      {/* Feature-specific container */}
      <StoreProvider container={featureApp}>
        <FeatureModule />
      </StoreProvider>
      
      <Footer />
    </StoreProvider>
  );
}
```

## Testing

Create isolated containers for tests:

```tsx
import { render } from '@testing-library/react';
import { container } from 'storion';
import { StoreProvider } from 'storion/react';

function renderWithStore(ui: React.ReactElement) {
  const testContainer = container();
  
  return render(
    <StoreProvider container={testContainer}>
      {ui}
    </StoreProvider>
  );
}

test('counter increments', () => {
  const { getByRole } = renderWithStore(<Counter />);
  // ...
});
```

## Server-Side Rendering

Create a fresh container per request:

```tsx
// server.tsx
export function handleRequest(req: Request) {
  const app = container();
  
  // Pre-fetch data
  const [, userActions] = app.get(userStore);
  await userActions.fetchUser(req.userId);
  
  const html = renderToString(
    <StoreProvider container={app}>
      <App />
    </StoreProvider>
  );
  
  // Serialize state for hydration
  const state = {
    user: app.get(userStore)[0],
  };
  
  return `
    <html>
      <body>
        <div id="root">${html}</div>
        <script>window.__STATE__ = ${JSON.stringify(state)}</script>
      </body>
    </html>
  `;
}
```

## See Also

- [container()](/api/container) - Creating containers
- [useStore()](/api/use-store) - Accessing stores in components

