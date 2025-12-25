# map()

Creates a helper for object/record-focused state manipulation.

## Signature

```ts
function map<T>(options?: MapOptions): (
  focus: Focus<Record<string, T> | undefined | null> | Focus<Record<string, T>>
) => FocusMap<T>;
```

## Usage

```ts
import { store, map } from 'storion/react';

const cacheStore = store({
  name: 'cache',
  state: { users: {} as Record<string, User> },
  setup({ focus }) {
    const users = focus('users').as(map());
    
    return {
      setUser: (id: string, user: User) => users.set(id, user),
      getUser: (id: string) => users.at(id),
      removeUser: (id: string) => users.delete(id),
      hasUser: (id: string) => users.has(id),
    };
  },
});
```

## Options

### autoDispose

Automatically call `dispose()` on values when they are removed.

- **Type:** `boolean`
- **Default:** `false`

```ts
const connections = focus('connections').as(map({ autoDispose: true }));

// When values are removed, their dispose() method is called
connections.delete('conn-1');  // value.dispose() called
connections.clear();           // All values disposed
```

## Methods

### get()

Get the current record.

```ts
const allUsers = users.get();
```

### at(key)

Get value by key.

```ts
const user = users.at('user-123');
```

### size()

Get number of entries.

```ts
const count = users.size();
```

### isEmpty()

Check if record is empty.

```ts
if (users.isEmpty()) {
  console.log('No users');
}
```

### has(key)

Check if key exists.

```ts
if (users.has('admin')) {
  // ...
}
```

### set(key, value)

Set value at key. Accepts direct value, reducer, or Immer-style updater.

```ts
// Direct value
users.set('user-1', newUser);

// Reducer (returns new value)
users.set('user-1', prev => ({ ...prev, name: 'Updated' }));

// Immer-style updater (mutates draft)
users.set('user-1', draft => { draft.age++ });

// With built-in reducers
import { increment, merge } from 'storion';
counters.set('visits', increment());
users.set('admin', merge({ role: 'superadmin' }));
```

::: warning
If using a reducer/updater and the key doesn't exist, nothing happens.
:::

### delete(...keys)

Delete key(s).

```ts
users.delete('user-1');
users.delete('user-1', 'user-2', 'user-3');
```

Returns the number of keys deleted.

### deleteWhere(predicate)

Delete keys matching predicate.

```ts
const count = users.deleteWhere((user, key) => user.inactive);
```

Returns the number of keys deleted.

### clear()

Remove all entries.

```ts
users.clear();
```

### replace(record)

Replace entire record.

```ts
users.replace(newUsersData);
```

### keys()

Get all keys.

```ts
const userIds = users.keys();
```

### values()

Get all values.

```ts
const allUsers = users.values();
```

### entries()

Get all [key, value] pairs.

```ts
const pairs = users.entries();
for (const [id, user] of pairs) {
  console.log(id, user.name);
}
```

### pick(equality?)

Create a pick selector for fine-grained reactivity.

```ts
const data = users.pick('shallow');
```

## Return Type

```ts
interface FocusMap<T> {
  get(): Record<string, T>;
  at(key: string): T | undefined;
  size(): number;
  isEmpty(): boolean;
  has(key: string): boolean;
  set(key: string, valueOrReducerOrUpdater: T | ((prev: T) => T | void)): void;
  delete(...keys: string[]): number;
  deleteWhere(predicate: (value: T, key: string) => boolean): number;
  clear(): void;
  replace(record: Record<string, T>): void;
  keys(): string[];
  values(): T[];
  entries(): [string, T][];
  pick(equality?: PickEquality<Record<string, T> | undefined | null>): Record<string, T>;
}
```

## See Also

- [`list()`](/api/list) - For array collections
- [`focus()`](/api/store#focus-path-options) - Core focus API
- [Dynamic Nested State](/guide/dynamic-stores) - Guide for managing collections

