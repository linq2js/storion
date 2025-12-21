# meta()

Creates custom metadata types for cross-cutting concerns like persistence, validation, and devtools.

## Signature

```ts
function meta<TValue = true>(): MetaType<TValue>
function meta<TValue>(defaultValue: TValue): MetaType<TValue>
```

## Basic Example

```ts
import { meta } from 'storion';

// Flag-style meta (value is true)
const persist = meta();

// Meta with custom value
const validate = meta<string>();
const deprecated = meta<{ message: string; since: string }>();
```

## Using Meta

### Store-Level Meta

```ts
const userStore = store({
  name: 'user',
  state: { name: '', email: '' },
  meta: [
    persist(),           // value: true
    validate('schema'),  // value: 'schema'
  ],
  setup: /* ... */,
});
```

### Field-Level Meta

```ts
const userStore = store({
  name: 'user',
  state: {
    name: '',
    email: '',
    password: '',
  },
  meta: [
    persist.for('name'),           // persist name field
    persist.for('email'),          // persist email field
    validate.for('email', 'email'), // validate email field with 'email' rule
    // password not marked - won't be persisted
  ],
  setup: /* ... */,
});
```

### Multiple Fields

```ts
meta: [
  persist.for(['name', 'email', 'preferences']),
  validate.for(['email', 'phone'], 'required'),
]
```

## Querying Meta

### In Middleware

```ts
function myMiddleware(): StoreMiddleware {
  return (ctx) => {
    const instance = ctx.next();
    
    // Query meta using the context
    const persistInfo = ctx.meta(persist);
    
    // Store-level value
    if (persistInfo.store) {
      console.log('Store should be persisted');
    }
    
    // Field-level values
    for (const [field, value] of Object.entries(persistInfo.fields)) {
      console.log(`Field ${field} has persist value:`, value);
    }
    
    return instance;
  };
}
```

### From Store Spec

```ts
// Get meta query from spec
const validateInfo = userStore.meta(validate);

// Single field
const emailRule = validateInfo.single('email');
// Returns: 'email' | undefined

// All fields
const allRules = validateInfo.all();
// Returns: { email: 'email', phone: 'required' }

// Any matching
const hasValidation = validateInfo.any();
// Returns: true if any field has this meta
```

## MetaType API

```ts
interface MetaType<TValue> {
  // Store-level meta
  (): MetaEntry<any, TValue>;
  (value: TValue): MetaEntry<any, TValue>;
  
  // Field-level meta
  for<TField extends string>(field: TField): MetaEntry<TField, true>;
  for<TField extends string>(field: TField, value: TValue): MetaEntry<TField, TValue>;
  for<TField extends string>(fields: TField[]): MetaEntry<TField, true>;
  for<TField extends string>(fields: TField[], value: TValue): MetaEntry<TField, TValue>;
}
```

## MetaQuery API

```ts
interface MetaQuery<TValue> {
  // Get store-level value
  store: TValue | undefined;
  
  // Get all field values
  fields: Record<string, TValue>;
  
  // Query methods
  single(field: string): TValue | undefined;
  all(): Record<string, TValue>;
  any(): boolean;
}
```

## Real-World Examples

### Persistence Meta

```ts
const persist = meta();

// Usage
meta: [
  persist(),                    // persist entire store
  persist.for('settings'),      // persist settings field only
]

// In middleware
const info = ctx.meta(persist);
if (info.store || Object.keys(info.fields).length > 0) {
  // Setup persistence
}
```

### Validation Meta

```ts
type ValidationRule = 'required' | 'email' | 'min:N' | 'max:N';
const validate = meta<ValidationRule>();

// Usage
meta: [
  validate.for('email', 'email'),
  validate.for('name', 'required'),
  validate.for('password', 'min:8'),
]

// Query
const rules = userStore.meta(validate).all();
// { email: 'email', name: 'required', password: 'min:8' }
```

### Devtools Meta

```ts
const devtools = meta<{ hidden?: boolean; label?: string }>();

// Usage
meta: [
  devtools({ label: 'User Profile' }),
  devtools.for('_internal', { hidden: true }),
]
```

### Deprecated Fields

```ts
const deprecated = meta<{ message: string; since: string }>();

// Usage
meta: [
  deprecated.for('oldField', {
    message: 'Use newField instead',
    since: '2.0.0',
  }),
]

// In middleware - warn when accessing deprecated fields
const deprecatedInfo = ctx.meta(deprecated);
for (const [field, info] of Object.entries(deprecatedInfo.fields)) {
  console.warn(`${field} is deprecated since ${info.since}: ${info.message}`);
}
```

## Factory Meta

Attach meta to service factories:

```ts
import { withMeta } from 'storion';

const apiService = withMeta(
  (resolver) => ({
    fetch: (url: string) => fetch(url).then(r => r.json()),
  }),
  [persist()]  // Meta entries
);

// Query in middleware
const info = ctx.meta(persist);
```

## See Also

- [notPersisted](/api/not-persisted) - Built-in persistence meta
- [persistMiddleware()](/api/persist-middleware) - Using meta for persistence
- [Meta Guide](/guide/meta) - Deep dive into the meta system

