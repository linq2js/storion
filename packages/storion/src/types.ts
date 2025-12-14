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

export type EqualityShorthand = "strict" | "shallow" | "deep";

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
 */
export type DispatchEvent<TActions extends ActionsBase> = {
  [K in keyof TActions]: {
    name: K;
    args: Parameters<TActions[K]>;
  };
}[keyof TActions];

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
  readonly name?: string;

  /** Store options (state, setup, lifetime, etc.) */
  readonly options: StoreOptions<TState, TActions>;
}

// =============================================================================
// Property Config
// =============================================================================

/**
 * Configuration options for a state property.
 */
export interface PropertyConfig<T> {
  /** Equality strategy for this property */
  equality?: Equality<T>;
}

// =============================================================================
// Setup Context
// =============================================================================

/**
 * Context provided to the setup() function.
 */
export interface SetupContext<TState extends StateBase> {
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
  get<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): readonly [Readonly<S>, A];

  /**
   * Define a reactive effect.
   * - Runs immediately (sync) during setup
   * - Re-runs when tracked dependencies change
   * - Can return cleanup function
   */
  effect(fn: () => void | VoidFunction): void;

  /**
   * Configure a specific state property.
   */
  config<K extends keyof TState>(
    key: K,
    options: PropertyConfig<TState[K]>
  ): void;

  /**
   * Execute function without tracking dependencies.
   */
  untrack<T>(fn: () => T): T;
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
  setup: (context: SetupContext<TState>) => TActions;

  /** Default equality strategy for all properties */
  equality?: Equality;

  /** Lifetime management strategy */
  lifetime?: Lifetime;

  /** Called after every action dispatch */
  onDispatch?: (event: DispatchEvent<TActions>) => void;

  /** Called when an effect or action throws an error */
  onError?: (error: unknown) => void;
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

  /** Readonly reactive state proxy */
  readonly state: Readonly<TState>;

  /** Bound actions */
  readonly actions: TActions;

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
   */
  subscribe(listener: () => void): VoidFunction;
  subscribe<K extends keyof TState>(
    propKey: K,
    listener: (event: { next: TState[K]; prev: TState[K] }) => void
  ): VoidFunction;

  /**
   * Subscribe to store disposal events.
   */
  onDispose(listener: () => void): VoidFunction;

  /** Dispose the instance and clean up resources */
  dispose(): void;

  /** Whether the instance is disposed */
  readonly disposed: boolean;
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
  get<S extends StateBase, A extends ActionsBase>(
    spec: StoreSpec<S, A>
  ): readonly [Readonly<S>, A];
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
// Tracked Dependency
// =============================================================================

/**
 * Represents a tracked dependency for fine-grained updates.
 */
export interface TrackedDependency {
  /** Store instance ID */
  storeId: string;

  /** Property key that was accessed */
  propKey: string;

  /** Value at the time of access */
  value: unknown;
}
