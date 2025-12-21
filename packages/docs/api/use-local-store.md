# useLocalStore()

React hook for creating component-scoped store instances.

## Signature

```ts
function useLocalStore<TState, TActions>(
  factory: StoreSpec<TState, TActions>,
  options?: LocalStoreOptions
): [TState, TActions]
```

## Parameters

### factory

A store specification created with `store()`.

### options

```ts
interface LocalStoreOptions {
  // Initial state override
  initialState?: Partial<TState>;
  
  // Dependencies that recreate the store when changed
  deps?: unknown[];
}
```

## Basic Example

```tsx
import { useLocalStore } from 'storion/react';
import { counterStore } from './stores';

function Counter() {
  const [state, actions] = useLocalStore(counterStore);

  return (
    <div>
      <span>{state.count}</span>
      <button onClick={actions.increment}>+</button>
      <button onClick={actions.decrement}>-</button>
    </div>
  );
}
```

## Multiple Instances

Each component gets its own isolated store instance:

```tsx
function App() {
  return (
    <div>
      {/* Each Counter has independent state */}
      <Counter />  {/* count: 0 */}
      <Counter />  {/* count: 0 */}
      <Counter />  {/* count: 0 */}
    </div>
  );
}
```

## With Initial State

```tsx
function Counter({ initialCount = 0 }: { initialCount?: number }) {
  const [state, actions] = useLocalStore(counterStore, {
    initialState: { count: initialCount },
  });

  return <span>{state.count}</span>;
}

// Usage
<Counter initialCount={10} />
```

## Recreate on Deps Change

```tsx
function UserEditor({ userId }: { userId: string }) {
  // Store recreates when userId changes
  const [state, actions] = useLocalStore(userFormStore, {
    deps: [userId],
  });

  return (
    <form>
      <input 
        value={state.name} 
        onChange={e => actions.setName(e.target.value)} 
      />
    </form>
  );
}
```

## vs useStore

| Feature | `useStore` | `useLocalStore` |
|---------|-----------|-----------------|
| Scope | Container-wide (global) | Component-scoped |
| Instance | Shared singleton | Per-component |
| Lifecycle | Follows container | Follows component |
| Use case | App state | Form state, UI state |

## When to Use

Use `useLocalStore` for:
- Form state
- Modal/dialog state
- Component-specific UI state
- Wizard/multi-step flows
- Any state that shouldn't be shared

Use `useStore` for:
- User session
- Shopping cart
- App settings
- Any shared state

## Example: Form Component

```tsx
const formStore = store({
  name: 'form',
  state: {
    name: '',
    email: '',
    errors: {} as Record<string, string>,
    submitting: false,
  },
  setup({ state, update }) {
    return {
      setField: (field: string, value: string) => {
        update(draft => {
          (draft as any)[field] = value;
          delete draft.errors[field];
        });
      },
      
      validate: () => {
        const errors: Record<string, string> = {};
        if (!state.name) errors.name = 'Required';
        if (!state.email) errors.email = 'Required';
        state.errors = errors;
        return Object.keys(errors).length === 0;
      },
      
      submit: async () => {
        state.submitting = true;
        try {
          await api.submit({ name: state.name, email: state.email });
        } finally {
          state.submitting = false;
        }
      },
    };
  },
});

function ContactForm() {
  const [state, actions] = useLocalStore(formStore);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (actions.validate()) {
      actions.submit();
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        value={state.name}
        onChange={e => actions.setField('name', e.target.value)}
      />
      {state.errors.name && <span>{state.errors.name}</span>}
      
      <input
        value={state.email}
        onChange={e => actions.setField('email', e.target.value)}
      />
      {state.errors.email && <span>{state.errors.email}</span>}
      
      <button disabled={state.submitting}>
        {state.submitting ? 'Submitting...' : 'Submit'}
      </button>
    </form>
  );
}
```

## See Also

- [useStore()](/api/use-store) - Container-scoped stores
- [store()](/api/store) - Creating store specifications

