export const STORION_TYPE = Symbol("STORION");

export type AnyFunc = (...args: any[]) => any;

/**
 * Kind identifiers for Storion objects.
 * Used with STORION_SYMBOL for runtime type discrimination.
 */
export type StorionKind =
  | "store.spec"
  | "store.action"
  | "container"
  | "store"
  | "focus"
  | "store.context"
  | "selector.context"
  | "async.meta";

/**
 * Base interface for all Storion objects with runtime type discrimination.
 */
export interface StorionObject<K extends StorionKind = StorionKind> {
  readonly [STORION_TYPE]: K;
}

/**
 * Storion - Type-safe reactive state management
 *
 * Core type definitions for the library.
 */

// =============================================================================
// Base Types
// =============================================================================

/**
 * Base constraint for state objects.
 */
export type StateBase = object | Record<string, unknown>;

/**
 * Base constraint for actions.
 */
export interface ActionsBase {
  [key: string]: (...args: any[]) => any;
}

// =============================================================================
// Equality
// =============================================================================

export type EqualityShorthand =
  | "strict"
  | "shallow" // 1 level: compare keys/length, Object.is per item
  | "shallow2" // 2 levels: compare keys/length, shallow per item
  | "shallow3" // 3 levels: compare keys/length, shallow2 per item
  | "deep";

/**
 * Equality strategies for change detection.
 */
export type Equality<T = unknown> =
  | EqualityShorthand
  | ((a: T, b: T) => boolean);

/**
 * Per-property equality configuration.
 */
export type EqualityMap<T> = {
  [K in keyof T]?: Equality<T[K]>;
};

// =============================================================================
// Focus (Lens-like state accessors)
// =============================================================================

/**
 * Extracts nested object paths as dot-notation strings.
 * Stops at arrays (no index support).
 *
 * @example
 * type State = { profile: { name: string; address: { city: string } } };
 * type P = StatePath<State>; // "profile" | "profile.name" | "profile.address" | "profile.address.city"
 */
export type StatePath<T, Prefix extends string = ""> = T extends object
  ? T extends unknown[]
    ? never // Stop at arrays
    : {
        [K in keyof T & string]: NonNullable<T[K]> extends object
          ? NonNullable<T[K]> extends unknown[]
            ? `${Prefix}${K}` // Stop at arrays
            : `${Prefix}${K}` | StatePath<NonNullable<T[K]>, `${Prefix}${K}.`>
          : `${Prefix}${K}`;
      }[keyof T & string]
  : never;

/**
 * Gets the type at a nested path.
 *
 * @example
 * type State = { profile: { address: { city: string } } };
 * type City = PathValue<State, "profile.address.city">; // string
 */
export type PathValue<
  T,
  P extends string
> = P extends `${infer K}.${infer Rest}`
  ? K extends keyof T
    ? PathValue<NonNullable<T[K]>, Rest>
    : never
  : P extends keyof T
  ? T[P]
  : never;

/**
 * Non-nullable type utility.
 */
export type NonNullish<
  TValue,
  TFlag extends true | false = true
> = TFlag extends true ? Exclude<TValue, undefined | null> : TValue;

/**
 * Focus change event payload.
 */
export interface FocusChangeEvent<T> {
  next: T;
  prev: T;
}

/**
 * Focus options for configuring getter/setter behavior.
 *
 * @example
 * // With fallback for nullable values
 * const focus = ctx.focus("profile", {
 *   fallback: () => ({ name: "Guest" })
 * });
 *
 * @example
 * // With custom equality for change detection
 * const focus = ctx.focus("items", {
 *   equality: "shallow"
 * });
 */
export interface FocusOptions<T> {
  /**
   * Fallback factory for when the focused value is nullish.
   * Applied to both getter (returns fallback) and setter (reducer receives fallback).
   */
  fallback?: () => NonNullish<T>;

  /**
   * Equality strategy for change detection in on() listener.
   * Defaults to strict equality (===).
   */
  equality?: Equality<T>;
}

/**
 * Internal focus context for creating focus instances.
 */
export interface FocusContext {
  /** Get current state */
  get: () => StateBase;
  /** Update state with immer-style updater */
  update: (updater: (draft: StateBase) => void) => void;
  /** Subscribe to state changes */
  subscribe: (listener: VoidFunction) => VoidFunction;
}

/**
 * Focus tuple: [getter, setter] with an on() method for subscribing to changes.
 *
 * @example
 * const [getName, setName] = ctx.focus("profile.name");
 *
 * // Get current value
 * const name = getName();
 *
 * // Set value directly
 * setName("Jane");
 *
 * // Set value with reducer (returns new value)
 * setName(prev => prev.toUpperCase());
 *
 * // Set value with produce (immer-style, mutate draft)
 * setName(draft => { draft.nested = "value"; });
 *
 * // Listen to changes
 * const unsubscribe = ctx.focus("profile.name").on(({ next, prev }) => {
 *   console.log(`Name changed from ${prev} to ${next}`);
 * });
 */
export type Focus<TValue> = [
  /** Get the current value at the focused path */
  getter: () => TValue,
  /**
   * Set the value at the focused path.
   * - Direct value: `set(newValue)`
   * - Reducer: `set(prev => newValue)` - returns new value
   * - Produce: `set(draft => { draft.x = y })` - immer-style mutation, no return
   */
  setter: (
    valueOrReducerOrProduce: TValue | ((prev: TValue) => TValue | void)
  ) => void
] & {
  /** The context of the focus */
  readonly context: FocusContext;
  /** The segments of the focused path */
  readonly segments: string[];
  /** The type of the focus */
  readonly [STORION_TYPE]: "focus";
  /**
   * Subscribe to changes at the focused path.
   * Uses the configured equality to determine if value has changed.
   *
   * @param listener - Called with { next, prev } when value changes
   * @returns Unsubscribe function
   */
  on(listener: (event: FocusChangeEvent<TValue>) => void): VoidFunction;

  /**
   * Create a new Focus relative to the current path.
   *
   * @param relativePath - Dot-notation path relative to current focus
   * @param options - Focus options for the new focus
   * @returns A new Focus at the combined path
   *
   * @example
   * const userFocus = focus("user");
   * const addressFocus = userFocus.to("address");
   * const cityFocus = userFocus.to("address.city");
   */
  to<TChild>(
    relativePath: string,
    options?: FocusOptions<TChild>
  ): Focus<TChild>;
};

// =============================================================================
// Lifetime
// =============================================================================

/**
 * Controls when a store instance is automatically disposed.
 *
 * - `"keepAlive"` - Never auto-dispose (default for singletons)
 * - `"autoDispose"` - Dispose immediately when no subscribers remain
 */
export type Lifetime = "keepAlive" | "autoDispose";

// =============================================================================
// Dispatch Events
// =============================================================================

/**
 * Event emitted when an action is dispatched.
 * Immutable - new object created for each dispatch.
 */
export type DispatchEvent<TActions extends ActionsBase> = {
  [K in keyof TActions]: {
    /** Action name */
    readonly name: K;
    /** Arguments passed to the action */
    readonly args: Parameters<TActions[K]>;
    /** Invocation count for this action (1-indexed) */
    readonly nth: number;
  };
}[keyof TActions];

/**
 * Single action's dispatch event (for typing action.last())
 */
export type ActionDispatchEvent<
  TActions extends ActionsBase,
  K extends keyof TActions
> = {
  readonly name: K;
  readonly args: Parameters<TActions[K]>;
  readonly nth: number;
};

/**
 * Action with reactive last() method.
 * Call last() inside effect to reactively track dispatches.
 */
export type ReactiveAction<
  TActions extends ActionsBase,
  K extends keyof TActions
> = TActions[K] & {
  /**
   * Get the last dispatch event for this action.
   * Reactive - triggers effect re-run when action is dispatched.
   *
   * @returns Last dispatch event, or undefined if never dispatched
   */
  last(): ActionDispatchEvent<TActions, K> | undefined;
};

/**
 * Actions object with reactive last() method on each action.
 */
export type ReactiveActions<TActions extends ActionsBase> = {
  [K in keyof TActions]: ReactiveAction<TActions, K>;
};

// =============================================================================
// Store Spec
// =============================================================================

/**
 * Store specification (definition) that is also a factory function.
 * A spec describes HOW to create a store instance - it holds no state.
 *
 * Can be called directly as a factory: `spec(resolver) => instance`
 *
 * @example
 * ```ts
 * const counterSpec = store({ count: state(0) });
 *
 * // Use with container (recommended)
 * const instance = container.get(counterSpec);
 *
 * // Or call directly as factory
 * const instance = counterSpec(resolver);
 * ```
 */
export interface StoreSpec<
  TState extends StateBase = StateBase,
  TActions extends ActionsBase = ActionsBase
> extends StorionObject<"store.spec"> {
  /** Store display name for debugging (renamed from 'name' since that's a reserved function property) */
  readonly displayName: string;

  /** Store options (state, setup, lifetime, etc.) */
  readonly options: StoreOptions<TState, TActions>;

  readonly fields: string[];

  readonly meta?: MetaEntry<keyof TState, any> | MetaEntry<keyof TState, any>[];

  /**
   * Factory function - creates a new store instance.
   * Called by container/resolver internally.
   */
  (resolver: Resolver): StoreInstance<TState, TActions>;
}

// =============================================================================
// Mixins
// =============================================================================

/**
 * A reusable mixin for store setup.
 * Receives the same StoreContext and can return actions or other values.
 *
 * @example
 * const counterMixin: StoreMixin<{ count: number }, CounterActions> =
 *   ({ state }) => ({
 *     increment: () => { state.count++; },
 *     decrement: () => { state.count--; },
 *   });
 */
export type StoreMixin<
  TState extends StateBase,
  TResult,
  TArgs extends unknown[] = []
> = (context: StoreContext<TState>, ...args: TArgs) => TResult;

/**
 * A reusable mixin for selectors.
 * Receives the SelectorContext and can compose selector logic.
 *
 * @example
 * const sumMixin: SelectorMixin<number, [StoreSpec<any, any>[]]> =
 *   ({ get }, specs) => specs.reduce((sum, spec) => {
 *     const [state] = get(spec);
 *     return sum + (state.count ?? 0);
 *   }, 0);
 */
export type SelectorMixin<TResult, TArgs extends unknown[] = []> = (
  context: SelectorContext,
  ...args: TArgs
) => TResult;

// =============================================================================
// Store Tuple
// =============================================================================

/**
 * Tuple returned by get() with both array destructuring and named properties.
 *
 * @example
 * // Array destructuring
 * const [state, actions] = get(counterSpec);
 *
 * // Named properties
 * const tuple = get(counterSpec);
 * tuple.state.count;
 * tuple.actions.increment();
 */
export type StoreTuple<S extends StateBase, A extends ActionsBase> = readonly [
  Readonly<S>,
  A
] & {
  readonly state: Readonly<S>;
  readonly actions: A;
};

// =============================================================================
// Setup Context
// =============================================================================

/**
 * Update function with action creator.
 *
 * Can be called directly to update state, or use `.action()` to create
 * action functions that wrap updates.
 */
export interface StoreUpdate<TState extends StateBase> {
  /**
   * Update state using Immer-style updater function.
   */
  (updater: (draft: TState) => void): void;

  /**
   * Update state with partial object (shallow merge).
   */
  (partial: Partial<TState>): void;

  /**
   * Create an action function that wraps an updater.
   * Throws error if the updater returns a PromiseLike (async not supported).
   *
   * @example
   * // No arguments
   * increment: update.action(draft => {
   *   draft.count++;
   * }),
   *
   * // With arguments
   * addItem: update.action((draft, name: string, price: number) => {
   *   draft.items.push({ name, price });
   * }),
   */
  action<TArgs extends unknown[]>(
    updater: (draft: TState, ...args: TArgs) => void
  ): (...args: TArgs) => void;
}

/**
 * Context provided to the setup() function.
 */
export interface StoreContext<TState extends StateBase = StateBase>
  extends StorionObject<"store.context"> {
  /**
   * Mutable reactive state proxy.
   * Writes trigger subscriber notifications.
   * Reads inside effect() create reactive dependencies.
   */
  readonly state: TState;

  /**
   * Get another store's state and actions.
   * Returns tuple with both array destructuring and named properties.
   * Creates dependency - store is created if not exists.
   *
   * @example
   * // Array destructuring
   * const [state, actions] = get(counterSpec);
   *
   * // Named properties
   * const tuple = get(counterSpec);
   * tuple.state.count;
   */
  get<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreTuple<S, A>;

  /**
   * Get a service or factory instance.
   * Creates and caches the instance using the factory function.
   * Returns the instance directly (not a tuple).
   *
   * @example
   * const db = get(indexedDBService);
   * await db.users.getAll();
   */
  get<T>(factory: (...args: any[]) => T): T;

  /**
   * Create a child store instance that is automatically disposed
   * when the parent store is disposed.
   *
   * Unlike `get()`, this returns the full StoreInstance with access to
   * id, subscribe(), dispose(), etc.
   *
   * Use this when you need a store with the same lifecycle as the parent,
   * or when you need full instance access.
   *
   * @example
   * setup: (ctx) => {
   *   // Create a child store - disposed when parent disposes
   *   const childInstance = ctx.create(childSpec);
   *
   *   return {
   *     getChildState: () => childInstance.state,
   *     disposeChild: () => childInstance.dispose(),
   *   };
   * }
   */
  create<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreInstance<S, A>;

  /**
   * Create a service or factory instance that is automatically disposed
   * when the parent store is disposed (if the instance has a dispose method).
   *
   * Unlike `get()` which caches instances, `create()` always creates fresh instances.
   *
   * @example
   * setup: (ctx) => {
   *   // Create a fresh service instance - disposed with parent
   *   const db = ctx.create(indexedDBService);
   *
   *   return {
   *     clearData: () => db.clearAll(),
   *   };
   * }
   */
  create<T>(factory: (resolver: Resolver) => T): T;

  /**
   * Create a service or factory instance with additional arguments.
   * The factory receives the resolver as the first argument, followed by custom args.
   *
   * Unlike `get()` which only supports parameterless factories, `create()` supports
   * parameterized factories that need additional configuration.
   *
   * @example
   * setup: (ctx) => {
   *   // Create a database connection with specific config
   *   const db = ctx.create(createDatabase, { host: 'localhost', port: 5432 });
   *
   *   // Create a logger with a namespace
   *   const logger = ctx.create(createLogger, 'auth-store');
   *
   *   return {
   *     getData: async () => db.query('SELECT * FROM users'),
   *     log: (msg: string) => logger.info(msg),
   *   };
   * }
   */
  create<TResult, TArgs extends [any, ...any[]]>(
    factory: (resolver: Resolver, ...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult;

  /**
   * Update state using Immer-style updater function or partial object.
   *
   * Also provides `.action()` to create action functions that wrap updates.
   *
   * @example
   * // Direct update with updater function
   * update(draft => {
   *   draft.items.push({ id: 1, name: 'New Item' });
   *   draft.count++;
   * });
   *
   * // Direct update with partial object
   * update({ count: 10, name: 'Updated' });
   *
   * // Create action with update.action()
   * increment: update.action(draft => {
   *   draft.count++;
   * }),
   *
   * // Action with arguments
   * addItem: update.action((draft, name: string) => {
   *   draft.items.push({ id: Date.now(), name });
   * }),
   */
  update: StoreUpdate<TState>;

  /**
   * Check if state has been modified since setup completed.
   *
   * @overload Check if any property is dirty
   * @returns true if any state property differs from initial value
   *
   * @overload Check if specific property is dirty
   * @param prop - Property key to check
   * @returns true if the property differs from initial value
   */
  dirty(): boolean;
  dirty<K extends keyof TState>(prop: K): boolean;

  /**
   * Reset state to initial values (captured after setup/effects).
   * Triggers change notifications for all modified properties.
   */
  reset(): void;

  /**
   * Register a cleanup callback to run when the store is disposed.
   * Callbacks are called in registration order.
   *
   * @example
   * setup: (ctx) => {
   *   const subscription = api.subscribe(data => {
   *     ctx.state.data = data;
   *   });
   *   ctx.onDispose(() => subscription.unsubscribe());
   *
   *   const intervalId = setInterval(() => {
   *     ctx.state.tick++;
   *   }, 1000);
   *   ctx.onDispose(() => clearInterval(intervalId));
   *
   *   return {};
   * }
   */
  onDispose(callback: () => void): void;

  /**
   * Apply a mixin to compose reusable logic.
   * Mixins receive the same context and can return actions or values.
   * Only callable during setup phase.
   *
   * @example
   * const counter = ctx.mixin(counterMixin);
   * const multiplier = ctx.mixin(multiplyMixin, 2);
   */
  mixin<TResult, TArgs extends unknown[]>(
    mixin: StoreMixin<TState, TResult, TArgs>,
    ...args: TArgs
  ): TResult;

  /**
   * Create a lens-like accessor for a nested state path.
   * Returns a [getter, setter] tuple with an on() method for subscribing to changes.
   *
   * @example
   * // Basic usage - get/set value
   * const [getName, setName] = focus("profile.name");
   * const name = getName();
   * setName("Jane");
   *
   * // With reducer
   * setName(prev => prev.toUpperCase());
   *
   * // With fallback for nullable values
   * const [getProfile, setProfile] = focus("profile", {
   *   fallback: () => ({ name: "Guest" })
   * });
   *
   * // Subscribe to changes
   * const unsubscribe = focus("profile.name").on(({ next, prev }) => {
   *   console.log(`Changed from ${prev} to ${next}`);
   * });
   *
   * // Can be returned as actions
   * return { nameFocus: focus("name"), profileFocus: focus("profile") };
   */
  focus<P extends StatePath<TState>>(path: P): Focus<PathValue<TState, P>>;

  focus<P extends StatePath<TState>>(
    path: P,
    options: FocusOptions<PathValue<TState, P>> & {
      fallback: () => NonNullish<PathValue<TState, P>>;
    }
  ): Focus<NonNullish<PathValue<TState, P>>>;

  focus<P extends StatePath<TState>>(
    path: P,
    options: FocusOptions<PathValue<TState, P>>
  ): Focus<PathValue<TState, P>>;
}

// =============================================================================
// Store Options
// =============================================================================

/**
 * Options for defining a store.
 */
export interface StoreOptions<
  TState extends StateBase,
  TActions extends ActionsBase
> {
  /** Store name for debugging */
  name?: string;

  /** Initial state object */
  state?: TState;

  /** Setup function - runs once when store is created */
  setup?: (context: StoreContext<TState>) => TActions;

  /**
   * Equality strategy for state properties.
   *
   * @example
   * // Single value - applies to all properties
   * equality: "shallow"
   *
   * @example
   * // Per-property configuration
   * equality: {
   *   profile: "deep",
   *   settings: "shallow",
   *   default: "strict" // Optional default for unlisted props
   * }
   */
  equality?:
    | Equality
    | (Partial<Record<keyof TState, Equality>> & { default?: Equality });

  /** Lifetime management strategy */
  lifetime?: Lifetime;

  /** Called after every action dispatch */
  onDispatch?: (event: DispatchEvent<TActions>) => void;

  /** Called when an effect or action throws an error */
  onError?: (error: unknown) => void;

  /**
   * Transform state to a serializable format for persistence.
   * Handles complex types like Date, Map, Set, class instances.
   *
   * @example
   * normalize: (state) => ({
   *   ...state,
   *   lastLogin: state.lastLogin?.toISOString() ?? null,
   *   cache: Object.fromEntries(state.cache),
   * })
   */
  normalize?: (state: TState) => Record<string, unknown>;

  /**
   * Transform serialized data back to state shape.
   * Reverses the normalize transformation.
   *
   * @example
   * denormalize: (data) => ({
   *   ...data,
   *   lastLogin: data.lastLogin ? new Date(data.lastLogin as string) : null,
   *   cache: new Map(Object.entries(data.cache as Record<string, unknown>)),
   * })
   */
  denormalize?: (data: Record<string, unknown>) => TState;

  /**
   * Metadata for middleware and tooling.
   * Extend StoreMeta via declaration merging to add typed fields.
   *
   * @example
   * // Middleware declares its meta fields:
   * declare module 'storion' {
   *   interface StoreMeta {
   *     persist?: boolean;
   *   }
   * }
   *
   * // User configures per-store:
   * store({
   *   meta: { persist: true },
   *   ...
   * })
   */
  meta?: MetaEntry<keyof TState, any> | MetaEntry<keyof TState, any>[];
}

// =============================================================================
// Store Instance
// =============================================================================

/**
 * Store instance - the live, usable store object.
 *
 * Created and managed by the container.
 * Provides access to state, actions, and lifecycle management.
 */
export interface StoreInstance<
  TState extends StateBase = StateBase,
  TActions extends ActionsBase = ActionsBase
> extends StorionObject<"store"> {
  /** Unique identifier for this instance */
  readonly id: string;

  /** The store specification that created this instance */
  readonly spec: StoreSpec<TState, TActions>;

  /** Readonly reactive state proxy */
  readonly state: Readonly<TState>;

  /** Bound actions with reactive last() method */
  readonly actions: ReactiveActions<TActions>;

  /** Store instances this store depends on (via get() in setup) */
  readonly deps: readonly StoreInstance<any, any>[];

  /**
   * Subscribe to state changes.
   *
   * @overload Subscribe to all state changes
   * @param listener - Callback invoked on any state change
   * @returns Unsubscribe function
   *
   * @overload Subscribe to specific property changes
   * @param propKey - Property to watch
   * @param listener - Callback invoked with { next, prev } values
   * @returns Unsubscribe function
   *
   * @overload Subscribe to specific action dispatches
   * @param actionKey - Action name prefixed with '@' (e.g., '@increment')
   * @param listener - Callback invoked with dispatch event
   * @returns Unsubscribe function
   *
   * @overload Subscribe to ALL action dispatches
   * @param wildcard - '@*' to match all actions
   * @param listener - Callback invoked with dispatch event
   * @returns Unsubscribe function
   */
  subscribe(listener: () => void): VoidFunction;
  subscribe<K extends keyof TState>(
    propKey: K,
    listener: (event: { next: TState[K]; prev: TState[K] }) => void
  ): VoidFunction;
  subscribe<K extends keyof TActions>(
    actionKey: `@${K & string}`,
    listener: (event: {
      next: ActionDispatchEvent<TActions, K>;
      prev: ActionDispatchEvent<TActions, K> | undefined;
    }) => void
  ): VoidFunction;
  subscribe(
    wildcard: "@*",
    listener: (event: {
      next: DispatchEvent<TActions>;
      prev: DispatchEvent<TActions> | undefined;
    }) => void
  ): VoidFunction;

  /**
   * Subscribe to store disposal events.
   */
  onDispose(listener: () => void): VoidFunction;

  /** Dispose the instance and clean up resources */
  dispose(): void;

  /** Whether the instance is disposed */
  disposed(): boolean;

  /**
   * Check if state has been modified since setup completed.
   *
   * @overload Check if any property is dirty
   * @returns true if any state property differs from initial value
   *
   * @overload Check if specific property is dirty
   * @param prop - Property key to check
   * @returns true if the property differs from initial value
   */
  dirty(): boolean;
  dirty<K extends keyof TState>(prop: K): boolean;

  /**
   * Reset state to initial values (captured after setup/effects).
   * Triggers change notifications for all modified properties.
   */
  reset(): void;

  /**
   * Extract current state in serializable format for persistence.
   * Uses the `normalize` option if defined, otherwise returns shallow copy of state.
   *
   * @example
   * // In persistor
   * const data = instance.dehydrate();
   * localStorage.setItem(key, JSON.stringify(data));
   */
  dehydrate(): Record<string, unknown>;

  /**
   * Restore state from persisted data.
   * Uses the `denormalize` option if defined, otherwise applies data directly.
   *
   * **Important:** By default, only applies to non-dirty props. If a prop has been modified
   * since initialization (e.g., by an effect fetching fresh data), it will be
   * skipped to avoid overwriting newer data with stale persisted data.
   *
   * Use `{ force: true }` to bypass dirty check and overwrite all props.
   *
   * @example
   * // In persistor
   * const data = JSON.parse(localStorage.getItem(key));
   * instance.hydrate(data);
   *
   * // Force hydration (ignores dirty check)
   * instance.hydrate(data, { force: true });
   */
  hydrate(data: Record<string, unknown>, options?: { force?: boolean }): void;

  /**
   * @internal Internal subscription for effects - doesn't affect refCount.
   * Used by the effect system to track dependencies without preventing
   * autoDispose from working.
   */
  _subscribeInternal<K extends keyof TState>(
    propKey: K | string,
    listener: () => void
  ): VoidFunction;
}

// =============================================================================
// Container
// =============================================================================

/**
 * Container options.
 */
export interface ContainerOptions {
  /** Auto dispose options for all stores */
  autoDispose?: AutoDisposeOptions;

  /** Middleware chain for intercepting creation (stores and factories) */
  middleware?: Middleware | Middleware[];
}

// =============================================================================
// Resolver (Factory-based Dependency Injection)
// =============================================================================

/**
 * Factory function that creates an instance using the resolver.
 * The factory itself is used as the cache key (by reference).
 *
 * StoreSpec is a specialized factory that returns StoreInstance.
 */
export type Factory<T = any> = {
  (resolver: Resolver): T;
  meta?: MetaEntry | MetaEntry[];
};

// =============================================================================
// Middleware Context (Discriminated Union)
// =============================================================================

/**
 * Base properties shared by all middleware contexts.
 */
interface BaseMiddlewareContext {
  /** The factory being invoked */
  readonly factory: Factory;

  /** The resolver instance */
  readonly resolver: Resolver;

  /** Call the next middleware or the factory itself */
  readonly next: () => unknown;

  /**
   * Display name for debugging.
   * - For stores: spec.displayName (always present)
   * - For factories: factory.displayName ?? factory.name ?? undefined
   */
  readonly displayName: string | undefined;

  /**
   * Query metadata attached to the factory/store.
   *
   * For stores: combines factory.meta (via withMeta) + spec.meta
   * For factories: uses factory.meta (via withMeta)
   *
   * @example
   * ```ts
   * const persist = meta();
   *
   * const middleware: Middleware = (ctx) => {
   *   if (ctx.meta.any(persist)) {
   *     // Factory or store has persist meta
   *   }
   *   if (ctx.meta(persist).store) {
   *     // Get first persist value
   *   }
   *   return ctx.next();
   * };
   * ```
   */
  readonly meta: MetaQuery;
}

/**
 * Context for plain factory middleware.
 */
export interface FactoryMiddlewareContext extends BaseMiddlewareContext {
  /** Discriminant - this is a plain factory */
  readonly type: "factory";
}

/**
 * Context for store middleware.
 * `spec` and `displayName` are always present.
 */
export interface StoreMiddlewareContext extends BaseMiddlewareContext {
  /** Discriminant - this is a store */
  readonly type: "store";

  /** The store spec (always present for stores) */
  readonly spec: StoreSpec;

  /** The factory being invoked (same as spec) */
  readonly factory: (resolver: Resolver) => StoreInstance;

  /** Call the next middleware or the factory itself */
  readonly next: () => StoreInstance;
}

/**
 * Middleware context - discriminated union.
 * Use `ctx.type` to narrow to specific context type.
 *
 * @example
 * ```ts
 * const middleware: Middleware = (ctx) => {
 *   if (ctx.type === "store") {
 *     // ctx is StoreMiddlewareContext here
 *     console.log("Store:", ctx.spec.displayName);
 *   }
 *   return ctx.next();
 * };
 * ```
 */
export type MiddlewareContext =
  | FactoryMiddlewareContext
  | StoreMiddlewareContext;

/**
 * Generic middleware function for intercepting factory/store creation.
 * Works with both plain factories and stores.
 *
 * @example
 * ```ts
 * const loggingMiddleware: Middleware = (ctx) => {
 *   if (ctx.displayName) {
 *     console.log("Creating:", ctx.displayName);
 *   }
 *   return ctx.next();
 * };
 * ```
 */
export type Middleware = (ctx: MiddlewareContext) => unknown;

/**
 * Store-specific middleware function.
 * Use when you only want to handle stores (e.g., container middleware).
 * The context always has `spec` available.
 *
 * @example
 * ```ts
 * const loggingMiddleware: StoreMiddleware = (ctx) => {
 *   console.log(`Creating store: ${ctx.displayName}`);
 *   const instance = ctx.next();
 *   console.log(`Created: ${instance.id}`);
 *   return instance;
 * };
 * ```
 */
export type StoreMiddleware = (ctx: StoreMiddlewareContext) => StoreInstance;

/**
 * Options for creating a resolver.
 */
export interface ResolverOptions {
  /** Middleware to apply to factory creation */
  middleware?: Middleware[];
  /** Parent resolver for hierarchical lookup */
  parent?: Resolver;
  /**
   * Resolver to pass to factories when invoking them.
   * If not provided, uses the resolver itself.
   * Useful for container to pass itself for circular dependency detection.
   */
  invokeResolver?: Resolver;
}

/**
 * Resolver interface for factory-based dependency injection.
 * Provides caching, override support, and scoped resolvers.
 *
 * StoreContainer extends this with store-specific lifecycle methods.
 */
export interface Resolver {
  /**
   * Get or create a cached instance from a factory.
   * Returns the same instance on subsequent calls.
   */
  get<T>(factory: Factory<T>): T;

  /**
   * Create a fresh instance from a factory (bypasses cache).
   */
  create<T>(factory: Factory<T>): T;

  /**
   * Create a fresh instance from a parameterized factory (bypasses cache).
   * The factory receives the resolver as the first argument, followed by custom args.
   *
   * Unlike `get()` which only supports parameterless factories, `create()` supports
   * parameterized factories that need additional configuration.
   *
   * @example
   * const db = resolver.create(createDatabase, { host: 'localhost' });
   * const logger = resolver.create(createLogger, 'my-namespace');
   */
  create<TResult, TArgs extends [any, ...any[]]>(
    factory: (resolver: Resolver, ...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult;

  /**
   * Override a factory with a custom implementation.
   * Useful for testing or environment-specific behavior.
   * Clears the cached instance if one exists.
   */
  set<T>(factory: Factory<T>, override: Factory<T>): void;

  /**
   * Check if a factory has a cached instance.
   */
  has(factory: Factory): boolean;

  /**
   * Get a cached instance if it exists, otherwise return undefined.
   * Does NOT create the instance if not cached.
   */
  tryGet<T>(factory: Factory<T>): T | undefined;

  /**
   * Delete a cached instance.
   * If the instance has a `dispose()` method, it will be called.
   * Returns true if an instance was deleted.
   */
  delete(factory: Factory): boolean;

  /**
   * Clear all cached instances.
   * Calls `dispose()` on each instance that has the method.
   */
  clear(): void;

  /**
   * Create a child resolver that inherits from this resolver.
   * Child can override factories without affecting parent.
   */
  scope(options?: ResolverOptions): Resolver;
}

export type AutoDisposeOptions = {
  /** Grace period in ms before disposing the store (default: 100) */
  gracePeriodMs?: number;
};

/**
 * Store container - manages store instances with resolver pattern.
 *
 * The container is responsible for:
 * - Creating instances on first access (lazy)
 * - Caching instances (singleton per spec)
 * - Resolving dependencies between stores
 * - Managing lifetime and disposal
 * - Supporting DI via set() overrides
 * - Scoped containers via scope()
 *
 * Note: StoreContainer has store-specific method signatures.
 * For generic factory DI, use createResolver() instead.
 */
export interface StoreContainer extends StorionObject<"container"> {
  /**
   * Get a store instance by spec (cached).
   * First call creates instance, subsequent calls return cached.
   */
  get<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreInstance<S, A>;

  /**
   * Get a service or factory instance (cached).
   * Returns the instance directly (not a StoreInstance).
   *
   * @example
   * const db = container.get(indexedDBService);
   * await db.users.getAll();
   */
  get<T>(factory: Factory<T>): T;

  /**
   * Get a store instance by its unique ID.
   */
  get(id: string): StoreInstance<any, any> | undefined;

  /**
   * Create a fresh store instance (bypasses cache).
   * Useful for child stores or temporary instances.
   */
  create<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreInstance<S, A>;

  /**
   * Create a fresh factory instance (bypasses cache).
   * Returns the instance directly.
   */
  create<T>(factory: Factory<T>): T;

  /**
   * Create a fresh instance from a parameterized factory (bypasses cache).
   * The factory receives the resolver as the first argument, followed by custom args.
   *
   * Unlike `get()` which only supports parameterless factories, `create()` supports
   * parameterized factories that need additional configuration.
   *
   * @example
   * const db = container.create(createDatabase, { host: 'localhost' });
   * const logger = container.create(createLogger, 'my-namespace');
   */
  create<TResult, TArgs extends [any, ...any[]]>(
    factory: (resolver: Resolver, ...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult;

  /**
   * Override a spec with a custom implementation.
   * Useful for testing or environment-specific behavior.
   */
  set<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>,
    override: StoreSpec<S, A>
  ): void;

  /**
   * Check if a store instance is cached.
   */
  has(spec: StoreSpec<any, any>): boolean;

  /**
   * Get cached instance if exists, otherwise undefined.
   * Does NOT create the instance.
   */
  tryGet<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreInstance<S, A> | undefined;

  /**
   * Remove a cached instance.
   */
  delete(spec: StoreSpec<any, any>): boolean;
  /**
   * Clear all cached instances (disposes them).
   */
  clear(): void;

  /**
   * Dispose a specific store instance.
   */
  dispose(spec: StoreSpec<any, any>): boolean;

  /**
   * Create a child container that inherits from this one.
   * Child can override specs without affecting parent.
   */
  scope(options?: ContainerOptions): StoreContainer;

  /**
   * Subscribe to store creation events.
   */
  onCreate(listener: (instance: StoreInstance<any, any>) => void): VoidFunction;

  /**
   * Subscribe to store disposal events.
   */
  onDispose(
    listener: (instance: StoreInstance<any, any>) => void
  ): VoidFunction;
}

// =============================================================================
// React Types
// =============================================================================

/**
 * Selector context for useStore().
 *
 * Provides access to stores within a selector function.
 * Returns tuple [readonlyState, actions] with tracking proxy.
 */
export interface SelectorContext extends StorionObject<"selector.context"> {
  /**
   * Get a store's state and actions.
   *
   * Returns tuple with both array destructuring and named properties.
   * Includes tracking proxy for fine-grained re-render optimization.
   *
   * @example
   * // Array destructuring
   * const [state, actions] = get(counterSpec);
   *
   * // Named properties
   * const tuple = get(counterSpec);
   * tuple.state.count;
   * tuple.actions.increment();
   *
   * @param spec - Store specification
   * @returns Tuple of [trackingState, actions] with .state and .actions props
   */
  get<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreTuple<S, A>;

  /**
   * Get a service or factory instance.
   * Creates and caches the instance using the factory function.
   * Returns the instance directly (not a tuple).
   *
   * @example
   * const db = get(indexedDBService);
   * await db.users.getAll();
   */
  get<T>(factory: (resolver: Resolver) => T): T;

  /**
   * Create a fresh instance from a parameterized factory (bypasses cache).
   * The factory receives the resolver as the first argument, followed by custom args.
   *
   * Unlike `get()` which only supports parameterless factories, `create()` supports
   * parameterized factories that need additional configuration.
   *
   * @example
   * const db = create(createDatabase, { host: 'localhost' });
   * const logger = create(createLogger, 'my-namespace');
   */
  create<TResult, TArgs extends [any, ...any[]]>(
    factory: (resolver: Resolver, ...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult;

  /**
   * Apply a mixin to compose reusable selector logic.
   * Mixins receive the same context and can return computed values.
   *
   * @example
   * const total = ctx.mixin(sumMixin, [store1, store2]);
   */
  mixin<TResult, TArgs extends unknown[]>(
    mixin: SelectorMixin<TResult, TArgs>,
    ...args: TArgs
  ): TResult;

  /**
   * Unique identifier for this selector context (per component instance).
   * Useful for scoping operations with trigger().
   *
   * @example
   * const { data } = useStore(({ get, id }) => {
   *   const store = get(dataStore);
   *   // Each component instance gets unique scope
   *   trigger(id, store.actions.dispatch, [params], params);
   *   return { data: store.state.data };
   * });
   */
  readonly id: object;

  /**
   * Run a callback once when the component mounts.
   * The callback is executed immediately during render (before paint).
   *
   * @example
   * useStore(({ get, once }) => {
   *   const mutation = get(submitStore);
   *   // Reset mutation state on mount
   *   once(() => mutation.actions.reset());
   *   return mutation;
   * });
   */
  once(callback: () => void): void;
}

/**
 * Selector function type.
 */
export type Selector<T> = (context: SelectorContext) => T;

/**
 * Transforms selector result for stable function references.
 */
export type StableResult<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R
    ? (...args: A) => R
    : T[K];
};

export type Listener<T> = (value: T) => void;

export type SingleOrMultipleListeners<T> =
  | Listener<T>
  | Listener<T>[]
  | ((value: T) => Listener<T> | Listener<T>[] | undefined);

// =============================================================================
// Pick Equality
// =============================================================================

/**
 * Equality function type for pick().
 */
export type PickEquality<T> = Equality<T>;

export interface Disposable {
  dispose: VoidFunction | (VoidFunction | Disposable)[];
}

/**
 * A single metadata entry attached to a store or fields.
 * - `fields: undefined` → store-level meta
 * - `fields: ["name", "email"]` → applies to multiple fields
 */
export type MetaEntry<TField = unknown, TValue = unknown> = {
  fields?: TField[];
  value: TValue;
  type: AnyFunc;
};

// =============================================================================
// Meta Type (created by meta() function)
// =============================================================================

/**
 * A metadata type created by `meta()` function.
 * Used to attach and query type-safe metadata on stores.
 *
 * @example
 * ```ts
 * // Create meta types
 * const persist = meta();                           // boolean meta
 * const priority = meta((level: number) => level); // parameterized meta
 *
 * // Apply to store
 * const userStore = store({
 *   state: { name: "" },
 *   meta: [persist(), priority(1), persist.for("name")],
 * });
 *
 * // Query metadata (default returns first value)
 * userStore.meta(persist).store;         // true (or undefined)
 * userStore.meta(persist).fields.name;   // true (or undefined)
 * userStore.meta(priority).store;        // 1 (or undefined)
 *
 * // Query all values
 * userStore.meta.all(persist).store; // [true]
 * ```
 */
export type MetaType<TField, TArgs extends any[], TValue> = {
  /** Attach meta to a specific field or multiple fields */
  for(field: TField, ...args: TArgs): MetaEntry<TField, TValue>;
  for(fields: TField[], ...args: TArgs): MetaEntry<TField, TValue>;
  /** Attach meta to the store itself, we must use any for TField otherwise it cannot passed to spec.meta */
  (...args: TArgs): MetaEntry<any, TValue>;
};

// =============================================================================
// Meta Info (query results)
// =============================================================================

export interface MetaInfoBase<
  TField extends string | symbol,
  TStoreValue,
  TFieldValue
> {
  /** First store-level meta value, or undefined */
  readonly store: TStoreValue;
  /** First field-level meta value per field, or undefined */
  readonly fields: Readonly<Partial<Record<TField, TFieldValue>>>;
}

/**
 * Single-value metadata info (default mode).
 * Returns first value or undefined if not found.
 */
export interface MetaInfo<TField extends string | symbol, TValue>
  extends MetaInfoBase<TField, TValue, TValue | undefined> {}

/**
 * All-values metadata info.
 * Returns arrays of all matching values.
 */
export interface AllMetaInfo<TField extends string | symbol, TValue>
  extends MetaInfoBase<TField, readonly TValue[], readonly TValue[]> {}

/**
 * Query interface for store metadata.
 * Provides multiple strategies for accessing metadata values.
 *
 * @example
 * ```ts
 * const persist = meta();
 * const priority = meta((n: number) => n);
 *
 * const userStore = store({
 *   state: { name: "" },
 *   meta: [persist(), priority(1), priority(2)],
 * });
 *
 * // Default: returns first value (most common case)
 * userStore.meta(persist).store;          // true
 * userStore.meta(priority).store;         // 1
 *
 * // Explicit single mode (same as default)
 * userStore.meta.single(persist).store;   // true
 *
 * // All mode: returns all values as arrays
 * userStore.meta.all(priority).store; // [1, 2]
 *
 * // Check if any meta type exists
 * userStore.meta.any(persist);            // true
 * userStore.meta.any(persist, priority);  // true
 * ```
 */
export type MetaQuery = {
  /**
   * Get metadata using first-value strategy (default).
   * Returns the first matching value for store and each field.
   */
  <TValue>(type: MetaType<any, any[], TValue>): MetaInfo<any, TValue>;

  /**
   * Get metadata using all-values strategy.
   * Returns arrays of all matching values.
   */
  all<TValue>(type: MetaType<any, any[], TValue>): AllMetaInfo<any, TValue>;

  /**
   * Check if the store has any of the specified meta types.
   * Returns true if at least one meta type is found.
   */
  any(...types: MetaType<any, any[], any>[]): boolean;

  /**
   * Get all fields that have the specified meta type.
   * Returns an array of field names.
   */
  fields<TValue>(
    type: MetaType<any, any[], TValue>,
    predicate?: (value: TValue) => boolean
  ): string[];
};
