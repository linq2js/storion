/**
 * Store context implementation.
 *
 * Provides the setup context for store initialization with focus() support.
 */

import {
  STORION_TYPE,
  type StateBase,
  type ActionsBase,
  type StoreSpec,
  type StoreInstance,
  type Resolver,
  type StoreContext,
  type StoreUpdate,
  type StoreMixin,
  type Focus,
  type FocusOptions,
  type Equality,
} from "../types";

import { resolveEquality } from "./equality";
import { isSpec } from "../is";

// =============================================================================
// Types
// =============================================================================

/**
 * Internal focus context for creating focus instances.
 */
export interface FocusContext<TState extends StateBase> {
  /** Get current state */
  getState: () => TState;
  /** Update state with immer-style updater */
  update: (updater: (draft: TState) => void) => void;
  /** Subscribe to state changes */
  subscribe: (listener: () => void) => VoidFunction;
}

/**
 * Options for creating store context.
 */
export interface CreateStoreContextOptions<
  TState extends StateBase,
  TActions extends ActionsBase
> {
  /** The store specification */
  spec: StoreSpec<TState, TActions>;
  /** The resolver for dependencies */
  resolver: Resolver;
  /** Get current mutable state */
  getMutableState: () => TState;
  /** Update state using immer */
  update: (updater: ((draft: TState) => void) | Partial<TState>) => void;
  /** Subscribe to store changes */
  subscribe: (listener: () => void) => VoidFunction;
  /** Check if property is dirty */
  dirty: (prop?: keyof TState) => boolean;
  /** Reset state to initial */
  reset: () => void;
  /** Get the store instance (may be null during setup) */
  getInstance: () => StoreInstance<TState, TActions> | null;
  /** Callback when dependency is resolved */
  onDependency?: (instance: StoreInstance<any, any>) => void;
  /** Register a callback to run when parent store disposes */
  onDispose?: (callback: () => void) => void;
  /** Check if in setup phase */
  isSetupPhase: () => boolean;
}

// =============================================================================
// Focus Implementation
// =============================================================================

/**
 * Get value at a nested path.
 */
function getAtPath<T>(obj: T, segments: string[]): unknown {
  let current: unknown = obj;
  for (const key of segments) {
    if (current == null) return current;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Create a focus for a nested state path.
 *
 * @param focusCtx - Focus context with state access
 * @param path - Dot-notation path to focus on
 * @param options - Focus options (fallback, equality)
 */
export function createFocus<TState extends StateBase, TValue>(
  focusCtx: FocusContext<TState>,
  path: string,
  options?: FocusOptions<TValue>
): Focus<TValue> {
  const segments = path.split(".");
  const { fallback, equality: equalityOption } = options ?? {};
  const equalityFn = resolveEquality(equalityOption as Equality | undefined);

  /**
   * Get the value at the focused path, applying fallback if nullish.
   */
  const getter = (): TValue => {
    const state = focusCtx.getState();
    const value = getAtPath(state, segments) as TValue;

    // Apply fallback if value is nullish and fallback is provided
    if ((value === null || value === undefined) && fallback) {
      return fallback() as TValue;
    }

    return value;
  };

  /**
   * Set the value at the focused path.
   *
   * Supports three overloads:
   * - set(value) - direct value replacement
   * - set((prev) => newValue) - reducer that returns new value
   * - set((draft) => { draft.x = y }) - immer-style produce (mutate draft, no return)
   */
  const setter = (
    valueOrReducerOrProduce: TValue | ((prev: TValue) => TValue | void)
  ): void => {
    focusCtx.update((draft: TState) => {
      // Navigate to parent, auto-creating objects along the way
      let current: unknown = draft;
      for (let i = 0; i < segments.length - 1; i++) {
        const key = segments[i];
        if ((current as Record<string, unknown>)[key] == null) {
          (current as Record<string, unknown>)[key] = {};
        }
        current = (current as Record<string, unknown>)[key];
      }

      const lastKey = segments[segments.length - 1];

      // Get current value for reducer or to apply fallback
      let currentValue = (current as Record<string, unknown>)[
        lastKey
      ] as TValue;

      // Apply fallback if current value is nullish
      if ((currentValue === null || currentValue === undefined) && fallback) {
        currentValue = fallback() as TValue;
        // Set fallback value so produce-style mutations have something to work with
        (current as Record<string, unknown>)[lastKey] = currentValue;
      }

      // Handle function (reducer or produce) vs direct value
      if (typeof valueOrReducerOrProduce === "function") {
        const fn = valueOrReducerOrProduce as (prev: TValue) => TValue | void;
        const result = fn(currentValue);
        // If function returns a value, use it (reducer style)
        // If undefined, assume produce style - mutations already applied to draft
        if (result !== undefined) {
          (current as Record<string, unknown>)[lastKey] = result;
        }
      } else {
        // Direct value replacement
        (current as Record<string, unknown>)[lastKey] = valueOrReducerOrProduce;
      }
    });
  };

  /**
   * Subscribe to changes at the focused path.
   * Uses configured equality to detect changes.
   */
  const on = (
    listener: (event: { next: TValue; prev: TValue }) => void
  ): VoidFunction => {
    // Track previous value
    let prevValue = getter();

    // Subscribe to store changes
    return focusCtx.subscribe(() => {
      const nextValue = getter();

      // Check if value changed using equality function
      if (!equalityFn(prevValue, nextValue)) {
        const prev = prevValue;
        prevValue = nextValue;
        listener({ next: nextValue, prev });
      }
    });
  };

  /**
   * Create a new Focus relative to the current path.
   */
  const to = <TChild>(
    relativePath: string,
    childOptions?: FocusOptions<TChild>
  ): Focus<TChild> => {
    const combinedPath = `${path}.${relativePath}`;
    return createFocus(focusCtx, combinedPath, childOptions);
  };

  // Create tuple with on() and to() methods
  const focus = [getter, setter] as Focus<TValue>;
  const focusObj = focus as unknown as {
    [STORION_TYPE]: "focus";
    on: typeof on;
    to: typeof to;
  };
  focusObj[STORION_TYPE] = "focus";
  focusObj.on = on;
  focusObj.to = to;

  return focus;
}

// =============================================================================
// Update Function Factory
// =============================================================================

/**
 * Create an update function with the `.action()` method.
 */
function createUpdateFn<TState extends StateBase>(
  update: (updater: (draft: TState) => void) => void
): StoreUpdate<TState> {
  // Create the base update function
  const updateFn = (
    updaterOrPartial: ((draft: TState) => void) | Partial<TState>
  ): void => {
    if (typeof updaterOrPartial === "function") {
      update(updaterOrPartial);
    } else {
      update((draft) => {
        Object.assign(draft, updaterOrPartial);
      });
    }
  };

  // Add the action method
  updateFn.action = <TArgs extends unknown[]>(
    updater: (draft: TState, ...args: TArgs) => void
  ): ((...args: TArgs) => void) => {
    return (...args: TArgs): void => {
      update((draft) => {
        updater(draft, ...args);
      });
    };
  };

  return updateFn as StoreUpdate<TState>;
}

// =============================================================================
// Store Context Factory
// =============================================================================

/**
 * Create a store context for the setup function.
 *
 * The context provides:
 * - state: Mutable reactive state proxy
 * - get(): Get other store's state and actions
 * - create(): Create a child store with automatic disposal
 * - update(): Update state with immer or partial object
 * - focus(): Create lens-like accessor for nested paths
 * - mixin(): Compose reusable mixins
 * - dirty(): Check if state has been modified
 * - reset(): Reset state to initial values
 */
export function createStoreContext<
  TState extends StateBase,
  TActions extends ActionsBase
>(options: CreateStoreContextOptions<TState, TActions>): StoreContext<TState> {
  const {
    spec,
    resolver,
    getMutableState,
    update,
    subscribe,
    dirty,
    reset,
    // getInstance - reserved for future use
    onDependency,
    onDispose,
    isSetupPhase,
  } = options;

  const currentLifetime = spec.options.lifetime ?? "keepAlive";

  const ctx: StoreContext<TState> = {
    [STORION_TYPE]: "store.context",

    get state() {
      return getMutableState();
    },

    // Implementation handles both StoreSpec and Factory overloads
    get(specOrFactory: any): any {
      // Prevent dynamic store creation outside setup phase
      if (!isSetupPhase()) {
        throw new Error(
          `get() can only be called during setup phase. ` +
            `Do not call get() inside actions or async callbacks. ` +
            `Declare all dependencies at the top of your setup function.`
        );
      }

      // Handle plain factory functions - return instance directly
      if (!isSpec(specOrFactory)) {
        return resolver.get(specOrFactory);
      }

      const depSpec = specOrFactory as StoreSpec<any, any>;

      // Check lifetime compatibility:
      // A keepAlive store cannot depend on an autoDispose store
      const depLifetime = depSpec.options.lifetime ?? "keepAlive";

      if (currentLifetime === "keepAlive" && depLifetime === "autoDispose") {
        const currentName = spec.options.name ?? "unknown";
        const depName = depSpec.name ?? "unknown";
        throw new Error(
          `Lifetime mismatch: Store "${currentName}" (keepAlive) cannot depend on ` +
            `store "${depName}" (autoDispose). A long-lived store cannot depend on ` +
            `a store that may be disposed. Either change "${currentName}" to autoDispose, ` +
            `or change "${depName}" to keepAlive.`
        );
      }

      // Get full instance from resolver
      const instance = resolver.get(depSpec);
      onDependency?.(instance);

      // Return tuple with named properties
      const tuple = [instance.state, instance.actions] as const;
      return Object.assign(tuple, {
        state: instance.state,
        actions: instance.actions,
      });
    },

    // Implementation handles both StoreSpec and Factory overloads
    create(specOrFactory: any): any {
      // Prevent dynamic store creation outside setup phase
      if (!isSetupPhase()) {
        throw new Error(
          `create() can only be called during setup phase. ` +
            `Do not call create() inside actions or async callbacks. ` +
            `Declare all child stores at the top of your setup function.`
        );
      }

      // Handle plain factory functions
      if (!isSpec(specOrFactory)) {
        // Create fresh instance (no caching)
        const instance = specOrFactory(resolver);

        // If instance has dispose method, register it for cleanup
        if (instance && typeof instance.dispose === "function") {
          onDispose?.(instance.dispose);
        }

        return instance;
      }

      const childSpec = specOrFactory as StoreSpec<any, any>;

      // Check lifetime compatibility:
      // A keepAlive store cannot create an autoDispose child store
      const childLifetime = childSpec.options.lifetime ?? "keepAlive";

      if (currentLifetime === "keepAlive" && childLifetime === "autoDispose") {
        const currentName = spec.options.name ?? "unknown";
        const childName = childSpec.name ?? "unknown";
        throw new Error(
          `Lifetime mismatch: Store "${currentName}" (keepAlive) cannot create ` +
            `child store "${childName}" (autoDispose). A long-lived store cannot create ` +
            `a store that may be disposed before it. Either change "${currentName}" to autoDispose, ` +
            `or change "${childName}" to keepAlive.`
        );
      }

      // Get full instance from resolver
      const instance = resolver.create(childSpec);

      // Register child's dispose to run when parent disposes
      onDispose?.(instance.dispose);

      return instance;
    },

    update: createUpdateFn(update),

    dirty(prop?: keyof TState): boolean {
      return dirty(prop as any);
    },

    reset() {
      reset();
    },

    mixin<TResult, TArgs extends unknown[]>(
      mixin: StoreMixin<TState, TResult, TArgs>,
      ...args: TArgs
    ): TResult {
      if (!isSetupPhase()) {
        throw new Error(
          `mixin() can only be called during setup phase. ` +
            `Do not call mixin() inside actions or async callbacks.`
        );
      }
      return mixin(ctx, ...args);
    },

    focus(path: string, options?: FocusOptions<any>): any {
      // Create focus context
      const focusCtx: FocusContext<TState> = {
        getState: getMutableState,
        update: (updater) => {
          ctx.update(updater);
        },
        subscribe,
      };

      return createFocus(focusCtx, path, options);
    },
  };

  return ctx;
}
