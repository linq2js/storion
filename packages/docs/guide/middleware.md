# Middleware

Middleware intercepts store and service creation, enabling cross-cutting concerns like logging, persistence, devtools integration, and more.

## Overview

Middleware wraps the store creation process:

```ts
import { container } from 'storion';

const app = container({
  middleware: [
    loggingMiddleware(),
    persistMiddleware(),
    devtoolsMiddleware(),
  ],
});
```

## Creating Middleware

### Basic Structure

```ts
import type { Middleware, MiddlewareContext } from 'storion';

function myMiddleware(): Middleware {
  return (ctx: MiddlewareContext) => {
    // Before store creation
    console.log(`Creating: ${ctx.displayName}`);
    
    // Continue the chain and get the instance
    const instance = ctx.next();
    
    // After store creation
    console.log(`Created: ${ctx.displayName}`);
    
    return instance;
  };
}
```

### Middleware Context

The context provides information about what's being created:

```ts
interface MiddlewareContext {
  // Type of creation
  type: 'store' | 'factory';
  
  // Display name (for stores)
  displayName?: string;
  
  // Store specification (for stores)
  spec?: StoreSpec;
  
  // Continue middleware chain
  next(): unknown;
  
  // Query meta (for stores)
  meta?: MetaQuery;
}
```

### Store-Specific Context

For store middleware, additional properties are available:

```ts
interface StoreMiddlewareContext extends MiddlewareContext {
  type: 'store';
  spec: StoreSpec;
  meta: MetaQuery;
  
  // Get typed instance
  next(): StoreInstance;
}
```

## Examples

### Logging Middleware

```ts
function loggingMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next();
    }
    
    const startTime = performance.now();
    console.log(`[Store] Creating: ${ctx.displayName}`);
    
    const instance = ctx.next();
    
    const duration = performance.now() - startTime;
    console.log(`[Store] Created: ${ctx.displayName} (${duration.toFixed(2)}ms)`);
    
    // Subscribe to state changes
    instance.subscribe(() => {
      console.log(`[Store] ${ctx.displayName} state:`, instance.state);
    });
    
    return instance;
  };
}
```

### Action Tracking Middleware

```ts
function actionTrackingMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next();
    }
    
    const instance = ctx.next();
    
    // Subscribe to all action dispatches
    instance.subscribe('@*', (event) => {
      const { next } = event;
      console.log(`[Action] ${ctx.displayName}.${next.name}`, next.args);
    });
    
    return instance;
  };
}
```

### Validation Middleware

```ts
function validationMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next();
    }
    
    const instance = ctx.next();
    
    // Get validation rules from meta
    const rules = ctx.meta(validateMeta);
    
    // Subscribe to state changes
    instance.subscribe(() => {
      for (const [field, rule] of Object.entries(rules.fields)) {
        const value = instance.state[field];
        if (!validateField(value, rule)) {
          console.warn(`Validation failed: ${field}`);
        }
      }
    });
    
    return instance;
  };
}
```

## Conditional Middleware

### applyFor() — Match by Pattern

Apply middleware only to matching stores:

```ts
import { applyFor } from 'storion';

// Exact match
applyFor('userStore', loggingMiddleware())

// Wildcard patterns
applyFor('user*', loggingMiddleware())       // userStore, userCache
applyFor('*Store', loggingMiddleware())      // userStore, authStore
applyFor('*auth*', loggingMiddleware())      // authStore, userAuth

// RegExp
applyFor(/^(user|auth)Store$/, loggingMiddleware())

// Multiple patterns
applyFor(['userStore', 'auth*'], loggingMiddleware())

// Predicate function
applyFor(
  (ctx) => ctx.meta?.any(persist),
  persistMiddleware()
)
```

### applyExcept() — Exclude Patterns

Apply middleware to all except matching stores:

```ts
import { applyExcept } from 'storion';

// Exclude by pattern
applyExcept('_*', loggingMiddleware())        // exclude _internal, _temp
applyExcept('*Cache', persistMiddleware())    // exclude userCache, dataCache

// Exclude multiple
applyExcept(['tempStore', 'cacheStore'], persistMiddleware())

// Exclude by predicate
applyExcept(
  (ctx) => ctx.displayName?.startsWith('_') ?? false,
  loggingMiddleware()
)
```

### Object Form

Map patterns to middleware:

```ts
import { applyFor } from 'storion';

const conditionalMiddleware = applyFor({
  'userStore': loggingMiddleware(),
  'auth*': [authMiddleware(), securityMiddleware()],
  '*Cache': cacheMiddleware(),
});

const app = container({
  middleware: [conditionalMiddleware],
});
```

### forStores() — Store-Only

Run middleware only for stores, not factories:

```ts
import { forStores } from 'storion';

const storeLogger = forStores((ctx) => {
  console.log(`Creating store: ${ctx.spec.displayName}`);
  return ctx.next();
});
```

## Middleware Order

Middleware executes in order, wrapping each other:

```ts
const app = container({
  middleware: [
    first(),   // Runs first (outermost)
    second(),  // Runs second
    third(),   // Runs third (innermost)
  ],
});

// Execution order:
// first before → second before → third before
// → store creation →
// third after → second after → first after
```

## Default Middleware

Set defaults for all containers:

```ts
import { container } from 'storion';

// Apply to all future containers
container.defaults({
  pre: [devtoolsMiddleware()],  // Before user middleware
  post: [loggingMiddleware()],  // After user middleware
});

// This container has both default and custom middleware
const app = container({
  middleware: [customMiddleware()],
});
// Order: devtools → custom → logging
```

## Built-in Middleware

### persist()

Persist store state to storage:

```ts
import { persist } from 'storion/persist';

const app = container({
  middleware: [
    persist({
      load: (spec) => localStorage.getItem(spec.displayName),
      save: (spec, state) => localStorage.setItem(spec.displayName, JSON.stringify(state)),
    }),
  ],
});
```

See [Persistence Guide](/guide/persistence) for details.

### devtoolsMiddleware()

Enable devtools integration:

```ts
import { devtoolsMiddleware } from 'storion/devtools';

const app = container({
  middleware: [
    devtoolsMiddleware({ maxHistory: 50 }),
  ],
});
```

See [DevTools Guide](/guide/devtools) for details.

## Using Meta in Middleware

Query store metadata for conditional behavior:

```ts
import { meta } from 'storion';

const persist = meta();
const priority = meta<number>();

function smartMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next();
    }
    
    const instance = ctx.next();
    
    // Check store-level meta
    const persistInfo = ctx.meta(persist);
    if (persistInfo.store) {
      console.log('Store should be persisted');
    }
    
    // Check field-level meta
    const priorityInfo = ctx.meta(priority);
    for (const [field, value] of Object.entries(priorityInfo.fields)) {
      console.log(`${field} has priority: ${value}`);
    }
    
    // Check if any meta exists
    if (ctx.meta.any(persist, priority)) {
      console.log('Has persist or priority meta');
    }
    
    // Get fields with specific meta
    const persistedFields = ctx.meta.fields(persist);
    console.log('Persisted fields:', persistedFields);
    
    return instance;
  };
}
```

## Advanced Patterns

### Middleware Composition

Combine multiple middleware into one:

```ts
function combinedMiddleware(): Middleware {
  return (ctx) => {
    // First middleware logic
    console.log('First');
    
    // Create wrapper for second middleware
    const wrappedCtx = {
      ...ctx,
      next: () => {
        // Second middleware logic
        console.log('Second');
        return ctx.next();
      },
    };
    
    return wrappedCtx.next();
  };
}
```

### Instance Enhancement

Add properties or methods to store instances:

```ts
function enhanceMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next();
    }
    
    const instance = ctx.next();
    
    // Add custom method
    (instance as any).customMethod = () => {
      console.log('Custom method called');
    };
    
    // Add metadata
    (instance as any)._createdAt = Date.now();
    
    return instance;
  };
}
```

### Error Handling

Handle errors in store creation:

```ts
function errorHandlingMiddleware(): Middleware {
  return (ctx) => {
    try {
      return ctx.next();
    } catch (error) {
      console.error(`Failed to create: ${ctx.displayName}`, error);
      
      // Optionally return a fallback
      // or re-throw
      throw error;
    }
  };
}
```

### Async Initialization

Handle async setup in middleware:

```ts
function asyncInitMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next();
    }
    
    const instance = ctx.next();
    
    // Add async init method
    (instance as any).init = async () => {
      const data = await loadInitialData(ctx.displayName);
      instance.hydrate(data);
    };
    
    return instance;
  };
}
```

## Best Practices

### 1. Check Context Type

```ts
// ✅ Good - handle both stores and factories
function middleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next(); // Pass through factories
    }
    // Handle stores
    return ctx.next();
  };
}
```

### 2. Always Call next()

```ts
// ✅ Good - always continue chain
function middleware(): Middleware {
  return (ctx) => {
    doSomething();
    return ctx.next(); // Must call!
  };
}

// ❌ Bad - breaks chain
function middleware(): Middleware {
  return (ctx) => {
    return {}; // Missing ctx.next()!
  };
}
```

### 3. Clean Up Resources

```ts
function middleware(): Middleware {
  return (ctx) => {
    const instance = ctx.next();
    
    const subscription = someService.subscribe(() => {
      // ...
    });
    
    // Clean up on dispose
    instance.onDispose(() => {
      subscription.unsubscribe();
    });
    
    return instance;
  };
}
```

## Next Steps

- **[DevTools](/guide/devtools)** — Devtools middleware deep dive
- **[Persistence](/guide/persistence)** — Persistence middleware
- **[Meta System](/guide/meta)** — Using meta for conditional middleware
- **[container() API](/api/container)** — Complete API reference

