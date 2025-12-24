# Core Concepts

Storion is built on four core concepts that work together: **Stores**, **Containers**, **Services**, and **Reactivity**. Understanding how they interact is key to using Storion effectively.

**Time to read:** ~15 minutes

---

## Architecture Overview

Here's how the pieces fit together:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CONTAINER                                       │
│                        (Instance Management Hub)                             │
│                                                                              │
│   ┌──────────────────────────────────────────────────────────────────────┐  │
│   │                           STORES (Reactive)                           │  │
│   │                                                                        │  │
│   │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │  │
│   │  │ userStore   │←───│ cartStore   │    │ uiStore     │               │  │
│   │  │             │    │             │    │             │               │  │
│   │  │  state:     │    │  state:     │    │  state:     │               │  │
│   │  │    profile  │    │    items    │    │    theme    │               │  │
│   │  │    token    │    │    total    │    │    modal    │               │  │
│   │  │             │    │             │    │             │               │  │
│   │  │  actions:   │    │  actions:   │    │  actions:   │               │  │
│   │  │    login    │    │    add      │    │    toggle   │               │  │
│   │  │    logout   │    │    checkout │    │    setTheme │               │  │
│   │  └─────────────┘    └─────────────┘    └─────────────┘               │  │
│   │         ↑                  ↑                                          │  │
│   └─────────┼──────────────────┼──────────────────────────────────────────┘  │
│             │                  │                                             │
│   ┌─────────┼──────────────────┼──────────────────────────────────────────┐  │
│   │         ↓                  ↓           SERVICES (Non-reactive)        │  │
│   │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐               │  │
│   │  │ apiService  │    │ authService │    │ logService  │               │  │
│   │  │             │    │             │    │             │               │  │
│   │  │  get()      │    │  getToken() │    │  info()     │               │  │
│   │  │  post()     │    │  refresh()  │    │  error()    │               │  │
│   │  └─────────────┘    └─────────────┘    └─────────────┘               │  │
│   └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    ↑
                                    │
            ┌───────────────────────┼───────────────────────┐
            │                       │                       │
     ┌──────┴──────┐         ┌──────┴──────┐        ┌───────┴─────┐
     │  Component  │         │  Component  │        │  Component  │
     │  useStore() │         │  useStore() │        │  useStore() │
     └─────────────┘         └─────────────┘        └─────────────┘
```

**Key relationships:**
- **Container** holds all store and service instances
- **Stores** can depend on other stores and services via `get()`
- **Services** provide infrastructure (API, logging, etc.)
- **Components** subscribe to stores via `useStore()`

---

## Stores

> **Analogy:** A store is like a "smart model" — it holds data AND knows how to update itself. Think of it as a mini-application for one domain (user, cart, settings).

### The Problem Without Stores

Without centralized state, logic scatters across components:

```tsx
// ❌ PROBLEM: State and logic scattered everywhere
function App() {
  // State in multiple places
  const [user, setUser] = useState(null)
  const [cart, setCart] = useState([])
  const [loading, setLoading] = useState(false)
  
  // Logic mixed with UI
  const addToCart = async (item) => {
    setLoading(true)
    await api.addToCart(user.id, item)
    setCart([...cart, item])
    setLoading(false)
  }
  
  // Must drill props down
  return (
    <ProductList 
      user={user} 
      cart={cart} 
      loading={loading}
      addToCart={addToCart} 
    />
  )
}

// Every component needs to know about cart logic
function ProductList({ user, cart, loading, addToCart }) {
  // More prop drilling...
}
```

### The Solution: Stores

Stores co-locate state with the logic that modifies it:

```ts
// ✅ SOLUTION: Self-contained store
// stores/cartStore.ts

import { store } from 'storion/react'

const cartStore = store({
  // ┌─────────────────────────────────────────────────────────────────────────
  // │ name: Unique identifier for debugging and DevTools
  // └─────────────────────────────────────────────────────────────────────────
  name: 'cart',

  // ┌─────────────────────────────────────────────────────────────────────────
  // │ state: Initial data — automatically becomes reactive
  // │        Any mutation to these properties notifies subscribers
  // └─────────────────────────────────────────────────────────────────────────
  state: {
    items: [] as CartItem[],
    loading: false,
  },

  // ┌─────────────────────────────────────────────────────────────────────────
  // │ setup: Runs ONCE when the store is first accessed
  // │        Returns actions that can modify state
  // └─────────────────────────────────────────────────────────────────────────
  setup({ state, get }) {
    // Access other stores and services
    const [userState] = get(userStore)  // Depends on user store
    const api = get(apiService)          // Depends on API service

    return {
      // Actions are just functions that mutate state
      addItem: async (item: CartItem) => {
        state.loading = true
        await api.addToCart(userState.profile?.id, item)
        state.items.push(item)  // Direct mutation!
        state.loading = false
      },

      removeItem: (itemId: string) => {
        state.items = state.items.filter(i => i.id !== itemId)
      },

      clear: () => {
        state.items = []
      },
    }
  },
})
```

```tsx
// Components just use it — no prop drilling needed
function ProductList() {
  const { loading, addItem } = useStore(({ get }) => {
    const [state, actions] = get(cartStore)
    return {
      loading: state.loading,
      addItem: actions.addItem,
    }
  })

  // Component is clean — just UI logic
  return (
    <button onClick={() => addItem(product)} disabled={loading}>
      {loading ? 'Adding...' : 'Add to Cart'}
    </button>
  )
}
```

### Anatomy of a Store

```ts
const userStore = store({
  // ═══════════════════════════════════════════════════════════════════════════
  // 1. IDENTITY — For debugging and DevTools
  // ═══════════════════════════════════════════════════════════════════════════
  name: 'user',

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. INITIAL STATE — Becomes reactive automatically
  // ═══════════════════════════════════════════════════════════════════════════
  state: {
    profile: null as User | null,
    preferences: { theme: 'light', language: 'en' },
    isLoggedIn: false,
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. SETUP — Runs once, returns actions
  // ═══════════════════════════════════════════════════════════════════════════
  setup({ state, update, get, create, focus, onDispose }) {
    // ┌─────────────────────────────────────────────────────────────────────
    // │ get() — Access other stores/services (cached)
    // └─────────────────────────────────────────────────────────────────────
    const api = get(apiService)
    const logger = get(loggerService)

    // ┌─────────────────────────────────────────────────────────────────────
    // │ create() — Create a fresh instance with parameters
    // └─────────────────────────────────────────────────────────────────────
    const analytics = create(analyticsService, 'user-store')

    // ┌─────────────────────────────────────────────────────────────────────
    // │ onDispose() — Cleanup when store is destroyed
    // └─────────────────────────────────────────────────────────────────────
    const unsubscribe = authEvents.on('logout', () => {
      state.isLoggedIn = false
    })
    onDispose(() => unsubscribe())

    // ┌─────────────────────────────────────────────────────────────────────
    // │ Return actions — functions that can modify state
    // └─────────────────────────────────────────────────────────────────────
    return {
      login: async (credentials: Credentials) => {
        const user = await api.login(credentials)
        
        // update() for nested/complex changes (Immer-style draft)
        update(draft => {
          draft.profile = user
          draft.isLoggedIn = true
        })
        
        logger.info('User logged in')
        analytics.track('login')
      },

      logout: () => {
        // Direct mutation for simple changes
        state.isLoggedIn = false
        state.profile = null
      },

      setTheme: (theme: 'light' | 'dark') => {
        state.preferences.theme = theme
      },
    }
  },
})
```

---

## Container

> **Analogy:** The container is like a "factory manager" — it creates stores and services on demand, keeps track of what's been created, and cleans up when done.

### The Problem Without a Container

Without centralized instance management:

```ts
// ❌ PROBLEM: Where do stores live?

// Option 1: Global variables (bad for testing, SSR)
const userStore = createUserStore()  // Shared across everything!

// Option 2: Create in components (creates multiple instances)
function App() {
  const store = createUserStore()  // New instance every render!
}

// Option 3: Module singletons (import cycles, hard to test)
// user.ts imports cart.ts imports user.ts → 💥
```

### The Solution: Container

The container manages all instances in one place:

```ts
import { container } from 'storion'

// ┌─────────────────────────────────────────────────────────────────────────
// │ Create a container — the "home" for all stores and services
// └─────────────────────────────────────────────────────────────────────────
const app = container()

// ┌─────────────────────────────────────────────────────────────────────────
// │ get() — Retrieve or create an instance (cached)
// │         First call creates the instance, subsequent calls return cached
// └─────────────────────────────────────────────────────────────────────────
const [userState, userActions] = app.get(userStore)
const [cartState, cartActions] = app.get(cartStore)

// Same store spec = same instance
app.get(userStore) === app.get(userStore)  // true! Same instance

// ┌─────────────────────────────────────────────────────────────────────────
// │ set() — Override with a custom factory (for testing)
// └─────────────────────────────────────────────────────────────────────────
const testApp = container()
testApp.set(apiService, () => mockApiService)  // Mock for tests

// ┌─────────────────────────────────────────────────────────────────────────
// │ dispose() — Clean up everything when done
// └─────────────────────────────────────────────────────────────────────────
app.dispose()  // Cleans up all stores, calls onDispose callbacks
```

### Container in React

Use `StoreProvider` to make the container available:

```tsx
// App.tsx
import { container, StoreProvider } from 'storion/react'

// Create container (usually once, at app startup)
const app = container()

function App() {
  return (
    // ┌─────────────────────────────────────────────────────────────────────
    // │ StoreProvider makes the container available to all descendants
    // │ Any component below can use useStore() to access stores
    // └─────────────────────────────────────────────────────────────────────
    <StoreProvider container={app}>
      <Router>
        <Layout>
          <Routes />
        </Layout>
      </Router>
    </StoreProvider>
  )
}
```

```tsx
// Any nested component can access stores
function UserProfile() {
  const { name } = useStore(({ get }) => {
    // get() uses the container from the nearest StoreProvider
    const [state] = get(userStore)
    return { name: state.profile?.name }
  })

  return <h1>Hello, {name}</h1>
}
```

### Container Methods Reference

```ts
const app = container()

// ═══════════════════════════════════════════════════════════════════════════
// INSTANCE ACCESS
// ═══════════════════════════════════════════════════════════════════════════

app.get(userStore)        // Returns [state, actions] — cached
app.get(apiService)       // Returns service instance — cached
app.create(logger, 'ns')  // Returns new instance with args — NOT cached

// ═══════════════════════════════════════════════════════════════════════════
// OVERRIDES (for testing/mocking)
// ═══════════════════════════════════════════════════════════════════════════

app.set(apiService, () => mockApi)  // Override factory for this container
app.has(userStore)                   // Check if instance exists

// ═══════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════

app.delete(userStore)     // Remove specific instance
app.clear()               // Remove all instances (keeps overrides)
app.dispose()             // Clean up everything, call onDispose callbacks
```

### Why Container Matters

| Scenario | Without Container | With Container |
|----------|-------------------|----------------|
| **Testing** | Mock globals, reset after each test | Create isolated container per test |
| **SSR** | Shared state across requests! | One container per request |
| **Dependencies** | Import cycles between stores | Container resolves at runtime |
| **Cleanup** | Manual tracking of subscriptions | `dispose()` handles everything |

---

## Services

> **Analogy:** Services are like "utility workers" — they do specific jobs (API calls, logging, analytics) but don't hold application state.

### Services vs Stores

| Aspect | Store | Service |
|--------|-------|---------|
| **State** | Has reactive state that triggers re-renders | No reactive state |
| **Purpose** | Domain data and business logic | Infrastructure and utilities |
| **Updates** | Changes notify components | No reactivity |
| **Caching** | Always cached per container | Can be cached or fresh |
| **Examples** | `userStore`, `cartStore`, `uiStore` | `apiService`, `loggerService`, `analyticsService` |

### When to Use Each

```ts
// ✅ USE A STORE when you have:
// - Data that components need to display
// - State that changes over time
// - Logic that modifies that state

const userStore = store({
  name: 'user',
  state: { profile: null, isLoggedIn: false },  // ← Components display this
  setup({ state }) {
    return {
      login: async () => { /* ... */ },  // ← Changes trigger re-renders
    }
  },
})

// ✅ USE A SERVICE when you have:
// - Utilities that don't need reactivity
// - Infrastructure concerns (API, logging)
// - Things that don't change or don't need to trigger re-renders

function apiService() {
  return {
    get: (url: string) => fetch(url).then(r => r.json()),
    post: (url: string, data: unknown) => fetch(url, {
      method: 'POST',
      body: JSON.stringify(data),
    }).then(r => r.json()),
  }
}
```

### Defining Services

Services are just factory functions:

```ts
// ═══════════════════════════════════════════════════════════════════════════
// Simple service — no dependencies
// ═══════════════════════════════════════════════════════════════════════════

function apiService() {
  const baseUrl = import.meta.env.VITE_API_URL

  return {
    get: async <T>(path: string): Promise<T> => {
      const res = await fetch(`${baseUrl}${path}`)
      if (!res.ok) throw new Error(`API Error: ${res.status}`)
      return res.json()
    },

    post: async <T>(path: string, data: unknown): Promise<T> => {
      const res = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) throw new Error(`API Error: ${res.status}`)
      return res.json()
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Service with dependencies — receives resolver
// ═══════════════════════════════════════════════════════════════════════════

function userApiService(resolver: Resolver) {
  // Access other services via resolver
  const api = resolver.get(apiService)
  const logger = resolver.get(loggerService)

  return {
    getUser: async (id: string) => {
      logger.info(`Fetching user ${id}`)
      return api.get<User>(`/users/${id}`)
    },

    updateUser: async (id: string, data: Partial<User>) => {
      logger.info(`Updating user ${id}`)
      return api.post<User>(`/users/${id}`, data)
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Service with parameters — use create() instead of get()
// ═══════════════════════════════════════════════════════════════════════════

function createLogger(resolver: Resolver, namespace: string) {
  return {
    info: (msg: string) => console.log(`[${namespace}] ℹ️ ${msg}`),
    warn: (msg: string) => console.warn(`[${namespace}] ⚠️ ${msg}`),
    error: (msg: string) => console.error(`[${namespace}] ❌ ${msg}`),
  }
}

// Usage in a store:
setup({ get, create }) {
  const api = get(apiService)                    // Cached
  const logger = create(createLogger, 'user')    // Fresh instance with namespace
}
```

### Typed Services with `service()`

For better TypeScript support, wrap services with `service()`:

```ts
import { service } from 'storion'

// Define the interface
interface ApiService {
  get: <T>(path: string) => Promise<T>
  post: <T>(path: string, data: unknown) => Promise<T>
}

// Create typed service
const apiService = service<ApiService>(() => ({
  get: (path) => fetch(path).then(r => r.json()),
  post: (path, data) => fetch(path, {
    method: 'POST',
    body: JSON.stringify(data),
  }).then(r => r.json()),
}))

// Now get() returns correctly typed service
const api = get(apiService)  // Type: ApiService
api.get<User>('/users/1')    // Autocomplete works!
```

---

## Reactivity

> **Analogy:** Storion's reactivity is like a "smart delivery service" — it tracks who ordered what, and only delivers to the addresses that actually need updates.

### The Problem With Manual Tracking

```tsx
// ❌ Redux/Zustand: You must manually specify what to watch
const count = useSelector(state => state.counter.count)

// What if you forget to extract deeply?
const counter = useSelector(state => state.counter)
// Now EVERY counter property change causes re-render! 💥

// Need to remember equality functions
const user = useSelector(state => state.user, shallowEqual)
```

### The Solution: Auto-Tracking

Storion automatically records what you access:

```tsx
// ✅ Storion: Just use state, tracking is automatic
function UserProfile() {
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore)
    
    // Storion sees: "This component accessed state.profile.name"
    // It records this dependency automatically
    return { name: state.profile.name }
  })

  // This component ONLY re-renders when profile.name changes
  // Changes to profile.email, profile.age, etc. are ignored!
  return <h1>Hello, {name}</h1>
}
```

### How It Works Under the Hood

```
1. SETUP PHASE
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Store state is wrapped in a Proxy that intercepts property access  │
   └─────────────────────────────────────────────────────────────────────┘

2. RENDER PHASE
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Component renders → selector runs → Proxy records all accesses    │
   │                                                                     │
   │ useStore(({ get }) => {                                            │
   │   const [state] = get(userStore)                                   │
   │   return { name: state.profile.name }  // ← Proxy records this!   │
   │ })                                                                  │
   │                                                                     │
   │ Dependencies recorded: ["profile", "name"]                         │
   └─────────────────────────────────────────────────────────────────────┘

3. UPDATE PHASE
   ┌─────────────────────────────────────────────────────────────────────┐
   │ Action mutates state → Storion checks who subscribed               │
   │                                                                     │
   │ state.profile.name = "New Name"                                    │
   │ ↓                                                                   │
   │ Storion: "Who depends on profile.name? → Notify only them"        │
   └─────────────────────────────────────────────────────────────────────┘
```

### Tracking Granularity

Storion tracks **first-level property access** by default:

```tsx
// Tracks the entire "profile" object
const { profile } = useStore(({ get }) => {
  const [state] = get(userStore)
  return { profile: state.profile }  // Tracks "profile"
})
// Re-renders when ANY property of profile changes

// vs

// Tracks only specific nested properties
const { name, email } = useStore(({ get }) => {
  const [state] = get(userStore)
  return {
    name: state.profile.name,    // Tracks "profile.name"
    email: state.profile.email,  // Tracks "profile.email"
  }
})
// Only re-renders when name OR email changes
```

### Fine-Grained Control with `pick()`

For maximum precision, use `pick()`:

```tsx
import { pick } from 'storion'

const { fullName } = useStore(({ get }) => {
  const [state] = get(userStore)
  
  // pick() creates a tracked computed value
  // Only re-renders if the computed result changes
  return {
    fullName: pick(() => `${state.profile.firstName} ${state.profile.lastName}`),
  }
})
```

### Comparison With Other Libraries

| Library | Tracking Style | Re-render Control |
|---------|----------------|-------------------|
| **Redux** | Manual selectors | `useSelector(fn, equalityFn)` |
| **Zustand** | Manual selectors | `useStore(fn, shallow)` |
| **MobX** | Auto (deep, all properties) | `observer()` HOC |
| **Jotai** | Per-atom (manual setup) | N/A |
| **Storion** | Auto (first-level) | `pick()` for fine-tuning |

---

## How Everything Works Together

Here's a complete example showing all concepts:

```tsx
// ═══════════════════════════════════════════════════════════════════════════
// 1. SERVICES — Infrastructure
// ═══════════════════════════════════════════════════════════════════════════

const apiService = service<ApiService>(() => ({
  get: (url) => fetch(url).then(r => r.json()),
  post: (url, data) => fetch(url, { method: 'POST', body: JSON.stringify(data) }).then(r => r.json()),
}))

// ═══════════════════════════════════════════════════════════════════════════
// 2. STORES — Domain Logic
// ═══════════════════════════════════════════════════════════════════════════

const userStore = store({
  name: 'user',
  state: { profile: null as User | null },
  setup({ state, get }) {
    const api = get(apiService)
    return {
      fetchUser: async (id: string) => {
        state.profile = await api.get(`/users/${id}`)
      },
    }
  },
})

const cartStore = store({
  name: 'cart',
  state: { items: [] as CartItem[] },
  setup({ state, get }) {
    const api = get(apiService)
    const [userState] = get(userStore)  // Cross-store dependency!
    
    return {
      addItem: async (product: Product) => {
        await api.post('/cart', { userId: userState.profile?.id, product })
        state.items.push({ ...product, quantity: 1 })
      },
    }
  },
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. CONTAINER — Instance Management
// ═══════════════════════════════════════════════════════════════════════════

const app = container()

// ═══════════════════════════════════════════════════════════════════════════
// 4. REACT — UI Layer
// ═══════════════════════════════════════════════════════════════════════════

function App() {
  return (
    <StoreProvider container={app}>
      <UserProfile />
      <Cart />
    </StoreProvider>
  )
}

function UserProfile() {
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore)
    return { name: state.profile?.name }  // Only re-renders on name change
  })
  return <h1>{name}</h1>
}

function Cart() {
  const { itemCount, addItem } = useStore(({ get }) => {
    const [state, actions] = get(cartStore)
    return {
      itemCount: state.items.length,  // Only re-renders on length change
      addItem: actions.addItem,
    }
  })
  return <span>Cart: {itemCount}</span>
}
```

---

## Summary Table

| Concept | What It Is | Why It Exists | Key Method |
|---------|------------|---------------|------------|
| **Store** | State + actions in one place | Co-locate data with logic that modifies it | `store({...})` |
| **Container** | Instance management hub | Dependency injection without the ceremony | `container()` |
| **Service** | Non-reactive utility | Infrastructure that doesn't need re-renders | `service(fn)` |
| **Reactivity** | Auto-tracking system | No manual dependency management | Automatic! |

---

## Next Steps

Now that you understand the architecture:

| Topic | What You'll Learn |
|-------|-------------------|
| [Stores](/guide/stores) | Deep dive into state, actions, `update()`, `focus()` |
| [Reactivity](/guide/reactivity) | How auto-tracking works, `pick()`, optimization |
| [Actions](/guide/actions) | Sync/async actions, composition patterns |
| [Effects](/guide/effects) | Side effects that react to state changes |
| [Dependency Injection](/guide/dependency-injection) | Testing, mocking, services |

---

**Ready to dive deeper?** [Learn about Stores →](/guide/stores)
