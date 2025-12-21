# notPersisted

Meta marker to exclude stores or fields from persistence.

## Import

```ts
import { notPersisted } from 'storion/persist';
```

## Store-Level Exclusion

Exclude an entire store from persistence:

```ts
import { store } from 'storion';
import { notPersisted } from 'storion/persist';

const sessionStore = store({
  name: 'session',
  state: {
    token: '',
    refreshToken: '',
    expiry: 0,
  },
  meta: [notPersisted()],  // Entire store excluded
  setup({ state }) {
    return {
      setTokens: (token: string, refreshToken: string, expiry: number) => {
        state.token = token;
        state.refreshToken = refreshToken;
        state.expiry = expiry;
      },
      clear: () => {
        state.token = '';
        state.refreshToken = '';
        state.expiry = 0;
      },
    };
  },
});
```

## Field-Level Exclusion

Exclude specific fields from persistence:

```ts
const userStore = store({
  name: 'user',
  state: {
    name: '',
    email: '',
    password: '',         // Sensitive - don't persist
    confirmPassword: '',  // Temporary - don't persist
    rememberMe: false,    // Will be persisted
  },
  meta: [
    notPersisted.for('password'),
    notPersisted.for('confirmPassword'),
  ],
  setup: /* ... */,
});
```

## Multiple Fields

Exclude multiple fields with a single entry:

```ts
const formStore = store({
  name: 'form',
  state: {
    username: '',
    password: '',
    confirmPassword: '',
    securityAnswer: '',
    savedData: {},
  },
  meta: [
    notPersisted.for(['password', 'confirmPassword', 'securityAnswer']),
  ],
  setup: /* ... */,
});
```

## How It Works

When `persistMiddleware` processes a store:

1. **Store-level check**: If `notPersisted()` is in meta, the entire store is skipped
2. **Field-level filtering**: Fields marked with `notPersisted.for()` are excluded from:
   - `dehydrate()` - not saved to storage
   - `hydrate()` - not restored from storage

## Example: Form with Validation

```ts
const signupStore = store({
  name: 'signup',
  state: {
    // Persist these (user convenience)
    email: '',
    username: '',
    agreeToTerms: false,
    
    // Don't persist (security/temporary)
    password: '',
    confirmPassword: '',
    validationErrors: {} as Record<string, string>,
    isSubmitting: false,
  },
  meta: [
    notPersisted.for(['password', 'confirmPassword', 'validationErrors', 'isSubmitting']),
  ],
  setup({ state, update }) {
    return {
      setField: (field: keyof typeof state, value: unknown) => {
        (state as any)[field] = value;
      },
      
      validate: () => {
        const errors: Record<string, string> = {};
        
        if (state.password.length < 8) {
          errors.password = 'Password must be at least 8 characters';
        }
        if (state.password !== state.confirmPassword) {
          errors.confirmPassword = 'Passwords do not match';
        }
        
        state.validationErrors = errors;
        return Object.keys(errors).length === 0;
      },
      
      submit: async () => {
        if (!this.validate()) return;
        
        state.isSubmitting = true;
        try {
          await api.signup({
            email: state.email,
            username: state.username,
            password: state.password,
          });
        } finally {
          state.isSubmitting = false;
        }
      },
    };
  },
});
```

## Use Cases

| Use Case | Level | Example |
|----------|-------|---------|
| Session tokens | Store | `meta: [notPersisted()]` |
| Passwords | Field | `notPersisted.for('password')` |
| Confirmation inputs | Field | `notPersisted.for('confirmPassword')` |
| Validation state | Field | `notPersisted.for('errors')` |
| Loading flags | Field | `notPersisted.for('isLoading')` |
| Sensitive data | Store/Field | Credit cards, SSN, etc. |
| Derived/computed | Field | Cached calculations |

## Combining with filter

You can use both `notPersisted` and `filter` option:

```ts
persistMiddleware({
  // Only persist these stores
  filter: (spec) => ['user', 'settings', 'cart'].includes(spec.displayName),
  
  load: /* ... */,
  save: /* ... */,
})

// Plus per-store field exclusions via notPersisted.for()
```

## See Also

- [persistMiddleware()](/api/persist-middleware) - Persistence middleware
- [meta()](/api/meta) - Creating custom meta types

