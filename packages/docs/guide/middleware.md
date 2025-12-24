# Middleware

Middleware intercepts store and service creation, enabling cross-cutting concerns like logging, persistence, devtools integration, and more.

## What's This For?

Middleware solves the problem of shared logic across stores. Instead of adding logging, persistence, or validation to each store individually, middleware lets you apply it once to all (or some) stores.

**Common use cases:**
- 📝 **Logging** — Track all state changes
- 💾 **Persistence** — Save state to storage
- 🔧 **DevTools** — Connect to debugging tools
- ✅ **Validation** — Validate state changes
- 📊 **Analytics** — Track user actions

---

## How Middleware Works

Middleware wraps the store creation process. Each middleware can run code before and after store creation:

```
┌───────────────────────────────────────────────────────────────────┐
│                    Middleware Execution Flow                      │
│                                                                   │
│   middleware 1         middleware 2         middleware 3          │
│   ┌─────────┐         ┌─────────┐         ┌─────────┐            │
│   │ BEFORE  │ ──────▶ │ BEFORE  │ ──────▶ │ BEFORE  │            │
│   └─────────┘         └─────────┘         └─────────┘            │
│        │                   │                   │                  │
│        │                   │                   ▼                  │
│        │                   │            ┌─────────────┐           │
│        │                   │            │   STORE     │           │
│        │                   │            │  CREATION   │           │
│        │                   │            └─────────────┘           │
│        │                   │                   │                  │
│   ┌─────────┐         ┌─────────┐         ┌─────────┐            │
│   │ AFTER   │ ◀────── │ AFTER   │ ◀────── │ AFTER   │            │
│   └─────────┘         └─────────┘         └─────────┘            │
└───────────────────────────────────────────────────────────────────┘
```

## Basic Usage

Add middleware when creating a container:

```ts
import { container } from 'storion'

const app = container({
  middleware: [
    loggingMiddleware(),     // First (outermost)
    persistMiddleware(),     // Second
    devtoolsMiddleware(),    // Third (innermost)
  ],
})
```

---

## Your First Middleware (Logger)

Let's create a simple logging middleware to understand the pattern:

```ts
import type { Middleware, MiddlewareContext } from 'storion'

// Middleware is a function that returns another function (factory pattern).
// This allows middleware to accept configuration options.
function loggingMiddleware(): Middleware {
  // The inner function receives a context (ctx) with information about what's
  // being created (store or service) and a `next()` function to continue.
  return (ctx: MiddlewareContext) => {
    // BEFORE: Code here runs before store creation
    console.log(`[LOG] Creating: ${ctx.displayName}`)
    const startTime = performance.now()

    // ctx.next() continues the middleware chain and creates the store.
    // You MUST call this to get the store instance!
    const instance = ctx.next()

    // AFTER: Code here runs after store creation.
    // You have access to the created instance.
    const duration = performance.now() - startTime
    console.log(`[LOG] Created: ${ctx.displayName} (${duration.toFixed(2)}ms)`)

    // Return the instance (you can modify or wrap it before returning).
    return instance
  }
}
```

### Using the Middleware

```ts
import { container } from 'storion'

const app = container({
  middleware: [loggingMiddleware()],
})

// Now any store created from this container will be logged:
// → [LOG] Creating: userStore
// → [LOG] Created: userStore (0.15ms)
```

---

## Middleware Context (ctx)

The context provides information about what's being created:

```ts
interface MiddlewareContext {
  // Type of creation — 'store' for stores, 'factory' for services
  type: 'store' | 'factory'

  // Display name (store name or service function name)
  displayName?: string

  // Store specification (only for stores)
  spec?: StoreSpec

  // Meta query API (only for stores) — see Meta section below
  meta?: MetaQuery

  // Continue middleware chain — you MUST call this!
  next(): unknown
}
```

### Checking Context Type

Always check the type when your middleware is store-specific:

```ts
function storeOnlyMiddleware(): Middleware {
  return (ctx) => {
    // Skip factories (services) — only process stores
    if (ctx.type !== 'store') {
      return ctx.next()  // Pass through unchanged
    }

    // Now we know ctx.spec and ctx.meta are available
    console.log('Processing store:', ctx.spec.name)
    
    return ctx.next()
  }
}
```

---

## Selective Application (applyFor)

Apply middleware only to specific stores:

```ts
import { applyFor } from 'storion'

const app = container({
  middleware: [
    // Pattern matching ──────────────────────────────────────────────────────
    applyFor('userStore', loggingMiddleware()),              // Exact match
    applyFor('user*', loggingMiddleware()),                  // Wildcard: userStore, userSettings
    applyFor('*Store', loggingMiddleware()),                 // Wildcard: userStore, cartStore
    applyFor('*auth*', loggingMiddleware()),                 // Wildcard: authStore, userAuth
    applyFor(/^(user|auth)Store$/, loggingMiddleware()),     // Regular expression
    applyFor(['userStore', 'auth*'], loggingMiddleware()),   // Multiple patterns

    // Predicate function ────────────────────────────────────────────────────
    applyFor(
      (ctx) => ctx.meta?.any(persist),  // Apply to stores with persist meta
      persistMiddleware()
    ),
  ],
})
```

### applyExcept — Exclude Patterns

Apply to all stores EXCEPT matching ones:

```ts
import { applyExcept } from 'storion'

const app = container({
  middleware: [
    // Exclude internal stores (starting with _)
    applyExcept('_*', loggingMiddleware()),
    
    // Exclude cache stores
    applyExcept('*Cache', persistMiddleware()),
    
    // Exclude multiple
    applyExcept(['tempStore', 'debugStore'], analyticsMiddleware()),
  ],
})
```

### forStores — Store-Only Shorthand

Convenient helper to filter for stores only:

```ts
import { forStores } from 'storion'

// forStores() is a shorthand that skips factories automatically.
// Equivalent to checking ctx.type === 'store' yourself.
const storeLogger = forStores((ctx) => {
  console.log(`Creating store: ${ctx.displayName}`)
  return ctx.next()
})
```

---

## Middleware Order

Middleware executes in the order specified, with each wrapping the next:

```ts
const app = container({
  middleware: [
    first(),   // Outermost — runs first (before), runs last (after)
    second(),  // Middle
    third(),   // Innermost — runs last (before), runs first (after)
  ],
})

// Execution order:
// 1. first (before)
// 2. second (before)
// 3. third (before)
// 4. → STORE CREATION ←
// 5. third (after)
// 6. second (after)
// 7. first (after)
```

### Why This Matters

If you need logging to capture everything (including errors from other middleware), put it first:

```ts
const app = container({
  middleware: [
    loggingMiddleware(),     // ← Captures everything
    validationMiddleware(),  // Might throw
    persistMiddleware(),     // Might throw
  ],
})
```

---

## Using Meta in Middleware

Middleware can read store metadata to make decisions:

```ts
import { meta } from 'storion'

// Define meta types
const persist = meta()              // Boolean flag
const priority = meta<number>()     // Typed value

function smartMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next()
    }

    const instance = ctx.next()

    // ctx.meta() queries metadata defined on the store
    const persistInfo = ctx.meta(persist)
    if (persistInfo.store) {
      console.log(`${ctx.displayName} should be persisted`)
    }

    // Check field-level meta
    const priorityInfo = ctx.meta(priority)
    for (const [field, value] of Object.entries(priorityInfo.fields)) {
      console.log(`${field} has priority: ${value}`)
    }

    // Helper methods on ctx.meta
    // Check if ANY meta of these types exists
    if (ctx.meta.any(persist, priority)) {
      console.log('Has persist or priority meta')
    }

    // Get all fields with specific meta
    const persistedFields = ctx.meta.fields(persist)
    console.log('Persisted fields:', persistedFields)

    return instance
  }
}
```

---

## Recipes: Common Middleware Patterns

### State Change Logger

```ts
function stateLoggerMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next()
    }

    const instance = ctx.next()

    // Subscribe to state changes after creation
    instance.subscribe((state, prevState) => {
      console.group(`[${ctx.displayName}] State changed`)
      console.log('Previous:', prevState)
      console.log('Current:', state)
      console.groupEnd()
    })

    return instance
  }
}
```

### Action Tracker

```ts
function actionTrackerMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next()
    }

    const instance = ctx.next()

    // Subscribe to action dispatches with '@*' pattern
    instance.subscribe('@*', (event) => {
      const { next } = event
      console.log(
        `[Action] ${ctx.displayName}.${next.name}`,
        next.args,
        `(${next.duration}ms)`
      )
    })

    return instance
  }
}
```

### Error Boundary

```ts
function errorBoundaryMiddleware(): Middleware {
  return (ctx) => {
    try {
      return ctx.next()
    } catch (error) {
      console.error(`[ERROR] Failed to create ${ctx.displayName}:`, error)
      
      // Option 1: Re-throw (let it bubble up)
      throw error
      
      // Option 2: Return a fallback store (advanced)
      // return createFallbackStore()
    }
  }
}
```

### Performance Monitor

```ts
function performanceMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type !== 'store') {
      return ctx.next()
    }

    const startTime = performance.now()
    const instance = ctx.next()
    const createTime = performance.now() - startTime

    // Warn if creation takes too long
    if (createTime > 10) {
      console.warn(
        `[PERF] ${ctx.displayName} took ${createTime.toFixed(2)}ms to create`
      )
    }

    // Track action performance
    instance.subscribe('@*', (event) => {
      if (event.next.duration > 100) {
        console.warn(
          `[PERF] ${ctx.displayName}.${event.next.name} took ${event.next.duration}ms`
        )
      }
    })

    return instance
  }
}
```

---

## Built-in Middleware

### persist()

Persist store state to storage. See [Persistence Guide](/guide/persistence) for details.

```ts
import { persist } from 'storion/persist'

const app = container({
  middleware: [
    persist({
      load: (spec) => {
        const data = localStorage.getItem(spec.displayName)
        return data ? JSON.parse(data) : undefined
      },
      save: (spec, state) => {
        localStorage.setItem(spec.displayName, JSON.stringify(state))
      },
    }),
  ],
})
```

### devtoolsMiddleware()

Enable DevTools integration. See [DevTools Guide](/guide/devtools) for details.

```ts
import { devtoolsMiddleware } from 'storion/devtools'

const app = container({
  middleware: [
    devtoolsMiddleware({
      name: 'My App',
      maxHistory: 50,
    }),
  ],
})
```

---

## Common Mistakes

### ❌ Forgetting to Call `next()`

```ts
// ❌ WRONG — breaks the chain, store is never created
function badMiddleware(): Middleware {
  return (ctx) => {
    console.log('Hello')
    // Missing ctx.next()!
    return {}  // Returns empty object instead of store
  }
}

// ✅ CORRECT — always call next()
function goodMiddleware(): Middleware {
  return (ctx) => {
    console.log('Hello')
    return ctx.next()  // Continue the chain
  }
}
```

### ❌ Not Checking Context Type

```ts
// ❌ WRONG — crashes on services (ctx.spec is undefined)
function badMiddleware(): Middleware {
  return (ctx) => {
    console.log(ctx.spec.name)  // TypeError: Cannot read property 'name' of undefined
    return ctx.next()
  }
}

// ✅ CORRECT — check type first
function goodMiddleware(): Middleware {
  return (ctx) => {
    if (ctx.type === 'store') {
      console.log(ctx.spec.name)  // Safe
    }
    return ctx.next()
  }
}
```

### ❌ Not Cleaning Up Resources

```ts
// ❌ WRONG — subscription leaks when store is disposed
function badMiddleware(): Middleware {
  return (ctx) => {
    const instance = ctx.next()
    
    const sub = someService.subscribe(() => {
      // This keeps running forever!
    })
    
    return instance
  }
}

// ✅ CORRECT — clean up on dispose
function goodMiddleware(): Middleware {
  return (ctx) => {
    const instance = ctx.next()
    
    const sub = someService.subscribe(() => {
      // ...
    })
    
    // Register cleanup
    instance.onDispose(() => {
      sub.unsubscribe()
    })
    
    return instance
  }
}
```

---

## Best Practices

1. **Always call `ctx.next()`** — The chain must continue
2. **Check context type** — Not all middleware applies to both stores and services
3. **Clean up resources** — Use `instance.onDispose()` to avoid leaks
4. **Keep middleware focused** — One concern per middleware
5. **Order matters** — Put logging first to catch everything
6. **Use `applyFor`** — Don't apply middleware to stores that don't need it

---

## Next Steps

| Topic | What You'll Learn |
|-------|-------------------|
| [Persistence](/guide/persistence) | Saving state to storage |
| [DevTools](/guide/devtools) | Debugging with browser devtools |
| [Meta](/guide/meta) | Declarative store annotations |
| [container() API](/api/container) | Complete API reference |

---

**Ready?** [Learn about Persistence →](/guide/persistence)
