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
export interface StateBase {
  [key: string]: unknown;
}

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
// Focus (Lens-like state setters)
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
        [K in keyof T & string]: T[K] extends object
          ? T[K] extends unknown[]
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
 * A focus setter for a nested state path.
 * Can be used as an action and chained with .to() for sub-paths.
 *
 * @example
 * const setAddress = focus("profile.address");
 * setAddress({ city: "NYC" }); // Set the whole address
 *
 * const setCity = setAddress.to("city");
 * setCity("LA"); // Set just the city
 */
export interface FocusSetter<T> {
  /** Set the value at this path. Auto-creates intermediate objects if null/undefined. */
  (value: T): void;

  /**
   * Create a sub-focus for a nested property.
   * @param key - Property key to focus on
   */
  to<K extends keyof NonNullable<T> & string>(
    key: K
  ): FocusSetter<NonNullable<T>[K]>;
}

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
> {
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
// Setup Context
// =============================================================================

/**
 * Context provided to the setup() function.
 */
export interface StoreContext<TState extends StateBase> {
  /**
   * Mutable reactive state proxy.
   * Writes trigger subscriber notifications.
   * Reads inside effect() create reactive dependencies.
   */
  readonly state: TState;

  /**
   * Get another store's state and actions.
   * Returns [readonlyState, actions] tuple.
   * Creates dependency - store is created if not exists.
   *
   * Note: Returns limited tuple, not full StoreInstance.
   * You cannot access id, subscribe(), or dispose().
   */
  resolve<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): readonly [Readonly<S>, A];

  /**
   * Update state using Immer-style updater function.
   *
   * @example
   * update(draft => {
   *   draft.items.push({ id: 1, name: 'New Item' });
   *   draft.count++;
   * });
   */
  update(updater: (draft: TState) => void): void;

  /**
   * Update state with partial object (shallow merge).
   *
   * @example
   * update({ count: 10, name: 'Updated' });
   */
  update(partial: Partial<TState>): void;

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
   * Create a lens-like setter for a nested state path.
   * Auto-creates intermediate objects when null/undefined.
   * Does not support array indices, only object properties.
   *
   * @example
   * const setAddress = focus("profile.address");
   * setAddress({ city: "NYC", street: "5th Ave" });
   *
   * // Chain with .to() for sub-paths
   * const setCity = setAddress.to("city");
   * setCity("LA");
   *
   * // Can be returned as actions
   * return { setAddress, setCity };
   */
  focus<P extends StatePath<TState>>(
    path: P
  ): FocusSetter<PathValue<TState, P>>;
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
> {
  /** Unique identifier for this instance */
  readonly id: string;

  /** The store specification that created this instance */
  readonly spec: StoreSpec<TState, TActions>;

  /** Readonly reactive state proxy */
  readonly state: Readonly<TState>;

  /** Bound actions with reactive last() method */
  readonly actions: ReactiveActions<TActions>;

  /** Store instances this store depends on (via resolve() in setup) */
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
export type StoreMiddleware = <S extends StateBase, A extends ActionsBase>(
  spec: StoreSpec<S, A>,
  next: (spec: StoreSpec<S, A>) => StoreInstance<S, A>
) => StoreInstance<S, A>;

/**
 * Container options.
 */
export interface ContainerOptions {
  /** Default lifetime for stores */
  defaultLifetime?: Lifetime;

  /** Default equality for stores */
  defaultEquality?: Equality;

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

/**
 * Store container - manages store instances.
 *
 * The container is responsible for:
 * - Creating instances on first access (lazy)
 * - Caching instances (singleton per spec)
 * - Resolving dependencies between stores
 * - Managing lifetime and disposal
 */
export interface StoreContainer extends StoreResolver {
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
export interface SelectorContext {
  /**
   * Get a store's state and actions.
   *
   * Returns a tracking proxy that records property access
   * for fine-grained re-render optimization.
   *
   * @param spec - Store specification
   * @returns Tuple of [trackingState, actions]
   */
  resolve<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): readonly [Readonly<S>, A];

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
