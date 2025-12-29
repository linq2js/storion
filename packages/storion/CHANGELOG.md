# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **BREAKING**: Store `meta` property now accepts either a single `MetaEntry` or `meta.of(...)` for multiple entries (instead of raw arrays).
  ```ts
  // Single meta - no change needed
  meta: persist(),

  // Multiple metas - use meta.of() instead of array
  meta: meta.of(persist(), notPersisted.for("password")),
  ```

### Added

- `meta.of()` helper for type-safe arrays of metadata entries. Returns `{ metas: [...] }` for proper typing.
  ```ts
  import { meta } from "storion";

  const userStore = store({
    state: { name: "", password: "" },
    meta: meta.of(
      persist(),
      notPersisted.for("password"),
    ),
  });
  ```

- `async.action()` now returns a `success(data)` method for directly setting state without executing the handler. Useful for optimistic updates, websocket/push data, SSR hydration, or testing. Respects `autoCancel` option: with `autoCancel: true` (default), cancels any in-flight request; with `autoCancel: false`, lets in-flight requests complete but prevents them from overwriting the manually set state.
  ```ts
  const userQuery = async.action(focus('user'), fetchUser);
  
  // Optimistic update
  userQuery.success(optimisticData);
  
  // Websocket push
  websocket.on('user_updated', (data) => userQuery.success(data));
  
  // SSR hydration
  userQuery.success(window.__DATA__.user);
  ```

- `observe()` wrapper for abortable functions to observe lifecycle events. The `onStart` callback can return an object with lifecycle callbacks: `onAbort`, `onSuccess`, `onError`, `onDone`.
  ```ts
  import { abortable, observe } from "storion/async";
  
  // Simple logging
  const fetchUser = abortable(async (ctx, id: string) => { ... })
    .use(observe((ctx, id) => {
      console.log(`Fetching user ${id}`);
    }));
  
  // Full lifecycle
  const fetchData = abortable(async () => { ... })
    .use(observe(() => ({
      onAbort: () => console.log('Aborted'),
      onSuccess: (data) => console.log('Success:', data),
      onError: (err) => console.error('Error:', err),
      onDone: () => console.log('Done'),
    })));
  
  // Loading indicator pattern
  const fetchData = abortable(async () => { ... })
    .use(observe(() => {
      showLoading();
      return { onDone: hideLoading };
    }));
  ```

- `effect()` now automatically catches thrown promises (Suspense-like behavior). When `async.wait()` throws a promise inside an effect, the effect will automatically re-run when the promise resolves. Uses `ctx.nth` to detect staleness - if dependencies change before the promise resolves, the refresh is skipped. On promise rejection, the error is handled via `options.onError` (supports `keepAlive`, `failFast`, retry config, or custom handler).
  ```ts
  effect(() => {
    const s = state.otherProp;
    const user = async.wait(state.userAsync); // throws if pending
    // Effect auto-catches the promise and re-runs when resolved
    // If otherProp changes first, the promise refresh is skipped
    // On rejection, error goes through handleError (respects onError option)
  });
  ```

- `mixins()` helper function for composing multiple mixins into a single selector. Supports array syntax for merging and object syntax for key mapping. Keys ending with "Mixin" suffix are automatically stripped.
  ```ts
  import { useStore, mixins } from "storion/react";

  // Object syntax - keys mapped to results, "Mixin" suffix stripped
  const { t, language } = useStore(mixins({ tMixin, languageMixin }));

  // Array syntax - merge multiple mixins
  const data = useStore(mixins([userMixin, { count: countMixin }]));
  ```

### Changed

- **BREAKING**: Removed `useStore(MergeMixin)` and `useStore(MixinMap)` overloads. Use `useStore(mixins(...))` instead:
  ```ts
  // Before
  useStore({ tMixin, countMixin })
  useStore([userMixin, { count: countMixin }])

  // After
  useStore(mixins({ tMixin, countMixin }))
  useStore(mixins([userMixin, { count: countMixin }]))
  ```

### Fixed

- Store property subscriptions now correctly re-render when a property changes while its emitter temporarily has **0 listeners** (e.g. around render/commit timing windows), by buffering the last change and replaying it on the next subscription.

---

## [0.16.7] - 2024-12-27

### Fixed

- `useStore()` now properly re-renders when store is hydrated after initial render. Changed subscription cleanup and `scoped()` store disposal from microtask (`Promise.resolve`) to macrotask (`setTimeout`) because in React 19 concurrent mode, microtasks run BEFORE `useLayoutEffect`, causing subscriptions/stores to be removed prematurely before the component commits.

- `effect()` in selector now properly re-renders component when state changes inside the effect. Previously, `scheduledEffects` array was not cleared between renders, causing effects to accumulate and state changes during effect execution to not trigger re-renders.

---

## [0.16.6] - 2024-12-27

### Fixed

- `useIsomorphicLayoutEffect` now properly checks for `useLayoutEffect` availability instead of using `dev()` flag, improving React Native/Expo compatibility

---

## [0.16.5] - 2024-12-27

### Added

- `useStore()` now accepts void selectors for side effects only (e.g., `trigger`, effects)
  ```tsx
  useStore(({ get }) => {
    const [, actions] = get(dataStore);
    trigger(actions.fetch, [id], id);
    // No return - just side effects
  });
  ```

### Fixed

- `async.all()`, `async.race()`, `async.any()` now properly throw promises for Suspense when states are pending (instead of throwing `AsyncNotReadyError`)
- `AsyncNotReadyError` is now only thrown for idle states (not started yet)
- `useStore()` now properly re-renders after `hydrate()` is called, fixing race condition where state changes during async hydration were missed (especially in Expo/React Native with AsyncStorage)

---

## [0.16.4] - 2024-12-27

### Changed

- Internal improvements

---

## [0.16.3] - 2024-12-27

### Fixed

- Export `persisted` meta from `storion/persist`

---

## [0.16.2] - 2024-12-27

### Changed

- `PersistLoadResult` type now accepts `PromiseLike` instead of `Promise` for better flexibility

---

## [0.16.1] - 2024-12-27

### Changed

- Async combinators (`all`, `race`, `any`, `settled`) now accept raw `PromiseLike` directly instead of requiring `PromiseWithState`
  ```ts
  // Before - had to wrap promises
  async.all([state1, async.state(fetch("/api"))]);

  // After - just pass promises directly
  async.all([state1, fetch("/api").then((r) => r.json())]);
  ```

---

## [0.16.0] - 2024-12-27

### Added

- `async.all()`, `async.race()`, `async.any()`, `async.settled()` now support both `AsyncState` and `PromiseWithState`
- New array and map overloads for all combinators:

  ```ts
  // Array form (new)
  const [a, b] = async.all([state1, state2]);
  const [key, value] = async.race([state1, state2]);

  // Map form (new)
  const { user, posts } = async.all({ user: userState, posts: postsState });
  const [key, value] = async.race({ user: userState, posts: postsState });

  // Rest params (backward compatible)
  const [a, b] = async.all(state1, state2);
  ```

- New type utilities for `PromiseWithState`: `InferPromiseData`, `MapPromiseData`, `PromiseSettledResult`, `MapPromiseSettledResult`, `PromiseRaceResult`
- Combined type utilities for both: `AsyncOrPromise`, `InferData`, `MapData`, `MapRecordData`, `CombinedSettledResult`, `MapCombinedSettledResult`, `CombinedRaceResult`

---

## [0.15.0] - 2024-12-27

### Changed

- **BREAKING**: Rename `tryGet(key, create)` to `ensure(key, create)` in `list()` and `map()` focus helpers

---

## [0.14.4] - 2024-12-27

### Changed

- **BREAKING**: `async.state()` now returns `PromiseWithState<T>` (promise with attached state) instead of `PromiseState<T>`
- Removed `async.withState()` - use `async.state()` instead which now attaches state directly to the promise

---

## [0.14.3] - 2024-12-27

### Fixed

- Fix `PromiseWithState` type causing infinite type recursion with `map()` focus helper

---

## [0.14.2] - 2024-12-27

### Added

- Export `PromiseState` and `PromiseWithState` types from `storion/async`

---

## [0.14.1] - 2024-12-27

### Fixed

- Remove unused import in persist module

---

## [0.14.0] - 2024-12-27

### Added

- `SelectorContext.mixin()` now accepts `MergeMixin` (array) and `MixinMap` (object) syntax, matching `useStore()` patterns

  ```tsx
  const { name, count } = useStore((ctx) => {
    // MergeMixin array - spreads direct mixins, maps named mixins
    return ctx.mixin([
      selectUser,              // { name, email } → spread
      { count: selectCount },  // → { count: number }
    ]);
  });

  const { userName, userAge } = useStore((ctx) => {
    // MixinMap object - maps keys to mixin results
    return ctx.mixin({
      userName: selectName,
      userAge: selectAge,
    });
  });
  ```

### Changed

- `useStore(MixinMap | MergeMixin)` now internally uses `ctx.mixin()` for code reuse

---

## [0.13.0] - 2024-12-27

### Added

- `persist()` middleware now supports `persistedOnly` option for opt-in persistence mode

  ```ts
  import { persist, persisted, notPersisted } from "storion/persist";

  // Only persist stores/fields explicitly marked with persisted meta
  persist({
    persistedOnly: true,
    handler: (ctx) => ({
      load: () => JSON.parse(localStorage.getItem(ctx.displayName) || "null"),
      save: (state) => localStorage.setItem(ctx.displayName, JSON.stringify(state)),
    }),
  });

  // Store-level: entire store persisted
  const userStore = store({
    name: "user",
    state: { name: "", email: "" },
    meta: [persisted()],
  });

  // Field-level: only specific fields persisted
  const settingsStore = store({
    name: "settings",
    state: { theme: "", fontSize: 14, cache: {} },
    meta: [persisted.for(["theme", "fontSize"])],
  });
  ```

  Filtering priority: `notPersisted` (top) → `persistedOnly` → `filter` option

---

## [0.12.0] - 2024-12-27

### Added

- `useStore()` now accepts array and object mixin syntax for cleaner composition

  ```tsx
  // Array syntax (MergeMixin) - merges direct and named mixins
  const result = useStore([
    selectUser, // { name, email } → spread into result
    { count: selectCount }, // → { count: number }
  ]);
  // result: { name: string, email: string, count: number }

  // Object syntax (MixinMap) - maps keys to mixin results
  const { userName, userAge } = useStore({
    userName: (ctx) => ctx.get(userStore)[0].name,
    userAge: (ctx) => ctx.get(userStore)[0].age,
  });
  ```

- `store()` now accepts `toJSON` option to control serialization behavior

  ```ts
  const userStore = store({
    name: "user",
    state: { name: "", password: "" },
    toJSON: "normalize", // Uses normalize function for JSON.stringify
  });
  ```

  Available modes: `"state"` (default), `"normalize"`, `"info"`, `"id"`, `"null"`, `"undefined"`, `"empty"`

- `useStore.from()` for creating pre-bound hooks

  ```tsx
  // From store spec
  const useCounter = useStore.from(counterStore);
  const { count } = useCounter((state, actions) => ({ count: state.count }));

  // From selector with arguments
  const useUserById = useStore.from((ctx, userId: string) => {
    const [state] = ctx.get(userStore);
    return { user: state.users[userId] };
  });
  const { user } = useUserById("123");
  ```

- `SelectorContext.scoped()` for component-local stores that auto-dispose on unmount
  ```tsx
  const { value, setValue } = useStore(({ scoped }) => {
    const [state, actions, instance] = scoped(formStore);
    return { value: state.value, setValue: actions.setValue };
  });
  ```
- `async.mixin()` for component-local async state (mutations, form submissions)

  ```tsx
  // Define mutation - no store needed
  const submitForm = async.mixin(async (ctx, data: FormData) => {
    const res = await fetch("/api/submit", {
      method: "POST",
      body: JSON.stringify(data),
      signal: ctx.signal,
    });
    return res.json();
  });

  // Use as mixin - state is component-local, auto-disposed
  const { status, submit } = useStore(({ mixin }) => {
    const [state, actions] = mixin(submitForm);
    return { status: state.status, submit: actions.dispatch };
  });
  ```

- `AsyncContext.get()` allows async handlers to access other stores' state

  ```tsx
  // Access other stores for cross-store mutations
  const checkout = async.mixin(async (ctx, paymentMethod: string) => {
    const [user] = ctx.get(userStore);
    const [cart] = ctx.get(cartStore);
    return fetch("/api/checkout", {
      body: JSON.stringify({ userId: user.id, items: cart.items }),
    });
  });
  ```

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

### Removed

- **BREAKING**: `useLocalStore` hook removed - use `scoped()` in `useStore` selector instead

  ```tsx
  // Before
  const [state, actions] = useLocalStore(formStore);

  // After
  const { state, actions } = useStore(({ scoped }) => {
    const [s, a] = scoped(formStore);
    return { state: s, actions: a };
  });
  ```

- **BREAKING**: `SelectorContext.create()` removed - creates uncontrolled instances without disposal tracking. Use `get()` for cached services or `scoped()` for component-local stores instead.

### Changed

- **BREAKING**: `persist` API refactored for better encapsulation (renamed from `persistMiddleware`)

  - New `handler` option replaces `load`/`save` callbacks
  - `persistMiddleware` is now deprecated, use `persist` instead
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
  persist({
    handler: (ctx) => {
      const key = `app:${ctx.displayName}`;
      return {
        load: () => JSON.parse(localStorage.getItem(key) || "null"),
        save: (state) => localStorage.setItem(key, JSON.stringify(state)),
      };
    },
  });

  // Async handler (IndexedDB)
  persist({
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
  - `persist(options)` for automatic state persistence
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

[Unreleased]: https://github.com/linq2js/storion/compare/v0.12.0...HEAD
[0.12.0]: https://github.com/linq2js/storion/compare/v0.8.0...v0.12.0
[0.8.0]: https://github.com/linq2js/storion/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/linq2js/storion/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/linq2js/storion/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/linq2js/storion/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/linq2js/storion/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/linq2js/storion/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/linq2js/storion/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/linq2js/storion/releases/tag/v0.1.0
