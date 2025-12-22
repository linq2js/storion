# Network Module

Platform-agnostic network connectivity management with retry support.

## Installation

```ts
import {
  networkStore,
  networkRetryService,
  pingService,
  onlineService,
  isNetworkError,
  retryStrategy,
} from "storion/network";
```

## networkStore

Reactive store for network connectivity state.

### State

```ts
interface NetworkState {
  /** Whether the network is currently online */
  online: boolean;
}
```

### Actions

```ts
interface NetworkActions {
  /** Returns a promise that resolves when online */
  waitForOnline(): Promise<void>;
}
```

### Usage

```ts
// In store setup
setup({ get }) {
  const [network, networkActions] = get(networkStore);

  // Check current status
  if (network.online) {
    // Online
  }

  // Wait for connectivity
  await networkActions.waitForOnline();
}

// In React component
function NetworkIndicator() {
  const { online } = useStore(({ get }) => {
    const [state] = get(networkStore);
    return { online: state.online };
  });

  return online ? "🟢 Online" : "🔴 Offline";
}
```

## networkRetryService

Service that wraps functions to wait for network reconnection on errors.

### Interface

```ts
interface NetworkRetryService {
  /** Wrap a single function */
  wrap<TArgs extends any[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>
  ): (...args: TArgs) => Promise<TReturn>;

  /** Wrap multiple functions */
  wrap<TMap extends Record<string, AsyncFn>>(map: TMap): TMap;

  /** Call a function immediately with network retry */
  call<TArgs extends any[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    ...args: TArgs
  ): Promise<TReturn>;

  /** Get a delay function for async retry option */
  delay(
    strategy?: RetryStrategyName | AsyncRetryDelayFn
  ): AsyncRetryDelayFn;

  /** Wait for reconnection if error is network-related */
  waitIfOffline(error: unknown): Promise<void>;
}
```

### Usage

```ts
setup({ get, focus }) {
  const networkRetry = get(networkRetryService);

  // Wrap API calls
  const api = networkRetry.wrap({
    getUser: (id: string) => fetch(`/api/users/${id}`).then((r) => r.json()),
    getPosts: () => fetch("/api/posts").then((r) => r.json()),
  });

  // Use with async() for full retry strategy
  const userAsync = async(focus("user"), api.getUser, {
    retry: "backoff",
  });

  // Or use delay() for network-aware retry
  const dataAsync = async(focus("data"), fetchData, {
    retry: networkRetry.delay("backoff"),
  });

  return {
    fetchUser: userAsync.dispatch,
    // Direct call with retry
    quickFetch: (url: string) => networkRetry.call(fetch, url),
  };
}
```

### wrap()

Wraps functions to automatically retry on network reconnection.

```ts
// Single function
const fetchWithRetry = networkRetry.wrap((url: string) =>
  fetch(url).then((r) => r.json())
);

// Multiple functions
const api = networkRetry.wrap({
  getUser: (id: string) => fetch(`/api/users/${id}`).then((r) => r.json()),
  getPosts: () => fetch("/api/posts").then((r) => r.json()),
});

const user = await api.getUser("123");
```

### call()

Call a function immediately with network retry logic.

```ts
const data = await networkRetry.call(fetch, "/api/data").then((r) => r.json());
```

### delay()

Get a delay function that waits for network reconnection on network errors.

```ts
// Use with async() retry option
const dataAsync = async(focus("data"), fetchData, {
  retry: networkRetry.delay("backoff"),
});

// With custom delay for non-network errors
const dataAsync = async(focus("data"), fetchData, {
  retry: networkRetry.delay((attempt) => attempt * 1000),
});
```

### waitIfOffline()

Wait for network reconnection if the error is network-related.

```ts
try {
  await fetchData();
} catch (error) {
  await networkRetry.waitIfOffline(error);
  // Retry after reconnection
  await fetchData();
}
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

## retryStrategy

Built-in retry delay strategies. Re-exported from `storion/async`.

```ts
const retryStrategy = {
  /** Exponential backoff: 1s, 2s, 4s, 8s... (max 30s) */
  backoff: (attempt: number) => number,

  /** Linear: 1s, 2s, 3s, 4s... (max 30s) */
  linear: (attempt: number) => number,

  /** Fixed 1 second delay */
  fixed: () => 1000,

  /** Fibonacci: 1s, 1s, 2s, 3s, 5s, 8s... (max 30s) */
  fibonacci: (attempt: number) => number,

  /** Immediate retry (no delay) */
  immediate: () => 0,

  /** Add jitter (±30%) to any strategy */
  withJitter: (strategy: (n: number) => number) => (attempt: number) => number,
};
```

### Usage with async()

```ts
// Use strategy name directly
async(focus("data"), fetchData, { retry: "backoff" });

// Use strategy with count
async(focus("data"), fetchData, {
  retry: { count: 5, delay: "fibonacci" },
});

// Add jitter to reduce thundering herd
async(focus("data"), fetchData, {
  retry: {
    count: 3,
    delay: retryStrategy.withJitter(retryStrategy.backoff),
  },
});
```

## Type Exports

```ts
import type {
  PingService,
  OnlineService,
  NetworkRetryService,
} from "storion/network";

import type { RetryStrategyName, AsyncRetryDelayFn } from "storion/async";
```

