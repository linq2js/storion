# Meta System

The meta system provides a type-safe way to attach metadata to stores and fields. This enables cross-cutting concerns like persistence, validation, devtools integration, and custom middleware behavior.

## Overview

Meta entries are declarative annotations that describe store behavior without implementing it:

```ts
import { meta, store } from 'storion';

// Define meta types
const persist = meta();
const validate = meta<string>();

// Use in store (single meta)
const simpleStore = store({
  name: 'simple',
  state: { data: '' },
  meta: persist(),  // Single meta - no wrapper needed
  setup: /* ... */,
});

// Use in store (multiple metas)
const userStore = store({
  name: 'user',
  state: { email: '', password: '' },
  meta: meta.of(
    persist(),                              // Store-level
    validate.for('email', 'email'),         // Field-level
    validate.for('password', 'min:8'),
  ),
  setup: /* ... */,
});
```

## Creating Meta Types

### Boolean Flag

```ts
const persist = meta();

// Usage: persist() returns true
meta: persist()
```

### Typed Value

```ts
const priority = meta<number>();
const validate = meta<string>();

// Usage: returns the value
meta: priority(1)              // single meta
meta: meta.of(                 // multiple metas
  priority(1),
  validate('required'),
)
```

### Custom Builder

```ts
const deprecated = meta((message: string, since: string) => ({
  message,
  since,
}));

// Usage: returns transformed value
meta: deprecated('Use newField instead', '2.0.0')
```

## Store-Level vs Field-Level

### Store-Level Meta

Applies to the entire store:

```ts
meta: persist()  // single meta

meta: meta.of(   // multiple metas
  persist(),           // Persist entire store
  priority(1),         // Store priority
)
```

### Field-Level Meta

Applies to specific fields:

```ts
meta: persist.for('settings')  // single field meta

meta: meta.of(                 // multiple field metas
  persist.for('settings'),                    // Single field
  persist.for(['name', 'email']),             // Multiple fields
  validate.for('email', 'email'),             // Field with value
  validate.for(['email', 'phone'], 'required'), // Multiple fields, same value
)
```

## Naming Conventions

Follow these patterns for clear, consistent meta names:

| Category | Pattern | Examples |
|----------|---------|----------|
| Boolean flags | Adjective/past participle | `persisted`, `deprecated`, `hidden` |
| Exclusions | `not` + adjective | `notPersisted`, `notLogged` |
| Storage targets | `in` + storage | `inSession`, `inLocal`, `inCloud` |
| Validation | verb/noun | `validate`, `minLength`, `pattern` |
| Config values | noun | `priority`, `debounce`, `throttle` |
| Features | `with` + feature | `withDevtools`, `withHistory` |

```ts
// ✅ Good naming
const persisted = meta();
const notPersisted = meta();
const inSession = meta();
const validate = meta<string>();
const priority = meta<number>();
const withDevtools = meta();

// ❌ Avoid
const p = meta();                // Too short
const persistMeta = meta();      // Redundant "Meta"
const PERSIST = meta();          // Not camelCase
```

## Querying Meta

### In Middleware

```ts
function myMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next();
    }
    
    const instance = ctx.next();
    
    // Query store-level meta
    const persistInfo = ctx.meta(persist);
    if (persistInfo.store) {
      console.log('Store should be persisted');
    }
    
    // Query field-level meta
    for (const [field, value] of Object.entries(persistInfo.fields)) {
      console.log(`Field ${field}:`, value);
    }
    
    return instance;
  };
}
```

### From Store Instance

```ts
const instance = container.get(userStore);

// Query meta
const validateInfo = instance.meta(validate);

// Store-level value
validateInfo.store;  // string | undefined

// Field-level values
validateInfo.fields.email;   // 'email' | undefined
validateInfo.fields.phone;   // 'required' | undefined
```

## MetaQuery API

### Default Query

Returns first matching value:

```ts
const info = ctx.meta(persist);
// { store: true | undefined, fields: { name: true | undefined, ... } }
```

### all() — All Values

Get all values when same meta is applied multiple times:

```ts
const info = ctx.meta.all(validate);
// { store: string[], fields: { email: string[], ... } }
```

### any() — Check Existence

Check if any of the meta types exist:

```ts
if (ctx.meta.any(persist, priority)) {
  console.log('Has persist or priority meta');
}
```

### fields() — Get Field Names

Get field names with specific meta:

```ts
const persistedFields = ctx.meta.fields(persist);
// ['name', 'email']

// With predicate filter
const highPriorityFields = ctx.meta.fields(priority, (v) => v > 5);
```

## Real-World Examples

### Persistence

```ts
const persist = meta();
const notPersisted = meta();

const authStore = store({
  name: 'auth',
  state: { token: '', refreshToken: '', tempData: '' },
  meta: meta.of(
    persist(),                      // Persist store
    notPersisted.for('tempData'),   // Exclude tempData
  ),
});

// In persist middleware
const persistInfo = ctx.meta(persist);
const excludeInfo = ctx.meta(notPersisted);

const fieldsToSave = Object.keys(instance.state).filter(
  field => !excludeInfo.fields[field]
);
```

### Multi-Storage

```ts
const inSession = meta();
const inLocal = meta();
const inCloud = meta();

const appStore = store({
  name: 'app',
  state: { session: '', preferences: '', profile: '' },
  meta: meta.of(
    inSession.for('session'),
    inLocal.for('preferences'),
    inCloud.for('profile'),
  ),
});

// In middleware
const sessionFields = ctx.meta.fields(inSession);  // ['session']
const localFields = ctx.meta.fields(inLocal);      // ['preferences']
const cloudFields = ctx.meta.fields(inCloud);      // ['profile']
```

### Validation

```ts
type Rule = 'required' | 'email' | `min:${number}` | `max:${number}`;
const validate = meta<Rule>();

const userStore = store({
  name: 'user',
  state: { email: '', password: '', bio: '' },
  meta: meta.of(
    validate.for('email', 'email'),
    validate.for('password', 'min:8'),
    validate.for('bio', 'max:500'),
  ),
});

// Validation function
function validateStore(instance: StoreInstance) {
  const rules = instance.meta(validate);
  const errors: Record<string, string> = {};
  
  for (const [field, rule] of Object.entries(rules.fields)) {
    const value = instance.state[field];
    
    if (rule === 'required' && !value) {
      errors[field] = 'Required';
    } else if (rule === 'email' && !isValidEmail(value)) {
      errors[field] = 'Invalid email';
    } else if (rule?.startsWith('min:')) {
      const min = parseInt(rule.split(':')[1]);
      if (value.length < min) {
        errors[field] = `Minimum ${min} characters`;
      }
    }
  }
  
  return errors;
}
```

### DevTools Integration

```ts
const devtools = meta<{ hidden?: boolean; label?: string }>();

const userStore = store({
  name: 'user',
  state: { name: '', _internal: '' },
  meta: meta.of(
    devtools({ label: 'User Profile' }),
    devtools.for('_internal', { hidden: true }),
  ),
});

// In devtools middleware
const info = ctx.meta(devtools);

const label = info.store?.label ?? ctx.displayName;
const hiddenFields = ctx.meta.fields(devtools, v => v.hidden);
```

### Deprecation Warnings

```ts
const deprecated = meta<{ message: string; since: string }>();

const legacyStore = store({
  name: 'legacy',
  state: { oldField: '', newField: '' },
  meta: deprecated.for('oldField', {
    message: 'Use newField instead',
    since: '2.0.0',
  }),
});

// In middleware - warn on access
const deprecatedInfo = ctx.meta(deprecated);

for (const [field, info] of Object.entries(deprecatedInfo.fields)) {
  if (info) {
    console.warn(
      `[Deprecated] ${ctx.displayName}.${field} ` +
      `(since ${info.since}): ${info.message}`
    );
  }
}
```

## Factory Meta

Attach meta to service factories:

```ts
import { withMeta } from 'storion';

// Single meta
const apiService = withMeta(
  (resolver) => ({
    fetch: (url: string) => fetch(url).then(r => r.json()),
  }),
  persist()
);

// Multiple metas
const authService = withMeta(
  (resolver) => ({ /* ... */ }),
  meta.of(persist(), priority(1))
);

// Query in middleware
const info = ctx.meta(persist);
```

## Combining with Middleware

### Pattern: Selective Persistence

```ts
import { meta } from 'storion';
import { applyFor } from 'storion';
import { persist as persistMiddleware } from 'storion/persist';

const persist = meta();

const app = container({
  middleware: [
    applyFor(
      (ctx) => ctx.meta?.any(persist) ?? false,
      persistMiddleware({
        load: (spec) => localStorage.getItem(spec.displayName),
        save: (spec, state) => localStorage.setItem(
          spec.displayName,
          JSON.stringify(state)
        ),
      })
    ),
  ],
});
```

### Pattern: Field-Level Encryption

```ts
const encrypted = meta();

function encryptionMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next();
    }
    
    const instance = ctx.next();
    const encryptedFields = ctx.meta.fields(encrypted);
    
    // Encrypt before save
    const originalHydrate = instance.hydrate;
    instance.hydrate = (data, options) => {
      const decrypted = { ...data };
      for (const field of encryptedFields) {
        if (decrypted[field]) {
          decrypted[field] = decrypt(decrypted[field]);
        }
      }
      return originalHydrate(decrypted, options);
    };
    
    return instance;
  };
}
```

## Type Safety

Meta provides full TypeScript support:

```ts
// Typed meta
const priority = meta<number>();

// Type error: string not assignable to number
meta: priority('high')  // ❌ Error

// Correct usage
meta: priority(1)  // ✅ OK

// Field type checking with meta.of()
const userStore = store({
  state: { name: '', age: 0 },
  meta: meta.of(
    priority.for('name', 1),   // ✅ OK
    priority.for('unknown', 1), // ❌ Error: 'unknown' not in state
  ),
});
```

## Best Practices

### 1. Define Meta Types Once

```ts
// ✅ Good - reusable meta types
// meta/index.ts
export const persist = meta();
export const validate = meta<string>();
export const priority = meta<number>();

// stores/user.ts
import { persist, validate } from '../meta';
```

### 2. Use Semantic Names

```ts
// ✅ Good - clear intent
const notPersisted = meta();
const inSessionStorage = meta();

// ❌ Avoid - unclear
const flag1 = meta();
const x = meta();
```

### 3. Document Custom Meta

```ts
/**
 * Mark fields that require encryption before storage.
 * Used by encryptionMiddleware.
 */
const encrypted = meta();

/**
 * Validation rule for form fields.
 * @example validate.for('email', 'email')
 */
const validate = meta<ValidationRule>();
```

## Next Steps

- **[Middleware](/guide/middleware)** — Using meta in middleware
- **[Persistence](/guide/persistence)** — Persistence with meta
- **[meta() API](/api/meta)** — Complete API reference

