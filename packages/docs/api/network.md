# Network Module

Platform-agnostic network connectivity management with retry support.

## Installation

```ts
import {
  networkStore,
  networkService,
  pingService,
  onlineService,
  isNetworkError,
} from "storion/network";
```

## Architecture

The network module separates concerns:

- **`networkService`** — Owns all logic (online detection, waiting, retry wrapper)
- **`networkStore`** — Provides reactive state for React components (syncs from service)

```
┌─────────────────────────────────────────────────────────────────┐
│  networkService (owns logic)                                     │
│  - isOnline(), subscribe(), waitForOnline(), offlineRetry()     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ syncs state
┌─────────────────────────────────────────────────────────────────┐
│  networkStore (reactive state for React)                         │
│  - state.online                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## networkStore

Reactive store for network connectivity state in React components.

### State

```ts
interface NetworkState {
  /** Whether the network is currently online */
  online: boolean;
}
```

### Usage

```tsx
// In React component - use store for reactive UI
function NetworkIndicator() {
  const { online } = useStore(({ get }) => {
    const [state] = get(networkStore);
    return { online: state.online };
  });

  return online ? "🟢 Online" : "🔴 Offline";
}

// Check status in store setup
setup({ get }) {
  const [network] = get(networkStore);
  if (network.online) {
    // ...
  }
}
```

::: tip
For logic like `waitForOnline()` and `offlineRetry()`, use `networkService` directly.
:::

## networkService

Service that provides network detection and retry logic.

### Interface

```ts
interface NetworkService {
  /** Check if currently online */
  isOnline(): boolean;

  /** Subscribe to online/offline state changes */
  subscribe(listener: (online: boolean) => void): VoidFunction;

  /** Returns a promise that resolves when online */
  waitForOnline(): Promise<void>;

  /** AbortableWrapper that retries on network reconnection */
  offlineRetry(): IdentityWrapper;

  /** Cleanup subscriptions */
  dispose(): void;
}
```

### Usage

```ts
import { abortable, retry } from "storion/async";
import { networkService } from "storion/network";

setup({ get, focus }) {
  const network = get(networkService);

  // Check online status
  if (network.isOnline()) {
    // ...
  }

  // Wait for connectivity
  await network.waitForOnline();

  // Define abortable function
  const fetchUsers = abortable(async ({ signal }) => {
    const res = await fetch("/api/users", { signal });
    return res.json();
  });

  // Chain wrappers: retry first, then wait for network
  const robustFetch = fetchUsers
    .use(retry(3))
    .use(network.offlineRetry());

  // Use with async.action()
  const usersQuery = async.action(focus("users"), robustFetch);

  return { fetchUsers: usersQuery.dispatch };
}
```

### waitForOnline()

Returns a promise that resolves when online. If already online, resolves immediately.

```ts
const network = get(networkService);

// Wait before making request
await network.waitForOnline();
await uploadData();

// Multiple waiters share the same promise
const promise1 = network.waitForOnline();
const promise2 = network.waitForOnline();
// promise1 === promise2
```

### offlineRetry()

Returns an `AbortableWrapper` for use with `.use()` pattern.

**Behavior:**
- Executes the function normally
- On network error **while offline**: waits for reconnection, then retries once
- On network error **while online**: throws immediately (already online, nothing to wait for)
- On non-network error: throws immediately

```ts
const network = get(networkService);

// Basic usage
const robustFetch = fetchData.use(network.offlineRetry());

// Combined with retry wrapper (recommended)
const veryRobust = fetchData
  .use(retry(3))              // Retry on any error up to 3 times
  .use(network.offlineRetry()); // If still failing and offline, wait for reconnection
```

## pingService

Service for checking actual network reachability.

### Interface

```ts
interface PingService {
  /** Check if network is reachable */
  ping(): Promise<boolean>;
}
```

### Default Behavior

- 300ms delay
- Always returns `true` (optimistic)

### Override for Real Connectivity Check

```ts
import { container } from "storion";
import { pingService } from "storion/network";

container.set(pingService, () => ({
  ping: async () => {
    try {
      await fetch("/api/health", { method: "HEAD" });
      return true;
    } catch {
      return false;
    }
  },
}));
```

## onlineService

Service for online/offline event subscription.

### Interface

```ts
interface OnlineService {
  /** Get current online status */
  isOnline(): boolean;

  /** Subscribe to online/offline events */
  subscribe(listener: (online: boolean) => void): VoidFunction;
}
```

### Default Behavior

- Uses `navigator.onLine` for initial status
- Subscribes to `window` `online`/`offline` events

### Override for React Native

```ts
import NetInfo from "@react-native-community/netinfo";
import { container } from "storion";
import { onlineService } from "storion/network";

container.set(onlineService, () => ({
  isOnline: () => true,
  subscribe: (listener) =>
    NetInfo.addEventListener((state) => listener(!!state.isConnected)),
}));
```

## isNetworkError()

Check if an error is a network connectivity error.

```ts
function isNetworkError(error: unknown): boolean;
```

### Detected Errors

| Environment | Error Type | Detection |
|-------------|-----------|-----------|
| All | Browser offline | `navigator.onLine === false` |
| Apollo Client | ApolloError | Checks `error.networkError` recursively |
| Chrome | TypeError | `"failed to fetch"` |
| Firefox | TypeError | `"networkerror"` |
| Safari | TypeError | `"load failed"` |
| All | DOMException | `NetworkError`, `TimeoutError`, `AbortError` |
| Node.js/RN | Error codes | `ENOTFOUND`, `ECONNREFUSED`, `ETIMEDOUT`, `ENETUNREACH` |

### Usage

```ts
// With fetch
try {
  await fetch("/api/data");
} catch (error) {
  if (isNetworkError(error)) {
    // Handle network error
    showOfflineMessage();
  } else {
    // Handle other errors
    throw error;
  }
}

// With Apollo Client
try {
  await client.query({ query: GET_USER });
} catch (error) {
  if (isNetworkError(error)) {
    // Works! Detects ApolloError with networkError
    showOfflineMessage();
  }
}
```

## Type Exports

```ts
import type {
  PingService,
  OnlineService,
  NetworkService,
} from "storion/network";
```
