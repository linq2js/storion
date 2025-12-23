# meta()

Creates custom metadata types for cross-cutting concerns like persistence, validation, and devtools.

## Signature

```ts
// 1. Boolean flag meta - myMeta() returns true
function meta(): MetaType<[], true>;

// 2. Typed value meta - myMeta(value) returns value
function meta<TValue>(): MetaType<[value: TValue], TValue>;

// 3. Custom builder meta - myMeta(...args) returns builder result
function meta<TValue, TArgs extends any[]>(
  builder: (...args: TArgs) => TValue
): MetaType<TArgs, TValue>;
```

## Basic Example

```ts
import { meta } from "storion";

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
  persist.for(["name", "email", "preferences"]),
  validate.for(["email", "phone"], "required"),
];
```

## Naming Conventions

Follow these conventions for clear, consistent meta type names:

| Category        | Pattern                     | Examples                                         |
| --------------- | --------------------------- | ------------------------------------------------ |
| Boolean flags   | Adjective/past participle   | `persisted`, `deprecated`, `hidden`, `cached`    |
| Exclusions      | `not` + adjective           | `notPersisted`, `notLogged`, `notCached`         |
| Storage targets | `in` + storage              | `inSession`, `inLocal`, `inCloud`, `inIndexedDB` |
| Validation      | verb/noun                   | `validate`, `minLength`, `pattern`, `sanitize`   |
| Config values   | noun                        | `priority`, `debounce`, `throttle`, `ttl`        |
| Features        | `with` + feature or `-able` | `withDevtools`, `withHistory`, `loggable`        |

```ts
// ✅ Good naming
const persisted = meta(); // Boolean flag
const notPersisted = meta(); // Exclusion
const inSession = meta(); // Storage target
const inLocal = meta(); // Storage target
const validate = meta<string>(); // Validation rule
const priority = meta<number>(); // Config value
const withDevtools = meta(); // Feature flag

// ❌ Avoid unclear names
const p = meta(); // Too short
const persistMeta = meta(); // Redundant "Meta" suffix
const PERSIST = meta(); // Not camelCase
const sessionStore = meta(); // Conflicts with store naming
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
      console.log("Store should be persisted");
    }

    // Field-level values
    for (const [field, value] of Object.entries(persistInfo.fields)) {
      console.log(`Field ${field} has persist value:`, value);
    }

    return instance;
  };
}
```

### From Store Instance

```ts
// Get store instance
const instance = container.get(userStore);

// Query meta - returns MetaInfo with store and fields
const validateInfo = instance.meta(validate);

// Store-level value
validateInfo.store;
// Returns: string | undefined

// Field-level values
validateInfo.fields.email;
// Returns: 'email' | undefined

validateInfo.fields.phone;
// Returns: 'required' | undefined

// Iterate all fields
for (const [field, rule] of Object.entries(validateInfo.fields)) {
  console.log(`${field}: ${rule}`);
}
```

## MetaType API

```ts
interface MetaType<TValue> {
  // Store-level meta
  (): MetaEntry<any, TValue>;
  (value: TValue): MetaEntry<any, TValue>;

  // Field-level meta
  for<TField extends string>(field: TField): MetaEntry<TField, true>;
  for<TField extends string>(
    field: TField,
    value: TValue
  ): MetaEntry<TField, TValue>;
  for<TField extends string>(fields: TField[]): MetaEntry<TField, true>;
  for<TField extends string>(
    fields: TField[],
    value: TValue
  ): MetaEntry<TField, TValue>;
}
```

## MetaQuery API

The `MetaQuery` interface provides methods to query metadata:

```ts
interface MetaQuery {
  // Default call: returns first matching value for store and each field
  <TValue>(type: MetaType<TValue>): MetaInfo<TValue>;

  // Get all matching values as arrays (when same meta applied multiple times)
  all<TValue>(type: MetaType<TValue>): AllMetaInfo<TValue>;

  // Check if any of the types exist
  any(...types: MetaType<any>[]): boolean;

  // Get field names with a specific meta type
  fields<TValue>(
    type: MetaType<TValue>,
    predicate?: (value: TValue) => boolean
  ): string[];
}

interface MetaInfo<TValue> {
  store: TValue | undefined; // Store-level value
  fields: Record<string, TValue | undefined>; // Field-level values
}

interface AllMetaInfo<TValue> {
  store: TValue[]; // All store-level values
  fields: Record<string, TValue[]>; // All field-level values
}
```

### fields() Method

Get all field names that have a specific meta type. Useful for multi-storage patterns:

```ts
const inSession = meta();
const inLocal = meta();

const authStore = store({
  name: "auth",
  state: { token: "", refreshToken: "", userId: "" },
  meta: [inSession.for(["token"]), inLocal.for(["refreshToken", "userId"])],
});

// In middleware
const sessionFields = ctx.meta.fields(inSession);
// Returns: ['token']

const localFields = ctx.meta.fields(inLocal);
// Returns: ['refreshToken', 'userId']

// With predicate filter
const priority = meta<number>();
const highPriorityFields = ctx.meta.fields(priority, (v) => v > 5);
```

## Real-World Examples

### Persistence Meta

```ts
const persist = meta();

// Usage
meta: [
  persist(), // persist entire store
  persist.for("settings"), // persist settings field only
];

// In middleware
const info = ctx.meta(persist);
if (info.store || Object.keys(info.fields).length > 0) {
  // Setup persistence
}
```

### Validation Meta

```ts
type ValidationRule = "required" | "email" | "min:N" | "max:N";
const validate = meta<ValidationRule>();

// Usage
meta: [
  validate.for("email", "email"),
  validate.for("name", "required"),
  validate.for("password", "min:8"),
];

// Query
const rules = userStore.meta(validate).all();
// { email: 'email', name: 'required', password: 'min:8' }
```

### Devtools Meta

```ts
const devtools = meta<{ hidden?: boolean; label?: string }>();

// Usage
meta: [
  devtools({ label: "User Profile" }),
  devtools.for("_internal", { hidden: true }),
];
```

### Deprecated Fields

```ts
const deprecated = meta<{ message: string; since: string }>();

// Usage
meta: [
  deprecated.for("oldField", {
    message: "Use newField instead",
    since: "2.0.0",
  }),
];

// In middleware - warn when accessing deprecated fields
const deprecatedInfo = ctx.meta(deprecated);
for (const [field, info] of Object.entries(deprecatedInfo.fields)) {
  console.warn(`${field} is deprecated since ${info.since}: ${info.message}`);
}
```

## Factory Meta

Attach meta to service factories:

```ts
import { withMeta } from "storion";

const apiService = withMeta(
  (resolver) => ({
    fetch: (url: string) => fetch(url).then((r) => r.json()),
  }),
  [persist()] // Meta entries
);

// Query in middleware
const info = ctx.meta(persist);
```

## See Also

- [notPersisted](/api/not-persisted) - Built-in persistence meta
- [persist()](/api/persist-middleware) - Using meta for persistence
- [store()](/api/store) - Creating stores with meta
