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
  type FocusOptions,
  type FocusContext,
} from "../types";

import { isSpec } from "../is";
import { willDispose } from "./disposable";
import { SetupPhaseError, LifetimeMismatchError } from "../errors";
import { createFocus } from "./focus";
export { createFocus } from "./focus";
import { storeTuple } from "../utils/storeTuple";

// =============================================================================
// Types
// =============================================================================

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
        throw new SetupPhaseError(
          "get",
          "Declare all dependencies at the top of your setup function."
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
        throw new LifetimeMismatchError(currentName, depName, "depend on");
      }

      // Get full instance from resolver
      const instance = resolver.get(depSpec);
      onDependency?.(instance);

      return storeTuple(instance);
    },

    // Implementation handles StoreSpec, Factory, and parameterized Factory overloads
    create(specOrFactory: any, ...args: any[]): any {
      // Prevent dynamic store creation outside setup phase
      if (!isSetupPhase()) {
        throw new SetupPhaseError(
          "create",
          "Declare all child stores at the top of your setup function."
        );
      }

      // Handle plain factory functions (including parameterized factories)
      if (!isSpec(specOrFactory)) {
        // Create fresh instance (no caching)
        // Pass resolver as first arg, then any additional args
        const instance = specOrFactory(resolver, ...args);

        // If instance has dispose method, register it for cleanup
        onDispose?.(willDispose(instance));

        return instance;
      }

      const childSpec = specOrFactory as StoreSpec<any, any>;

      // Check lifetime compatibility:
      // A keepAlive store cannot create an autoDispose child store
      const childLifetime = childSpec.options.lifetime ?? "keepAlive";

      if (currentLifetime === "keepAlive" && childLifetime === "autoDispose") {
        const currentName = spec.options.name ?? "unknown";
        const childName = childSpec.name ?? "unknown";
        throw new LifetimeMismatchError(currentName, childName, "create");
      }

      // Get full instance from resolver
      const instance = resolver.create(childSpec);

      // Register child's dispose to run when parent disposes
      onDispose?.(willDispose(instance));

      return instance;
    },

    update: createUpdateFn(update),

    dirty(prop?: keyof TState): boolean {
      return dirty(prop as any);
    },

    reset() {
      reset();
    },

    onDispose(callback: () => void): void {
      onDispose?.(callback);
    },

    mixin<TResult, TArgs extends unknown[]>(
      mixin: StoreMixin<TState, TResult, TArgs>,
      ...args: TArgs
    ): TResult {
      if (!isSetupPhase()) {
        throw new SetupPhaseError("mixin");
      }
      return mixin(ctx, ...args);
    },

    focus(path: string, options?: FocusOptions<any>): any {
      // Create focus context
      const focusCtx: FocusContext = {
        get: getMutableState,
        update: (updater) => {
          ctx.update(updater);
        },
        subscribe,
      };

      return createFocus(
        ctx,
        resolver,
        focusCtx,
        path.split("."),
        isSetupPhase,
        options
      );
    },
  };

  return ctx;
}
