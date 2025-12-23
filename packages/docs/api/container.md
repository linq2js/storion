# container()

Creates a dependency injection container that manages store instances and services.

## Signature

```ts
function container(options?: ContainerOptions): Container;
```

## Options

### middleware

Array of middleware functions applied to all stores/services.

- **Type:** `Middleware[]`
- **Default:** `[]`

## Container Methods

### get()

Retrieves or creates a store/service instance.

```ts
// Store: returns full StoreInstance
const instance = container.get(myStore);
instance.state; // Reactive state
instance.actions; // Bound actions

// Service: returns the service directly
const service = container.get(myService);
```

::: tip Tuple Destructuring
The `[state, actions]` tuple syntax is available inside `setup()` and `useStore()`:

```ts
const [state, actions] = get(myStore); // Inside setup/useStore
```

:::

### dispose()

Disposes all managed instances and cleans up subscriptions.

```ts
container.dispose();
```

## Static Methods

### container.defaults()

Sets default options for all new containers.

```ts
container.defaults({
  pre: [devtoolsMiddleware()], // Applied before user middleware
  post: [loggerMiddleware()], // Applied after user middleware
});
```

## Example

```ts
import { container } from "storion";
import { devtoolsMiddleware } from "storion/devtools";
import { persist } from "storion/persist";

// Create container with middleware
const app = container({
  middleware: [
    devtoolsMiddleware({ maxHistory: 50 }),
    persist({
      load: (spec) => localStorage.getItem(`app:${spec.displayName}`),
      save: (spec, state) =>
        localStorage.setItem(`app:${spec.displayName}`, JSON.stringify(state)),
    }),
  ],
});

// Get store instances
const [userState, userActions] = app.get(userStore);
const [cartState, cartActions] = app.get(cartStore);

// Clean up
app.dispose();
```

## React Integration

Use `StoreProvider` to make a container available to React components:

```tsx
import { StoreProvider } from "storion/react";

function App() {
  return (
    <StoreProvider container={app}>
      <MyApp />
    </StoreProvider>
  );
}
```

## See Also

- [store()](/api/store) - Create store specifications
- [StoreProvider](/api/store-provider) - React provider
- [persist()](/api/persist-middleware) - Persistence middleware
