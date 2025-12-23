# Reactivity

Storion's reactivity system is what enables automatic dependency tracking. Understanding how it works helps you write more efficient code and debug unexpected behavior.

## How Reactivity Works

Storion uses JavaScript [Proxies](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Proxy) to intercept state access. When you read a property, Storion records it as a dependency.

```tsx
function UserName() {
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore);
    // When this line executes, Storion records:
    // "UserName component depends on state.name"
    return { name: state.name };
  });

  return <span>{name}</span>;
}
```

**The tracking process:**

1. Component renders and calls `useStore`
2. Selector function executes
3. Every `state.xxx` access is intercepted by the Proxy
4. Storion builds a dependency list: `["name"]`
5. Component subscribes to those specific properties
6. When `state.name` changes, only this component re-renders
7. Changes to `state.email`, `state.age`, etc. are ignored

## Tracked vs Untracked Contexts

Reactivity only works in specific contexts:

| Context             | Tracked | Example                                  |
| ------------------- | ------- | ---------------------------------------- |
| `useStore` selector | ✅      | `useStore(({ get }) => get(store)[0].x)` |
| `effect` callback   | ✅      | `effect(() => console.log(state.x))`     |
| `pick()` callback   | ✅      | `pick(() => state.items.length)`         |
| Action bodies       | ❌      | `increment: () => state.count++`         |
| Event handlers      | ❌      | `onClick={() => state.count}`            |
| Async callbacks     | ❌      | `.then(data => state.x)`                 |

**Why actions aren't tracked:**

Actions are meant to _change_ state, not react to it. If actions were tracked, you'd create circular dependencies.

## Tracking Granularity

### First-Level Properties

By default, Storion tracks first-level property access:

```tsx
const { profile } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { profile: state.profile }; // Tracks "profile"
});

// Re-renders when ANY property of profile changes:
// - state.profile.name = 'Alice'  → re-render
// - state.profile.email = '...'   → re-render
// - state.profile = newProfile    → re-render
```

### Fine-grained with pick()

Use `pick()` for more precise tracking:

```tsx
import { pick } from "storion";

const { name } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { name: pick(() => state.profile.name) }; // Tracks only "name"
});

// Only re-renders when profile.name specifically changes:
// - state.profile.name = 'Alice'  → re-render
// - state.profile.email = '...'   → NO re-render
```

### When to Use pick()

| Scenario                    | Without pick()       | With pick()     |
| --------------------------- | -------------------- | --------------- |
| Accessing nested properties | Tracks parent object | Tracks leaf     |
| Computed values             | Tracks all reads     | Tracks specific |
| Large objects               | Any change re-render | Precise updates |

```tsx
// ❌ Without pick - re-renders on any items change
const { count } = useStore(({ get }) => {
  const [state] = get(todoStore);
  return { count: state.items.length };
});

// ✅ With pick - only re-renders when length changes
const { count } = useStore(({ get }) => {
  const [state] = get(todoStore);
  return { count: pick(() => state.items.length) };
});
```

## Custom Equality

By default, Storion uses strict equality (`===`) to compare values. You can customize this at two levels:

### Store-Level Equality

Define equality per field when creating the store:

```ts
const todoStore = store({
  name: "todos",
  state: { items: [], filter: "all" },
  equality: {
    items: "shallow", // Shallow comparison for arrays
    filter: "strict", // Default strict (===)
  },
});
```

**Available equality options:**

| Value                | Description                       |
| -------------------- | --------------------------------- |
| `"strict"` (default) | `===` comparison                  |
| `"shallow"`          | Compare properties one level deep |
| `"deep"`             | Recursive comparison              |
| `(a, b) => boolean`  | Custom comparison function        |

### Selector-Level Equality

Override equality in individual selectors using `pick()`:

```tsx
import { pick, shallowEqual, deepEqual } from "storion";

const result = useStore(({ get }) => {
  const [state] = get(userStore);
  return {
    // Strict equality (default)
    name: state.name,

    // Shallow equality - good for arrays/objects
    items: pick(() => state.items, "shallow"),

    // Deep equality - good for nested objects
    settings: pick(() => state.settings, "deep"),

    // Custom comparison
    selectedIds: pick(
      () => state.items.map((i) => i.id),
      (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
    ),
  };
});
```

### Store vs Selector Equality

| Level              | When it runs          | Use case                                             |
| ------------------ | --------------------- | ---------------------------------------------------- |
| **Store-level**    | On every state write  | Prevent unnecessary notifications to ALL subscribers |
| **Selector-level** | On every selector run | Prevent re-renders for THIS component only           |

```
┌─────────────────────────────────────────────────────────────────────┐
│  state.items = newItems                                             │
│         │                                                           │
│         ▼                                                           │
│  Store-level equality: items: "shallow"                             │
│  Same items? → Skip notifying ALL subscribers                       │
│         │                                                           │
│         ▼ (if changed)                                              │
│  ┌─────────────────────┐    ┌─────────────────────┐                 │
│  │ Component A         │    │ Component B         │                 │
│  │ pick(items.length)  │    │ pick(items, shallow)│                 │
│  │      │              │    │      │              │                 │
│  │      ▼              │    │      ▼              │                 │
│  │ Re-render if        │    │ Re-render if any    │                 │
│  │ length changed      │    │ item changed        │                 │
│  └─────────────────────┘    └─────────────────────┘                 │
└─────────────────────────────────────────────────────────────────────┘
```

## Batching Updates

Multiple state changes within a single action are automatically batched:

```ts
setup({ state }) {
  return {
    updateUser: (name: string, email: string) => {
      state.name = name;   // Change 1
      state.email = email; // Change 2
      // Only ONE notification sent (after action completes)
    },
  };
}
```

### Manual Batching

For updates outside actions, use `batch()`:

```ts
import { batch } from "storion";

// Without batch: 3 separate re-renders
actions.setName("Alice");
actions.setEmail("alice@example.com");
actions.setAge(30);

// With batch: 1 re-render
batch(() => {
  actions.setName("Alice");
  actions.setEmail("alice@example.com");
  actions.setAge(30);
});
```

## Untracked Reading

Sometimes you need to read state without creating a dependency. Use `untrack()`:

```ts
import { untrack } from "storion";

const { name, debug } = useStore(({ get }) => {
  const [state] = get(userStore);
  return {
    name: state.name, // Tracked - component re-renders when name changes

    debug: () =>
      untrack(() => {
        // Not tracked - reading these won't cause re-renders
        console.log("Email:", state.email);
        console.log("Age:", state.age);
      }),
  };
});
```

**Use cases for untrack():**

- Logging/debugging without affecting reactivity
- Reading values for analytics
- One-time reads that shouldn't create subscriptions

## Common Pitfalls

### Pitfall 1: Accessing State Outside Tracked Context

```tsx
function UserCard() {
  const { user, getEmail } = useStore(({ get }) => {
    const [state] = get(userStore);
    return {
      user: state.user,
      // ❌ This function is called outside tracked context
      getEmail: () => state.user.email, // Won't re-render when email changes!
    };
  });

  // When getEmail() is called in onClick, it's not tracked
  return <button onClick={() => alert(getEmail())}>Show Email</button>;
}
```

**Fix:** Include the value in the selector return:

```tsx
const { user, email } = useStore(({ get }) => {
  const [state] = get(userStore);
  return {
    user: state.user,
    email: state.user.email, // ✅ Tracked
  };
});
```

### Pitfall 2: Destructuring Too Early

```tsx
// ❌ Destructuring outside selector - loses tracking
const instance = container.get(userStore);
const { name } = instance.state; // Not tracked!

function UserName() {
  return <span>{name}</span>; // Never re-renders
}

// ✅ Destructure inside selector
function UserName() {
  const { name } = useStore(({ get }) => {
    const [state] = get(userStore);
    return { name: state.name }; // Tracked
  });
  return <span>{name}</span>;
}
```

### Pitfall 3: Returning Entire State

```tsx
// ❌ Returns state proxy - tracks nothing in selector!
const { state } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { state }; // No properties read = no tracking
});
// Later: state.name access is OUTSIDE selector, not tracked

// ✅ Return only what you need - properties are tracked
const { name, email } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { name: state.name, email: state.email }; // Reads tracked
});
```

## Debugging Reactivity

### Check What's Tracked

Use the devtools to see what dependencies a component has:

```ts
import { devtools } from "storion/devtools";

const app = container({
  middleware: devtools({ name: "MyApp" }),
});
```

### Log State Changes

```ts
const myStore = store({
  onDispatch: (event) => {
    console.log(`Action: ${event.name}`, event.args);
  },
});
```

## Summary

| Concept           | Description                                       |
| ----------------- | ------------------------------------------------- |
| **Auto-tracking** | Reading state creates subscriptions automatically |
| **First-level**   | By default, tracks immediate properties           |
| **pick()**        | Fine-grained tracking for nested values           |
| **Equality**      | Customize how changes are detected                |
| **Batching**      | Multiple changes = one notification               |
| **untrack()**     | Read without subscribing                          |

## Next Steps

- **[Stores](/guide/stores)** — Where state lives
- **[Effects](/guide/effects)** — Reactive side effects
- **[useStore](/guide/react/use-store)** — React integration
