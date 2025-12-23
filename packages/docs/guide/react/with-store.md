# withStore

`withStore` is a higher-order component (HOC) that connects React components to Storion stores with automatic memoization.

## Overview

```tsx
import { withStore } from 'storion/react';

const Counter = withStore(({ get }) => {
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
```

## When to Use

| Use `withStore` when... | Use `useStore` when... |
|------------------------|------------------------|
| You want automatic memoization | You prefer hooks |
| Separating data from UI | Simple components |
| Working with class components | More control over rendering |
| Building reusable connected components | Inline data access |

## Basic Usage

### Define the Selector

The selector receives the same context as `useStore`:

```tsx
const UserProfile = withStore(({ get }) => {
  const [state, actions] = get(userStore);
  
  return {
    name: state.name,
    email: state.email,
    updateName: actions.setName,
  };
});
```

### Wrap the Component

```tsx
const UserProfileComponent = UserProfile(({ name, email, updateName }) => (
  <div>
    <h1>{name}</h1>
    <p>{email}</p>
    <button onClick={() => updateName('New Name')}>Update</button>
  </div>
));
```

### Use It

```tsx
function App() {
  return <UserProfileComponent />;
}
```

## With Own Props

Pass props through to the selector:

```tsx
interface UserCardProps {
  userId: string;
  className?: string;
}

const UserCard = withStore<UserCardProps, { user: User | null }>(
  ({ get }, { userId }) => {
    const [state, actions] = get(userStore);
    
    // Trigger fetch based on prop
    trigger(actions.fetchUser, [userId], userId);
    
    return {
      user: state.users[userId] ?? null,
    };
  }
)(({ user, className }) => (
  <div className={className}>
    {user ? (
      <>
        <h2>{user.name}</h2>
        <p>{user.email}</p>
      </>
    ) : (
      <p>Loading...</p>
    )}
  </div>
));

// Usage
<UserCard userId="123" className="card" />
```

## The `use` Property

Access selected data without rendering a component:

```tsx
const UserInfo = withStore(({ get }) => {
  const [state] = get(userStore);
  return { name: state.name, email: state.email };
});

// Use the selector directly
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

This is useful for:
- Sharing selectors between components
- Testing selectors in isolation
- Accessing store data in parent components

## Forwarding Refs

Use `forwardRef` to pass refs through:

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
function Form() {
  const inputRef = useRef<HTMLInputElement>(null);
  
  return (
    <form>
      <Input ref={inputRef} />
      <button onClick={() => inputRef.current?.focus()}>
        Focus
      </button>
    </form>
  );
}
```

## With Children

Components can accept children:

```tsx
const Card = withStore(({ get }) => {
  const [state] = get(themeStore);
  return { theme: state.current };
})(({ theme, children }) => (
  <div className={`card card-${theme}`}>
    {children}
  </div>
));

// Usage
<Card>
  <h2>Title</h2>
  <p>Content</p>
</Card>
```

## Trigger Pattern

Use `trigger` for data fetching based on props:

```tsx
import { trigger } from 'storion/react';

interface PostListProps {
  category: string;
}

const PostList = withStore<PostListProps, { posts: Post[]; loading: boolean }>(
  ({ get }, { category }) => {
    const [state, actions] = get(postStore);
    
    // Fetch when category changes
    trigger(actions.fetchByCategory, [category], category);
    
    return {
      posts: state.postsByCategory[category] ?? [],
      loading: state.loading,
    };
  }
)(({ posts, loading }) => (
  <div>
    {loading ? (
      <p>Loading...</p>
    ) : (
      <ul>
        {posts.map(post => (
          <li key={post.id}>{post.title}</li>
        ))}
      </ul>
    )}
  </div>
));
```

## Component-Local Stores

Use `scoped()` for component-local store instances:

```tsx
const FormSection = withStore(({ scoped }) => {
  const [state, actions] = scoped(formStore);
  
  return {
    value: state.value,
    error: state.error,
    setValue: actions.setValue,
    validate: actions.validate,
  };
})(({ value, error, setValue, validate }) => (
  <div>
    <input
      value={value}
      onChange={e => setValue(e.target.value)}
      onBlur={validate}
    />
    {error && <span className="error">{error}</span>}
  </div>
));
```

## Multiple Stores

Access multiple stores in one selector:

```tsx
const Dashboard = withStore(({ get }) => {
  const [userState] = get(userStore);
  const [statsState] = get(statsStore);
  const [notificationState, notificationActions] = get(notificationStore);
  
  return {
    userName: userState.name,
    totalSales: statsState.totalSales,
    unreadCount: notificationState.unread.length,
    markAllRead: notificationActions.markAllRead,
  };
})(({ userName, totalSales, unreadCount, markAllRead }) => (
  <header>
    <h1>Welcome, {userName}</h1>
    <div>Sales: ${totalSales}</div>
    <button onClick={markAllRead}>
      Notifications ({unreadCount})
    </button>
  </header>
));
```

## Optimized List Items

Use `withStore` for optimized list item rendering:

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
  <li className={todo.completed ? 'completed' : ''}>
    <input
      type="checkbox"
      checked={todo.completed}
      onChange={toggle}
    />
    <span>{todo.text}</span>
    <button onClick={remove}>×</button>
  </li>
));

// Parent only re-renders when ids change
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

## Testing

### Testing with `.use()`

```tsx
import { renderHook } from '@testing-library/react';

const UserInfo = withStore(({ get }) => {
  const [state] = get(userStore);
  return { name: state.name };
});

test('selector returns user name', () => {
  const { result } = renderHook(() => UserInfo.use({}), {
    wrapper: ({ children }) => (
      <StoreProvider container={testContainer}>
        {children}
      </StoreProvider>
    ),
  });
  
  expect(result.current.name).toBe('Test User');
});
```

### Testing the Component

```tsx
import { render, screen } from '@testing-library/react';

test('renders user profile', () => {
  render(
    <StoreProvider container={testContainer}>
      <UserProfileComponent />
    </StoreProvider>
  );
  
  expect(screen.getByText('Test User')).toBeInTheDocument();
});
```

## TypeScript

### Type Inference

```tsx
// Types are inferred from selector return
const Counter = withStore(({ get }) => {
  const [state, actions] = get(counterStore);
  return {
    count: state.count,      // number
    increment: actions.increment,  // () => void
  };
});

// Component props are typed automatically
Counter(({ count, increment }) => {
  // count: number
  // increment: () => void
  return <div>{count}</div>;
});
```

### Explicit Types

```tsx
interface OwnProps {
  id: string;
}

interface StoreProps {
  data: Data | null;
  loading: boolean;
  fetch: (id: string) => Promise<void>;
}

const DataView = withStore<OwnProps, StoreProps>(
  ({ get }, { id }) => {
    // ...
    return { data, loading, fetch };
  }
)(({ data, loading, fetch, id }) => {
  // All props are typed
  return <div>...</div>;
});
```

## Comparison with useStore

```tsx
// withStore - automatic memoization, HOC pattern
const Counter = withStore(({ get }) => {
  const [state, actions] = get(counterStore);
  return { count: state.count, increment: actions.increment };
})(({ count, increment }) => (
  <button onClick={increment}>{count}</button>
));

// useStore - hook pattern, manual memoization if needed
function Counter() {
  const { count, increment } = useStore(({ get }) => {
    const [state, actions] = get(counterStore);
    return { count: state.count, increment: actions.increment };
  });
  
  return <button onClick={increment}>{count}</button>;
}
```

## Next Steps

- **[useStore](/guide/react/use-store)** — Hook-based alternative
- **[StoreProvider](/guide/react/provider)** — Setting up the provider
- **[withStore API](/api/with-store)** — Complete API reference

