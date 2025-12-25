# list()

Creates a helper for array-focused state manipulation.

## Signature

```ts
function list<T>(options?: ListOptions): (
  focus: Focus<T[] | undefined | null> | Focus<T[]>
) => FocusList<T>;
```

## Usage

```ts
import { store, list } from 'storion/react';

const todoStore = store({
  name: 'todos',
  state: { items: [] as Todo[] },
  setup({ focus }) {
    const items = focus('items').as(list());
    
    return {
      add: (text: string) => items.push({ id: Date.now(), text, done: false }),
      remove: (todo: Todo) => items.remove(todo),
      toggle: (index: number) => items.set(index, d => { d.done = !d.done }),
    };
  },
});
```

## Options

### autoDispose

Automatically call `dispose()` on items when they are removed.

- **Type:** `boolean`
- **Default:** `false`

```ts
const connections = focus('connections').as(list({ autoDispose: true }));

// When items are removed, their dispose() method is called
connections.remove(connection); // connection.dispose() called
connections.clear();            // All items disposed
```

## Methods

### get()

Get the entire array.

```ts
const allItems = items.get();
```

### at(index)

Get item at index.

```ts
const firstItem = items.at(0);
const lastItem = items.at(items.length() - 1);
```

### length()

Get the array length.

```ts
const count = items.length();
```

### isEmpty()

Check if array is empty.

```ts
if (items.isEmpty()) {
  console.log('No items');
}
```

### first() / last()

Get first or last item.

```ts
const newest = items.last();
const oldest = items.first();
```

### push(...items)

Add item(s) to the end.

```ts
items.push(newItem);
items.push(item1, item2, item3);
```

### unshift(...items)

Add item(s) to the beginning.

```ts
items.unshift(newItem);
```

### pop() / shift()

Remove and return last/first item.

```ts
const removed = items.pop();  // From end
const first = items.shift();  // From beginning
```

### remove(...items)

Remove item(s) by reference.

```ts
items.remove(item);
items.remove(item1, item2, item3);
```

Returns the number of items removed.

### removeAt(index)

Remove item at index.

```ts
const removed = items.removeAt(0);
```

### removeWhere(predicate)

Remove items matching predicate.

```ts
const count = items.removeWhere(item => item.done);
```

Returns the number of items removed.

### insert(index, ...items)

Insert item(s) at position.

```ts
items.insert(0, newFirst);
items.insert(2, a, b, c);
```

### set(index, value)

Set item at index. Accepts direct value, reducer, or Immer-style updater.

```ts
// Direct value
items.set(0, newItem);

// Reducer (returns new value)
items.set(0, prev => ({ ...prev, done: true }));

// Immer-style updater (mutates draft)
items.set(0, draft => { draft.done = true });

// With built-in reducers
import { toggle } from 'storion';
items.set(0, toggle()); // If item is boolean
```

::: warning
If using a reducer/updater and the index doesn't exist, nothing happens.
:::

### clear()

Remove all items.

```ts
items.clear();
```

### replace(newItems)

Replace entire array.

```ts
items.replace(newArrayData);
```

### find(predicate)

Find item matching predicate.

```ts
const found = items.find(item => item.id === targetId);
```

### findIndex(predicate)

Find index of item matching predicate.

```ts
const index = items.findIndex(item => item.id === targetId);
```

### includes(item)

Check if item exists.

```ts
if (items.includes(target)) {
  // ...
}
```

### map(fn) / filter(predicate)

Transform or filter items (read-only, doesn't mutate).

```ts
const titles = items.map(item => item.title);
const active = items.filter(item => !item.done);
```

### pick(equality?)

Create a pick selector for fine-grained reactivity.

```ts
const data = items.pick('shallow');
```

## Return Type

```ts
interface FocusList<T> {
  get(): T[];
  get(index: number): T | undefined;
  length(): number;
  isEmpty(): boolean;
  first(): T | undefined;
  last(): T | undefined;
  push(...items: T[]): void;
  unshift(...items: T[]): void;
  pop(): T | undefined;
  shift(): T | undefined;
  remove(...items: T[]): number;
  removeAt(index: number): T | undefined;
  removeWhere(predicate: (item: T, index: number) => boolean): number;
  insert(index: number, ...items: T[]): void;
  set(index: number, itemOrReducerOrUpdater: T | ((prev: T) => T | void)): void;
  clear(): void;
  replace(items: T[]): void;
  find(predicate: (item: T, index: number) => boolean): T | undefined;
  findIndex(predicate: (item: T, index: number) => boolean): number;
  includes(item: T): boolean;
  map<U>(fn: (item: T, index: number) => U): U[];
  filter(predicate: (item: T, index: number) => boolean): T[];
  pick(equality?: PickEquality<T[] | undefined | null>): T[];
}
```

## See Also

- [`map()`](/api/map) - For key-value collections
- [`focus()`](/api/store#focus-path-options) - Core focus API
- [Dynamic Nested State](/guide/dynamic-stores) - Guide for managing collections

