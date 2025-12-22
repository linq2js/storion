# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `MetaEntry.fields` now supports arrays for applying meta to multiple fields at once
  ```ts
  meta: [notPersisted.for(["password", "token"])];
  ```
- `MetaQuery.fields(type, predicate?)` method to get field names with a specific meta type
  ```ts
  const sessionFields = ctx.meta.fields(sessionStore); // ['token', 'userId']
  const highPriority = ctx.meta.fields(priority, (v) => v > 5);
  ```
- `applyFor` now supports object form to map patterns to different middleware
  ```ts
  applyFor({
    userStore: loggingMiddleware,
    "auth*": [authMiddleware, securityMiddleware],
    "*Cache": cacheMiddleware,
  });
  ```

### Changed

- **BREAKING**: `persistMiddleware` API refactored for better encapsulation

  - New `handler` option replaces `load`/`save` callbacks
  - Handler receives `PersistContext` (extends `StoreMiddlewareContext` with `store` instance)
  - Handler returns `{ load, save }` object (can be sync or async)
  - `onError` signature changed to `(error, operation)` where operation is `"init" | "load" | "save"`
  - Enables encapsulated async initialization (e.g., IndexedDB)

  ```ts
  // Before (old API)
  persistMiddleware({
    load: (ctx) => localStorage.getItem(ctx.displayName),
    save: (ctx, state) =>
      localStorage.setItem(ctx.displayName, JSON.stringify(state)),
  });

  // After (new API)
  persistMiddleware({
    handler: (ctx) => {
      const key = `app:${ctx.displayName}`;
      return {
        load: () => JSON.parse(localStorage.getItem(key) || "null"),
        save: (state) => localStorage.setItem(key, JSON.stringify(state)),
      };
    },
  });

  // Async handler (IndexedDB)
  persistMiddleware({
    handler: async (ctx) => {
      const db = await openDB("app-db");
      return {
        load: () => db.get("stores", ctx.displayName),
        save: (state) => db.put("stores", state, ctx.displayName),
      };
    },
  });
  ```

---

## [0.8.0] - 2024-12-21

### Added

- **Persist Module** (`storion/persist`)
  - `persistMiddleware(options)` for automatic state persistence
  - `notPersisted` meta for excluding stores or fields from persistence
  - Supports sync and async `load`/`save` handlers
  - `force` option to override dirty state during hydration
- **Meta System**
  - `meta()` function for creating typed metadata builders
  - `MetaType.for(field)` and `MetaType.for([fields])` for field-level meta
  - `MetaQuery` with `.all()` and `.any()` query methods
  - `withMeta(factory, entries)` for attaching meta to factories
  - Meta available in middleware via `ctx.meta(type)`
- **Middleware Utilities**
  - `forStores(middleware)` helper for store-only middleware
  - `applyFor(patterns, middleware)` for conditional middleware
  - `applyExcept(patterns, middleware)` for exclusion patterns
- `store.hydrate(state, { force })` - force option to override dirty properties

### Changed

- `StoreMiddlewareContext` now includes `meta` property for querying store metadata
- `FactoryMiddlewareContext` now includes `meta` property for querying factory metadata

---

## [0.7.0] - 2024-12-15

### Added

- **DevTools Module** (`storion/devtools`)
  - `devtoolsMiddleware()` for state inspection
  - `__revertState` and `__takeSnapshot` injected actions
  - State history tracking with configurable `maxHistory`
  - DevTools panel (`storion/devtools-panel`)
- **withStore HOC** for React
  - Separates data selection from rendering
  - Automatic memoization
  - Direct mode and HOC mode
- `createWithStore(useContextHook)` factory for custom `withStore` implementations
- `create()` shorthand for single-store apps returning `[instance, useHook, withStore]`

### Changed

- Improved TypeScript inference for store actions

---

## [0.6.0] - 2024-12-01

### Added

- **Async Module** (`storion/async`)
  - `async.fresh<T>()` - throws during loading (Suspense-compatible)
  - `async.stale<T>(initialData)` - returns stale data during loading
  - `async.wait(state)` - extracts data or throws
  - Automatic request cancellation via `ctx.signal`
  - `ctx.safe(promise)` for effect-safe async operations
- `trigger(action, deps, ...args)` for declarative data fetching in components

### Changed

- Effects now require synchronous functions (use `ctx.safe()` for async)

---

## [0.5.0] - 2024-11-15

### Added

- **Focus (Lens-like Access)**
  - `focus(path)` for nested state access
  - Returns `[getter, setter]` tuple
  - Type-safe path inference
- **Reactive Effects**
  - `effect(fn, options)` with automatic dependency tracking
  - `ctx.cleanup()` for teardown logic
  - `ctx.refresh()` for manual re-execution
  - Error handling strategies: `"throw"`, `"ignore"`, `"retry"`
- `batch(fn)` for batching multiple state updates
- `untrack(fn)` for reading state without tracking

---

## [0.4.0] - 2024-11-01

### Added

- **Middleware System**
  - `container({ middleware: [...] })` for middleware injection
  - Middleware receives `MiddlewareContext` with `type`, `next`, `resolver`
  - Discriminated union: `StoreMiddlewareContext` vs `FactoryMiddlewareContext`
- `createLoggingMiddleware()` built-in middleware
- `createValidationMiddleware()` built-in middleware

### Changed

- Container now uses middleware chain pattern

---

## [0.3.0] - 2024-10-15

### Added

- **Store Lifecycle**
  - `lifetime: "keepAlive"` (default) - persists until container disposal
  - `lifetime: "autoDispose"` - disposes when no subscribers
  - `store.dispose()` method
  - `store.subscribe(listener)` for change notifications
- `store.dehydrate()` for serializing state
- `store.hydrate(state)` for restoring state
- `store.dirty` property tracking modified fields
- `store.reset()` to restore initial state

### Changed

- Stores now track dirty state automatically

---

## [0.2.0] - 2024-10-01

### Added

- **Dependency Injection**
  - `container()` for managing store instances
  - `get(factory)` for resolving dependencies
  - Services (plain factories) support
  - `mixin(factory)` for setup-time composition
- `StoreProvider` React component
- `useContainer()` hook

### Changed

- Stores are now lazily instantiated via container

---

## [0.1.0] - 2024-09-15

### Added

- **Core Store**
  - `store(options)` factory function
  - `state` - reactive state object
  - `actions` - returned from `setup()` function
  - `update(producer)` for Immer-style nested updates
- **React Integration**
  - `useStore(selector)` hook with auto-tracking
  - `useLocalStore(spec)` for component-scoped stores
- **Reactivity**
  - Proxy-based dependency tracking
  - Fine-grained updates (only re-render on accessed properties)
  - `pick(state, equality)` for custom comparison
- **Type Safety**
  - Full TypeScript support
  - Inferred state and action types
- **Equality Utilities**
  - `strictEqual` (default)
  - `shallowEqual`
  - `deepEqual`

---

## Migration Guides

### Migrating to 0.8.0

#### Meta System Changes

If you were using internal meta APIs, update to the new public API:

```ts
// Before (internal)
spec.meta; // was MetaEntry[]

// After (0.8.0)
ctx.meta(persistMeta).store; // query store-level
ctx.meta(persistMeta).fields; // query field-level
ctx.meta.all(type); // get all values
ctx.meta.any(type1, type2); // check existence
```

### Migrating to 0.6.0

#### Async Effects

Effects must now be synchronous:

```ts
// Before (broken in 0.6.0)
effect(async (ctx) => {
  const data = await fetchData();
  state.data = data;
});

// After
effect((ctx) => {
  ctx.safe(fetchData()).then((data) => {
    state.data = data;
  });
});
```

---

[Unreleased]: https://github.com/linq2js/storion/compare/v0.8.0...HEAD
[0.8.0]: https://github.com/linq2js/storion/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/linq2js/storion/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/linq2js/storion/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/linq2js/storion/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/linq2js/storion/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/linq2js/storion/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/linq2js/storion/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/linq2js/storion/releases/tag/v0.1.0
