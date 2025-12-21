# withStore()

Higher-order component that separates data selection from rendering, providing automatic memoization.

## Signature

```ts
function withStore<TProps, TStoreProps>(
  selector: (ctx: SelectorContext, ownProps: TProps) => TStoreProps
): {
  (Component: React.ComponentType<TProps & TStoreProps>): React.ComponentType<TProps>;
  use: (ownProps: TProps) => TStoreProps;
}
```

## Basic Example

```tsx
import { withStore } from 'storion/react';

// Define the connected component
const CounterDisplay = withStore(({ get }) => {
  const [state, actions] = get(counterStore);
  return {
    count: state.count,
    increment: actions.increment,
  };
})(({ count, increment }) => (
  <button onClick={increment}>
    Count: {count}
  </button>
));

// Usage
<CounterDisplay />
```

## With Own Props

```tsx
interface UserCardProps {
  userId: string;
  className?: string;
}

const UserCard = withStore<UserCardProps, { user: User | null }>(
  ({ get }, { userId }) => {
    const [state, actions] = get(userStore);
    
    // Fetch user data
    trigger(actions.fetchUser, [userId], userId);
    
    return {
      user: state.users[userId] ?? null,
    };
  }
)(({ user, className }) => (
  <div className={className}>
    {user ? user.name : 'Loading...'}
  </div>
));

// Usage
<UserCard userId="123" className="card" />
```

## The `use` Property

Access selected data without rendering:

```tsx
const UserInfo = withStore(({ get }) => {
  const [state] = get(userStore);
  return { name: state.name, email: state.email };
});

// In another component or test
function ParentComponent() {
  const { name, email } = UserInfo.use({});
  
  return (
    <div>
      <span>{name}</span>
      <span>{email}</span>
    </div>
  );
}
```

## HOC Mode vs Direct Mode

```tsx
// HOC Mode - wraps a component
const EnhancedCounter = withStore(selector)(CounterUI);

// Direct Mode - renders children with props
const Counter = withStore(selector)(({ count, increment, children }) => (
  <div>
    {count}
    <button onClick={increment}>+</button>
    {children}
  </div>
));

<Counter>
  <span>Child content</span>
</Counter>
```

## Forwarding Refs

```tsx
import { forwardRef } from 'react';

const Input = withStore(({ get }) => {
  const [state, actions] = get(formStore);
  return {
    value: state.value,
    onChange: actions.setValue,
  };
})(forwardRef<HTMLInputElement, { value: string; onChange: (v: string) => void }>(
  ({ value, onChange }, ref) => (
    <input
      ref={ref}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
));

// Usage with ref
const inputRef = useRef<HTMLInputElement>(null);
<Input ref={inputRef} />
```

## vs useStore

| Feature | `useStore` | `withStore` |
|---------|-----------|-------------|
| Style | Hook | HOC |
| Memoization | Manual | Automatic |
| Ref forwarding | Native | Via `forwardRef` |
| Testing | Use hook | Use `.use()` |
| Props separation | N/A | Own props vs store props |

## When to Use

**Use `withStore` when:**
- You want automatic memoization
- You need to separate data logic from UI
- Working with class components
- Building reusable connected components

**Use `useStore` when:**
- You prefer hooks
- You need more control over rendering
- Building simple components

## Example: List Item

```tsx
interface TodoItemProps {
  id: string;
}

const TodoItem = withStore<TodoItemProps, {
  todo: Todo;
  toggle: () => void;
  remove: () => void;
}>(({ get }, { id }) => {
  const [state, actions] = get(todoStore);
  const todo = state.items.find(t => t.id === id)!;
  
  return {
    todo,
    toggle: () => actions.toggle(id),
    remove: () => actions.remove(id),
  };
})(({ todo, toggle, remove }) => (
  <li>
    <input
      type="checkbox"
      checked={todo.completed}
      onChange={toggle}
    />
    <span>{todo.text}</span>
    <button onClick={remove}>×</button>
  </li>
));

// Usage in list
function TodoList() {
  const { ids } = useStore(({ get }) => ({
    ids: get(todoStore)[0].items.map(t => t.id),
  }));

  return (
    <ul>
      {ids.map(id => (
        <TodoItem key={id} id={id} />
      ))}
    </ul>
  );
}
```

## See Also

- [useStore()](/api/use-store) - Hook alternative

