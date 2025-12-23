# Network Connectivity

Modern web apps need to handle network failures gracefully. Users go offline, connections drop, and APIs become unavailable. Storion provides a network module that makes your app resilient to these issues.

## The Problem

Network failures in traditional React apps often result in:

- Silent failures with no user feedback
- Stuck loading states
- Lost data when requests fail
- No automatic recovery when connection returns

Storion's network module provides:

- **Real-time connectivity status** — Know when you're online/offline
- **Automatic retry** — Retry failed requests with configurable strategies
- **Network-aware waiting** — Pause operations until connection returns
- **Customizable detection** — Override for React Native or custom ping logic

## Installation

```ts
import { networkStore, networkService } from "storion/network";
```

## Checking Network Status

### In Components

Display connectivity status to users:

```tsx
function NetworkBanner() {
  const { online } = useStore(({ get }) => {
    const [state] = get(networkStore);
    return { online: state.online };
  });

  if (online) return null;

  return (
    <div className="offline-banner">
      <span>⚠️</span> You are offline. Some features may be unavailable.
    </div>
  );
}
```

### In Store Setup

Check connectivity before making requests:

```ts
const dataStore = store({
  name: "data",
  state: { items: async.fresh<Item[]>() },
  setup({ get, focus }) {
    const [network] = get(networkStore);

    const itemsQuery = async.action(focus("items"), async (ctx) => {
      // Early exit if offline
      if (!network.online) {
        throw new Error("No network connection");
      }

      const res = await fetch("/api/items", { signal: ctx.signal });
      return res.json();
    });

    return { fetchItems: itemsQuery.dispatch };
  },
});
```

## Waiting for Connectivity

Use `waitForOnline()` to pause execution until the network is available:

```ts
const syncStore = store({
  name: "sync",
  state: { pendingChanges: [] },
  setup({ state, get }) {
    const [, networkActions] = get(networkStore);

    return {
      syncPendingChanges: async () => {
        // Wait until we're online
        await networkActions.waitForOnline();

        // Now safe to sync
        for (const change of state.pendingChanges) {
          await uploadChange(change);
        }
        state.pendingChanges = [];
      },
    };
  },
});
```

**Use cases:**

- Background sync when connection returns
- Queuing operations while offline
- Ensuring critical requests wait for connectivity

## Network-Aware Retry

### The offlineRetry() Wrapper

The `networkService.offlineRetry()` wrapper automatically waits for network reconnection before retrying:

```ts
import { abortable, retry } from "storion/async";
import { networkService } from "storion/network";

setup({ get, focus }) {
  const network = get(networkService);

  // Define your fetch function
  const fetchData = abortable(async ({ signal }) => {
    const res = await fetch("/api/data", { signal });
    return res.json();
  });

  // Chain wrappers: retry, then wait for network
  const robustFetch = fetchData
    .use(retry(3))              // Retry up to 3 times
    .use(network.offlineRetry()); // Wait for network on failure

  const dataQuery = async.action(focus("data"), robustFetch);

  return { fetchData: dataQuery.dispatch };
}
```

**How it works:**

1. Request fails
2. `retry(3)` retries up to 3 times with backoff
3. If still failing AND device is offline:
   - `offlineRetry()` waits for network reconnection
   - Retries once after reconnection
4. If device is online, error is thrown immediately (it's not a network issue)

### Retry Strategies

Storion provides built-in delay strategies:

| Strategy    | Delays                       | Best for                  |
| ----------- | ---------------------------- | ------------------------- |
| `backoff`   | 1s, 2s, 4s, 8s... (max 30s)  | Most API calls            |
| `linear`    | 1s, 2s, 3s, 4s... (max 30s)  | Gradual increase          |
| `fixed`     | 1s, 1s, 1s...                | Consistent intervals      |
| `fibonacci` | 1s, 1s, 2s, 3s, 5s, 8s...    | Moderate backoff          |
| `immediate` | 0, 0, 0...                   | Quick retries (use carefully) |

```ts
import { retry, retryStrategy } from "storion/async";

// Use named strategy
const robustFetch = fetchData.use(retry("backoff"));

// Custom retry options
const robustFetch = fetchData.use(
  retry({
    count: 5,
    delay: "fibonacci",
  })
);

// Add jitter to prevent thundering herd
const robustFetch = fetchData.use(
  retry({
    count: 3,
    delay: retryStrategy.withJitter(retryStrategy.backoff),
  })
);
```

### Combining Retry Strategies

Order matters when chaining wrappers:

```ts
const network = get(networkService);

// Recommended order: retry first, then network awareness
const robustFetch = fetchData
  .use(retry(3)) // 1. Retry transient errors
  .use(network.offlineRetry()); // 2. Wait for network if still failing

// The chain handles:
// - Transient server errors (retry handles these)
// - Network disconnection (offlineRetry waits and retries)
```

## Customizing Network Detection

### Custom Ping Logic

By default, Storion uses `navigator.onLine`. This can be unreliable (it only checks if there's a network interface, not actual connectivity). Override with custom ping:

```ts
import { container } from "storion";
import { pingService } from "storion/network";

const app = container();

app.set(pingService, () => ({
  ping: async () => {
    try {
      const res = await fetch("/api/health", {
        method: "HEAD",
        cache: "no-store",
      });
      return res.ok;
    } catch {
      return false;
    }
  },
}));
```

### React Native Support

React Native doesn't have `navigator.onLine`. Override `onlineService`:

```ts
import NetInfo from "@react-native-community/netinfo";
import { container } from "storion";
import { onlineService } from "storion/network";

const app = container();

app.set(onlineService, () => ({
  isOnline: () => true, // Optimistic initial value
  subscribe: (listener) =>
    NetInfo.addEventListener((state) => {
      listener(!!state.isConnected);
    }),
}));
```

## Complete Example

Here's a full example showing all network features working together:

```tsx
import { store, useStore, trigger } from "storion/react";
import { async, abortable, retry, timeout } from "storion/async";
import { networkStore, networkService } from "storion/network";

// API function with signal support
const fetchUsers = abortable(async ({ signal }) => {
  const res = await fetch("/api/users", { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<User[]>;
});

// Store with network-aware async
const userStore = store({
  name: "users",
  state: {
    users: async.stale<User[]>([]),
  },
  setup({ get, focus }) {
    const network = get(networkService);

    // Build robust fetch with all wrappers
    const robustFetch = fetchUsers
      .use(timeout(10000)) // 10s timeout
      .use(retry(3)) // Retry 3 times
      .use(network.offlineRetry()); // Wait for network

    const usersQuery = async.action(focus("users"), robustFetch);

    return {
      fetchUsers: usersQuery.dispatch,
      refresh: usersQuery.refresh,
    };
  },
});

// Component with network awareness
function UserList() {
  const { users, online, fetchUsers } = useStore(({ get }) => {
    const [networkState] = get(networkStore);
    const [userState, userActions] = get(userStore);

    // Auto-fetch on mount
    trigger(userActions.fetchUsers, []);

    return {
      users: userState.users,
      online: networkState.online,
      fetchUsers: userActions.fetchUsers,
    };
  });

  return (
    <div>
      {/* Offline indicator */}
      {!online && (
        <div className="warning">
          ⚠️ You are offline. Showing cached data.
        </div>
      )}

      {/* Loading state */}
      {users.status === "pending" && <Spinner />}

      {/* Error state with retry */}
      {users.status === "error" && (
        <div className="error">
          Failed to load users: {users.error.message}
          <button onClick={() => fetchUsers()}>Retry</button>
        </div>
      )}

      {/* User list (works in stale mode even while loading) */}
      <ul>
        {users.data.map((user) => (
          <li key={user.id}>{user.name}</li>
        ))}
      </ul>
    </div>
  );
}
```

## Best Practices

### 1. Use Stale Mode for Lists

Keep showing previous data while refreshing:

```ts
state: {
  users: async.stale<User[]>([]),  // Shows [] initially, then previous data
}
```

### 2. Show Offline Indicators

Let users know when they're offline:

```tsx
{!online && <OfflineBanner />}
```

### 3. Implement Proper Ping

Don't rely solely on `navigator.onLine`:

```ts
app.set(pingService, () => ({
  ping: () => fetch("/api/health").then((r) => r.ok).catch(() => false),
}));
```

### 4. Add Jitter to Retries

Prevent thundering herd after reconnection:

```ts
retry({
  count: 3,
  delay: retryStrategy.withJitter(retryStrategy.backoff),
});
```

### 5. Queue Offline Operations

Store operations to sync later:

```ts
if (!network.online) {
  state.pendingOperations.push(operation);
  return;
}
```

## Next Steps

- **[Network Layer Guide](/guide/network-layer)** — Building a complete network service
- **[Abortable Functions](/api/abortable)** — All available wrappers
- **[Async State](/guide/async)** — Loading and error states
