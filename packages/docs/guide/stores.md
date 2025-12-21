# Stores

Stores are the core building block of Storion. They hold state and expose actions to modify it.

## Defining a Store

```ts
import { store } from 'storion/react';

const userStore = store({
  name: 'user',                          // Display name for debugging
  state: { name: '', email: '', age: 0 }, // Initial state
  setup({ state, update, get, mixin, focus }) {
    // Return actions
    return {
      setName: (name: string) => {
        state.name = name;
      },
    };
  },
});
```

## State Mutation

### Direct Mutation (First-Level)

For top-level properties, mutate directly:

```ts
setup({ state }) {
  return {
    setName: (name: string) => {
      state.name = name;  // ✅ Direct mutation
    },
  };
}
```

### Nested State with update()

For nested objects, use `update()` with Immer:

```ts
setup({ state, update }) {
  return {
    updateProfile: (profile: Partial<Profile>) => {
      update(draft => {
        Object.assign(draft.profile, profile);  // ✅ Immer draft
      });
    },
  };
}
```

::: warning
Direct nested mutation won't trigger reactivity:
```ts
state.profile.name = 'John';  // ❌ Won't work
```
:::

## Focus (Lens-like Access)

`focus()` provides typed access to nested paths:

```ts
setup({ focus }) {
  const [getName, setName] = focus('profile.name');
  
  return {
    getName,
    setName,
    updateName: (fn: (name: string) => string) => {
      setName(fn(getName()));
    },
  };
}
```

## Store Options

```ts
const store = store({
  // Required
  name: 'myStore',
  state: { /* initial state */ },
  setup({ state, update, get, mixin, focus }) {
    return { /* actions */ };
  },
  
  // Optional
  lifetime: 'keepAlive',  // or 'autoDispose'
  equality: {
    items: shallowEqual,  // Custom equality per field
  },
  meta: [/* metadata entries */],
});
```

## Lifetime

### keepAlive (default)

Store persists until container is disposed:

```ts
const globalStore = store({
  lifetime: 'keepAlive',  // Default
  // ...
});
```

### autoDispose

Store disposes when no components subscribe:

```ts
const sessionStore = store({
  lifetime: 'autoDispose',
  // ...
});
```

::: warning
A `keepAlive` store cannot depend on an `autoDispose` store.
:::

## Store Instance

When you `get()` a store, you receive a `[state, actions]` tuple:

```ts
const [state, actions] = container.get(userStore);

// Read state
console.log(state.name);

// Call actions
actions.setName('Alice');
```

### Additional Methods

```ts
const instance = container.get(userStore);

// Full instance has more methods
instance.state;           // Reactive state
instance.actions;         // Actions object
instance.subscribe(fn);   // Listen to changes
instance.dehydrate();     // Serialize state
instance.hydrate(data);   // Restore state
instance.dirty;           // Modified fields
instance.reset();         // Reset to initial
instance.dispose();       // Clean up
```

