# effect()

Creates a reactive effect that automatically tracks dependencies and re-runs when they change.

## Signature

```ts
function effect(
  callback: (ctx: EffectContext) => void | (() => void),
  options?: EffectOptions
): () => void
```

## Parameters

### callback

The effect function that runs reactively. Must be **synchronous**.

- Receives an `EffectContext` for handling async operations safely
- Can return a cleanup function

### options

Optional configuration.

```ts
interface EffectOptions {
  // Run immediately or wait for first change
  immediate?: boolean; // default: true
  
  // Custom scheduler for batching
  scheduler?: (run: () => void) => void;
}
```

## Effect Context

```ts
interface EffectContext {
  // Safely run async operations that can be cancelled
  safe<T>(promise: Promise<T>): Promise<T | undefined>;
  
  // Check if effect is still active
  active: boolean;
}
```

## Basic Example

```ts
import { effect } from 'storion';

const [state, actions] = container.get(userStore);

// Effect tracks state.name automatically
const dispose = effect(() => {
  console.log('User name changed:', state.name);
});

// Later: stop the effect
dispose();
```

## Cleanup Function

```ts
effect(() => {
  const handler = () => console.log('clicked');
  document.addEventListener('click', handler);
  
  // Cleanup runs before re-execution and on dispose
  return () => {
    document.removeEventListener('click', handler);
  };
});
```

## Async Operations

Effects must be synchronous, but you can safely handle async operations:

```ts
// ❌ WRONG - async effects are not allowed
effect(async () => {
  const data = await fetchData();
  state.data = data;
});

// ✅ CORRECT - use ctx.safe() for async
effect((ctx) => {
  ctx.safe(fetchData()).then(data => {
    if (data !== undefined) {
      state.data = data;
    }
  });
});
```

The `ctx.safe()` wrapper ensures:
- Promise is cancelled if effect re-runs
- Returns `undefined` if cancelled
- Prevents stale updates

## Conditional Effects

```ts
effect(() => {
  // Only tracks state.user when state.isLoggedIn is true
  if (state.isLoggedIn) {
    console.log('Logged in as:', state.user.name);
  }
});
```

## Multiple Dependencies

```ts
effect(() => {
  // Tracks both firstName and lastName
  const fullName = `${state.firstName} ${state.lastName}`;
  document.title = fullName;
});
```

## See Also

- [Reactivity Guide](/guide/reactivity) - How reactivity works
- [Effects Guide](/guide/effects) - Deep dive into effects

