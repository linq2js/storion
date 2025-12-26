# pick()

Fine-grained value tracking for computed values.

Unlike direct property access which tracks the property itself, `pick()` tracks the computed result. Changes only propagate when the result actually changes.

## Signature

```ts
function pick<T>(selector: () => T, equality?: PickEquality<T>): T
```

## Parameters

### selector

Function that computes the value to track.

- **Type:** `() => T`
- **Required:** Yes

### equality

Optional equality function to compare computed values.

- **Type:** `PickEquality<T>`
- **Default:** `"strict"` (uses `===`)

Can be:
- `"strict"` - Strict equality (`===`)
- `"shallow"` - Shallow equality (compares top-level properties)
- `"deep"` - Deep equality (recursive comparison)
- `(a: T, b: T) => boolean` - Custom equality function

## Example

```tsx
import { pick } from "storion/react";

// Without pick: re-renders when ANY profile property changes
const { profile } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { profile: state.profile }; // tracks "profile"
});

// With pick: re-renders only when profile.name changes
const { name } = useStore(({ get }) => {
  const [state] = get(userStore);
  return { name: pick(() => state.profile.name) };
});

// With custom equality
const { profile } = useStore(({ get }) => {
  const [state] = get(userStore);
  return {
    profile: pick(
      () => ({ name: state.profile.name, age: state.profile.age }),
      (a, b) => a.name === b.name && a.age === b.age
    ),
  };
});
```

## When to Use pick()

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

## pick.wrap()

Wrap functions to automatically use `pick()` for their results. Useful for creating reusable selectors.

### Signature

```ts
// Wrap a single function
pick.wrap<TArgs, TResult>(
  fn: (...args: TArgs) => TResult,
  equality?: PickEquality<TResult>
): (...args: TArgs) => TResult

// Wrap multiple methods with a prefix
pick.wrap<TPrefix, TMethods>(
  prefix: TPrefix,
  methods: TMethods,
  equality?: PickEquality<any>
): PrefixedMethods<TPrefix, TMethods>

// Wrap multiple methods without a prefix
pick.wrap<TMethods>(
  methods: TMethods,
  equality?: PickEquality<any>
): TMethods
```

### Wrap a Single Function

```ts
import { pick } from "storion/react";

const userStore = store({
  state: { firstName: "John", lastName: "Doe" },
  setup: () => ({}),
});

const stores = container();
const instance = stores.get(userStore);

// Create a wrapped selector function
const getFullName = pick.wrap(
  () => `${instance.state.firstName} ${instance.state.lastName}`,
  "strict"
);

// Use in selector - automatically uses pick()
const { fullName } = useStore(() => {
  return { fullName: getFullName() };
});
```

### Wrap Multiple Methods with Prefix

```ts
const userStore = store({
  state: { count: 0, name: "John" },
  setup: () => ({}),
});

const stores = container();
const instance = stores.get(userStore);

// Wrap multiple methods with a prefix
const methods = pick.wrap("pick", {
  count: () => instance.state.count,
  name: () => instance.state.name,
});

// Returns: { pickCount: () => pick(() => instance.state.count), pickName: () => pick(() => instance.state.name) }

// Use in selector
const { pickCount, pickName } = useStore(() => {
  return {
    pickCount: methods.pickCount(),
    pickName: methods.pickName(),
  };
});
```

### Wrap Multiple Methods without Prefix

```ts
const userStore = store({
  state: { count: 0, name: "John" },
  setup: () => ({}),
});

const stores = container();
const instance = stores.get(userStore);

// Wrap multiple methods without prefix
const methods = pick.wrap({
  count: () => instance.state.count,
  name: () => instance.state.name,
});

// Returns: { count: () => pick(() => instance.state.count), name: () => pick(() => instance.state.name) }

// Use in selector
const { count, name } = useStore(() => {
  return {
    count: methods.count(),
    name: methods.name(),
  };
});
```

### Custom Equality with wrap()

```ts
// Wrap with custom equality
const getItems = pick.wrap(
  () => instance.state.items,
  "shallow" // Use shallow equality
);

// Or with custom function
const getProfile = pick.wrap(
  () => instance.state.profile,
  (a, b) => a.id === b.id && a.name === b.name
);
```

## Use Cases

### Reusable Selectors

```ts
// Create reusable selectors
const selectors = {
  fullName: pick.wrap(() => `${state.firstName} ${state.lastName}`),
  itemCount: pick.wrap(() => state.items.length),
  activeItems: pick.wrap(() => state.items.filter(i => !i.done), "shallow"),
};

// Use across multiple components
const { fullName } = useStore(() => ({ fullName: selectors.fullName() }));
```

### Component-Local Computations

```tsx
function TodoList() {
  const { stats } = useStore(({ get }) => {
    const [state] = get(todoStore);
    
    // Wrap computations for fine-grained tracking
    const getStats = pick.wrap(() => ({
      total: state.items.length,
      completed: state.items.filter(i => i.done).length,
      active: state.items.filter(i => !i.done).length,
    }), "shallow");
    
    return { stats: getStats() };
  });
  
  return (
    <div>
      <p>Total: {stats.total}</p>
      <p>Completed: {stats.completed}</p>
      <p>Active: {stats.active}</p>
    </div>
  );
}
```

## Return Value

Returns the computed value from the selector function. The value is tracked reactively - components will only re-render when the computed result changes (according to the equality function).

## See Also

- [Reactivity Guide](/guide/reactivity) - How auto-tracking works
- [useStore()](/api/use-store) - Using pick() in React components
- [Effects](/guide/effects) - Using pick() in effects

