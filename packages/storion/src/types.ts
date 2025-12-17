export const STORION_TYPE = Symbol("STORION");

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
 * // Set value with reducer
 * setName(prev => prev.toUpperCase());
 *
 * // Listen to changes
 * const unsubscribe = ctx.focus("profile.name").on(({ next, prev }) => {
 *   console.log(`Name changed from ${prev} to ${next}`);
 * });
 */
export type Focus<TValue> = [
  /** Get the current value at the focused path */
  getter: () => TValue,
  /** Set the value at the focused path (accepts value or reducer) */
  setter: (valueOrReducer: TValue | ((prev: TValue) => TValue)) => void
] & {
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
  to<TChild>(relativePath: string, options?: FocusOptions<TChild>): Focus<TChild>;
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
// Store Metadata
// =============================================================================

/**
 * Metadata interface for middleware and tooling.
 * Extend via declaration merging to add typed metadata fields.
 *
 * @example
 * // In your middleware package:
 * declare module 'storion' {
 *   interface StoreMeta {
 *     persist?: boolean;
 *     persistKey?: string;
 *   }
 * }
 *
 * // Then users get autocomplete:
 * store({
 *   meta: { persist: true, persistKey: 'user' },
 *   ...
 * })
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface StoreMeta {}

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
 * Store specification (definition).
 * A spec describes HOW to create a store instance - it holds no state.
 */
export interface StoreSpec<
  TState extends StateBase = StateBase,
  TActions extends ActionsBase = ActionsBase
> extends StorionObject<"store.spec"> {
  /** Store name for debugging */
  readonly name: string;

  /** Store options (state, setup, lifetime, etc.) */
  readonly options: StoreOptions<TState, TActions>;
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
export type StoreTuple<
  S extends StateBase,
  A extends ActionsBase
> = readonly [Readonly<S>, A] & {
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
   * tuple.actions.increment();
   *
   * Note: Returns limited tuple, not full StoreInstance.
   * You cannot access id, subscribe(), or dispose().
   */
  get<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreTuple<S, A>;

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
   * Use a mixin to compose reusable logic.
   * Mixins receive the same context and can return actions or values.
   * Only callable during setup phase.
   *
   * @example
   * const counter = ctx.use(counterMixin);
   * const multiplier = ctx.use(multiplyMixin, 2);
   */
  use<TResult, TArgs extends unknown[]>(
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
  state: TState;

  /** Setup function - runs once when store is created */
  setup: (context: StoreContext<TState>) => TActions;

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
  meta?: StoreMeta;
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
   * **Important:** Only applies to non-dirty props. If a prop has been modified
   * since initialization (e.g., by an effect fetching fresh data), it will be
   * skipped to avoid overwriting newer data with stale persisted data.
   *
   * @example
   * // In persistor
   * const data = JSON.parse(localStorage.getItem(key));
   * instance.hydrate(data);
   */
  hydrate(data: Record<string, unknown>): void;

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
 * Middleware function for intercepting store creation.
 *
 * Middleware can:
 * - Modify the spec before creation
 * - Call next() to get the instance
 * - Wrap or modify the instance after creation
 *
 * @example
 * // Logging middleware
 * const loggingMiddleware: StoreMiddleware = (spec, next) => {
 *   console.log(`Creating store: ${spec.name}`);
 *   const instance = next(spec);
 *   console.log(`Created store: ${instance.id}`);
 *   return instance;
 * };
 *
 * @example
 * // Wrap actions with error boundary
 * const errorBoundaryMiddleware: StoreMiddleware = (spec, next) => {
 *   const instance = next(spec);
 *   // Wrap actions here if needed
 *   return instance;
 * };
 */
export type StoreMiddleware = <
  S extends StateBase = StateBase,
  A extends ActionsBase = ActionsBase
>(
  spec: StoreSpec<S, A>,
  next: (spec: StoreSpec<S, A>) => StoreInstance<S, A>
) => StoreInstance<S, A>;

/**
 * Container options.
 */
export interface ContainerOptions {
  /** Auto dispose options for all stores */
  autoDispose?: AutoDisposeOptions;

  /** Middleware chain for intercepting store creation */
  middleware?: StoreMiddleware[];
}

/**
 * Resolver interface to get store instances.
 * StoreContainer implements this interface.
 */
export interface StoreResolver {
  /**
   * Get a store instance by spec.
   * First call creates instance, subsequent calls return cached.
   */
  get<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): StoreInstance<S, A>;

  /**
   * Get a store instance by its unique ID.
   */
  get(id: string): StoreInstance<any, any> | undefined;

  /**
   * Check if a store instance exists.
   */
  has(spec: StoreSpec<any, any>): boolean;
}

export type AutoDisposeOptions = {
  /** Grace period in ms before disposing the store (default: 100) */
  gracePeriodMs?: number;
};

/**
 * Store container - manages store instances.
 *
 * The container is responsible for:
 * - Creating instances on first access (lazy)
 * - Caching instances (singleton per spec)
 * - Resolving dependencies between stores
 * - Managing lifetime and disposal
 */
export interface StoreContainer
  extends StoreResolver,
    StorionObject<"container"> {
  /**
   * Dispose all cached instances.
   */
  clear(): void;

  /**
   * Dispose a specific store instance.
   */
  dispose(spec: StoreSpec<any, any>): boolean;

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
   * Use a mixin to compose reusable selector logic.
   * Mixins receive the same context and can return computed values.
   *
   * @example
   * const total = ctx.use(sumMixin, [store1, store2]);
   */
  use<TResult, TArgs extends unknown[]>(
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
