# Network Connectivity

Storion provides a network module for managing connectivity state and handling network-aware retries.

## Installation

```ts
import { networkStore, networkService } from "storion/network";
```

## Checking Network Status

### In Store Setup

```ts
const dataStore = store({
  name: "data",
  state: { items: async.fresh<Item[]>() },
  setup({ get, focus }) {
    const [network] = get(networkStore);

    // Use *Query for read operations
    const itemsQuery = async.action(focus("items"), async (ctx) => {
      // Check network before fetching
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

### In React Component

```tsx
function NetworkBanner() {
  const { online } = useStore(({ get }) => {
    const [state] = get(networkStore);
    return { online: state.online };
  });

  if (online) return null;

  return (
    <div className="offline-banner">
      You are offline. Some features may be unavailable.
    </div>
  );
}
```

## Waiting for Connectivity

Use `waitForOnline()` to pause execution until the network is available:

```ts
const [network, networkActions] = get(networkStore);

// In an action
async function syncData() {
  await networkActions.waitForOnline();
  await uploadPendingChanges();
}
```

## Network-Aware Retry

### Using offlineRetry()

Use `networkService.offlineRetry()` to automatically retry on network reconnection:

```ts
import { abortable, retry } from "storion/async";
import { networkService } from "storion/network";

setup({ get, focus }) {
  const network = get(networkService);

  // Define abortable fetch function
  const fetchData = abortable(async ({ signal }) => {
    const res = await fetch("/api/data", { signal });
    return res.json();
  });

  // Chain wrappers: retry 3 times, then wait for network on error
  const robustFetch = fetchData
    .use(retry(3))
    .use(network.offlineRetry());

  // Use with async.action()
  const dataQuery = async.action(focus("data"), robustFetch);

  return { fetchData: dataQuery.dispatch };
}
```

### How offlineRetry() Works

When a network error occurs **and** the device is offline:
1. Waits for network reconnection
2. Retries the operation once

If the error is not a network error, or the device is online, it throws immediately.

## Customizing Network Detection

### Custom Ping Logic

Override `pingService` to check actual connectivity (not just browser's `navigator.onLine`):

```ts
import { container } from "storion";
import { pingService } from "storion/network";

container.set(pingService, () => ({
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

Override `onlineService` for React Native:

```ts
import NetInfo from "@react-native-community/netinfo";
import { container } from "storion";
import { onlineService } from "storion/network";

container.set(onlineService, () => ({
  isOnline: () => true, // Initial optimistic value
  subscribe: (listener) =>
    NetInfo.addEventListener((state) => {
      listener(!!state.isConnected);
    }),
}));
```

## Retry Strategies

Storion provides built-in retry strategies:

| Strategy | Delays |
|----------|--------|
| `backoff` | 1s, 2s, 4s, 8s... (max 30s) |
| `linear` | 1s, 2s, 3s, 4s... (max 30s) |
| `fixed` | 1s, 1s, 1s... |
| `fibonacci` | 1s, 1s, 2s, 3s, 5s, 8s... |
| `immediate` | 0, 0, 0... |

### Using Strategies with Wrappers

```ts
import { abortable, retry, retryStrategy } from "storion/async";

const fetchData = abortable(async ({ signal }) => {
  const res = await fetch("/api/data", { signal });
  return res.json();
});

// Retry 3 times with backoff
const robustFetch = fetchData.use(retry(3));

// Retry 5 times with fibonacci delay
const robustFetch2 = fetchData.use(retry({ count: 5, delay: "fibonacci" }));

// Add jitter to prevent thundering herd
const robustFetch3 = fetchData.use(retry({
  count: 3,
  delay: retryStrategy.withJitter(retryStrategy.backoff),
}));
```

### Combining Retry with Network Awareness

```ts
const network = get(networkService);

// Chain wrappers: retry first, then wait for network
const robustFetch = fetchData
  .use(retry(3))              // Retry non-network errors
  .use(network.offlineRetry()); // Wait for reconnection on network errors
```

## Complete Example

```tsx
import { store, useStore, trigger } from "storion/react";
import { async, abortable, retry } from "storion/async";
import { networkStore, networkService } from "storion/network";

// Define abortable API function
const fetchUsers = abortable(async ({ signal }) => {
  const res = await fetch("/api/users", { signal });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json() as Promise<User[]>;
});

// Store with network-aware async
const userStore = store({
  name: "user",
  state: {
    users: async.stale<User[]>([]),
  },
  setup({ get, focus }) {
    const network = get(networkService);

    // Wrap with retry and network-awareness
    const robustFetchUsers = fetchUsers
      .use(retry(3))
      .use(network.offlineRetry());

    // Use *Query for read operations
    const usersQuery = async.action(focus("users"), robustFetchUsers);

    return {
      fetchUsers: usersQuery.dispatch,
      refresh: usersQuery.refresh,
    };
  },
});

// Component with network status
function UserList() {
  const { users, online, fetchUsers } = useStore(({ get }) => {
    const [networkState] = get(networkStore);
    const [userState, userActions] = get(userStore);

    trigger(userActions.fetchUsers, []);

    return {
      users: userState.users,
      online: networkState.online,
      fetchUsers: userActions.fetchUsers,
    };
  });

  return (
    <div>
      {!online && <div className="warning">You are offline</div>}

      {users.status === "pending" && <Spinner />}
      {users.status === "error" && (
        <div>
          Error: {users.error.message}
          <button onClick={() => fetchUsers()}>Retry</button>
        </div>
      )}
      {users.data.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
}
```

## Best Practices

1. **Use stale mode for lists** - Keep showing previous data while refreshing
2. **Show offline indicator** - Let users know when they're offline
3. **Implement proper ping** - Don't rely solely on `navigator.onLine`
4. **Add jitter to retries** - Prevent thundering herd after reconnection
5. **Handle rate limits separately** - Use longer delays for rate limit errors
