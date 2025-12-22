# Network Connectivity

Storion provides a network module for managing connectivity state and handling network-aware retries.

## Installation

```ts
import { networkStore, networkRetryService } from "storion/network";
```

## Checking Network Status

### In Store Setup

```ts
const dataStore = store({
  name: "data",
  state: { items: async.fresh<Item[]>() },
  setup({ get, focus }) {
    const [network] = get(networkStore);

    const itemsAsync = async(focus("items"), async (ctx) => {
      // Check network before fetching
      if (!network.online) {
        throw new Error("No network connection");
      }
      const res = await fetch("/api/items", { signal: ctx.signal });
      return res.json();
    });

    return { fetchItems: itemsAsync.dispatch };
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

### Basic Retry with Network Awareness

Use `networkRetryService.delay()` to create a retry function that waits for reconnection:

```ts
setup({ get, focus }) {
  const networkRetry = get(networkRetryService);

  const dataAsync = async(focus("data"), fetchData, {
    // Waits for reconnection on network errors, uses backoff for other errors
    retry: networkRetry.delay("backoff"),
  });

  return { fetchData: dataAsync.dispatch };
}
```

### Wrapping API Functions

Wrap your API functions to automatically retry on network reconnection:

```ts
setup({ get, focus }) {
  const networkRetry = get(networkRetryService);

  // Wrap all API calls
  const api = networkRetry.wrap({
    getUsers: () => fetch("/api/users").then((r) => r.json()),
    getUser: (id: string) => fetch(`/api/users/${id}`).then((r) => r.json()),
    createUser: (data: User) =>
      fetch("/api/users", {
        method: "POST",
        body: JSON.stringify(data),
      }).then((r) => r.json()),
  });

  // Use wrapped functions with async()
  const usersAsync = async(focus("users"), api.getUsers);

  return {
    fetchUsers: usersAsync.dispatch,
    createUser: api.createUser,
  };
}
```

### Manual Network Error Handling

```ts
async function submitForm(data: FormData) {
  const networkRetry = get(networkRetryService);

  try {
    return await api.submit(data);
  } catch (error) {
    // Wait for reconnection if offline
    await networkRetry.waitIfOffline(error);
    // Retry once after reconnection
    return await api.submit(data);
  }
}
```

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

### Using Strategies

```ts
import { retryStrategy } from "storion/async";

// Use by name
async(focus("data"), handler, { retry: "backoff" });

// Use with custom count
async(focus("data"), handler, {
  retry: { count: 5, delay: "fibonacci" },
});

// Add jitter to prevent thundering herd
async(focus("data"), handler, {
  retry: {
    count: 3,
    delay: retryStrategy.withJitter(retryStrategy.backoff),
  },
});
```

### Network-Aware Strategies

Combine network detection with retry strategies:

```ts
const networkRetry = get(networkRetryService);

// Network errors: wait for reconnection
// Other errors: use backoff strategy
async(focus("data"), handler, {
  retry: networkRetry.delay("backoff"),
});

// Custom handling for different error types
async(focus("data"), handler, {
  retry: networkRetry.delay((attempt, error) => {
    if (error.message.includes("rate limit")) {
      return 60000; // Wait 1 minute for rate limits
    }
    return retryStrategy.backoff(attempt);
  }),
});
```

## Complete Example

```tsx
import { store, useStore, trigger } from "storion/react";
import { async } from "storion/async";
import { networkStore, networkRetryService } from "storion/network";

// Store with network-aware async
const userStore = store({
  name: "user",
  state: {
    users: async.stale<User[]>([]),
  },
  setup({ get, focus }) {
    const networkRetry = get(networkRetryService);

    const usersAsync = async(
      focus("users"),
      async (ctx) => {
        const res = await fetch("/api/users", { signal: ctx.signal });
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json();
      },
      {
        retry: networkRetry.delay("backoff"),
      }
    );

    return {
      fetchUsers: usersAsync.dispatch,
      refresh: usersAsync.refresh,
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

