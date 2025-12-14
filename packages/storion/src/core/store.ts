/**
 * Store implementation.
 *
 * Creates store specs and instances with the setup() pattern.
 */

import type {
  StateBase,
  ActionsBase,
  StoreSpec,
  StoreOptions,
  StoreInstance,
  StoreResolver,
  SetupContext,
  PropertyConfig,
  DispatchEvent,
} from "../types";

import {
  withHooks,
  untrack as untrackFn,
  scheduleNotification,
  effect as createEffect,
  type EffectFn,
  type EffectOptions,
} from "./tracking";
import { resolveEquality } from "./equality";

// Effect types are now in tracking.ts

import {
  generateStoreId,
  createMutableStateProxy,
  createReadonlyStateProxy,
} from "./proxy";

import { emitter, Emitter } from "../emitter";

// =============================================================================
// Store Spec Factory
// =============================================================================

/**
 * Create a store specification.
 *
 * The spec is a pure definition - no instance is created.
 * Instances are created lazily via container.get().
 */
export function store<TState extends StateBase, TActions extends ActionsBase>(
  options: StoreOptions<TState, TActions>
): StoreSpec<TState, TActions> {
  return {
    name: options.name,
    options,
  };
}

// =============================================================================
// Store Instance Factory
// =============================================================================

/** Re-export StoreResolver from types */
export type { StoreResolver };

/** Property change event payload */
interface PropertyChangeEvent {
  newValue: unknown;
  oldValue: unknown;
}

/** Options for creating store instance */
export interface CreateStoreInstanceOptions {
  /** Called when refCount drops to 0 (after grace period) for autoDispose stores */
  onZeroRefs?: () => void;
  /** Grace period in ms before calling onZeroRefs (default: 100) */
  gracePeriodMs?: number;
}

/**
 * Create a store instance.
 *
 * @internal Used by container, not exported publicly.
 */
export function createStoreInstance<
  TState extends StateBase,
  TActions extends ActionsBase
>(
  spec: StoreSpec<TState, TActions>,
  resolver: StoreResolver,
  instanceOptions: CreateStoreInstanceOptions = {}
): StoreInstance<TState, TActions> {
  const options = spec.options;
  const storeId = generateStoreId(options.name);

  // State
  let disposed = false;
  const rawState = { ...options.state };

  // ==========================================================================
  // AutoDispose RefCount Tracking
  // ==========================================================================

  const isAutoDispose = options.lifetime === "autoDispose";
  const gracePeriodMs = instanceOptions.gracePeriodMs ?? 100;
  let refCount = 0;
  let disposeTimeout: ReturnType<typeof setTimeout> | null = null;

  const incrementRef = (): void => {
    refCount++;
    // Cancel pending dispose if new subscriber joins
    if (disposeTimeout) {
      clearTimeout(disposeTimeout);
      disposeTimeout = null;
    }
  };

  const decrementRef = (): void => {
    refCount--;
    if (refCount <= 0 && isAutoDispose && instanceOptions.onZeroRefs) {
      // Schedule disposal after grace period
      disposeTimeout = setTimeout(() => {
        disposeTimeout = null;
        // Double-check still zero refs (in case of race)
        if (refCount <= 0 && !disposed) {
          instanceOptions.onZeroRefs!();
        }
      }, gracePeriodMs);
    }
  };

  // ==========================================================================
  // Subscribers (using emitters)
  // ==========================================================================

  const changeEmitter = emitter<void>();
  const disposeEmitter = emitter<void>();
  const propertyEmitters = new Map<
    keyof TState,
    Emitter<PropertyChangeEvent>
  >();

  // Get or create property emitter
  const getPropertyEmitter = (
    key: keyof TState
  ): Emitter<PropertyChangeEvent> => {
    let em = propertyEmitters.get(key);
    if (!em) {
      em = emitter<PropertyChangeEvent>();
      propertyEmitters.set(key, em);
    }
    return em;
  };

  // Effect dispose functions (collected via scheduleEffect hook)
  const effectDisposers: VoidFunction[] = [];

  // Property equality
  const propertyEquality = new Map<
    string,
    (a: unknown, b: unknown) => boolean
  >();

  // Default equality
  const defaultEquality = resolveEquality(options.equality ?? "shallow");

  // Get equality for a property
  const getEquality = (key: string) =>
    propertyEquality.get(key) ?? defaultEquality;

  // ==========================================================================
  // Property Change Handler
  // ==========================================================================

  function handlePropertyChange(
    key: string,
    oldValue: unknown,
    newValue: unknown
  ): void {
    // Notify property subscribers (using emitter)
    // Effects subscribe via this mechanism through the hooks system
    const propEmitter = propertyEmitters.get(key as keyof TState);
    if (propEmitter) {
      propEmitter.emit({ newValue, oldValue });
    }

    // Schedule global subscriber notification
    scheduleNotification(() => {
      changeEmitter.emit();
    });
  }

  // ==========================================================================
  // Instance (created early so effects can subscribe)
  // ==========================================================================

  // We need to create the instance structure early so that effects can
  // subscribe via resolver.get(storeId). We'll fill in actions later.
  let instanceActions: TActions = {} as TActions;

  const instance: StoreInstance<TState, TActions> = {
    id: storeId,

    get state() {
      return readonlyState as Readonly<TState>;
    },

    get actions() {
      return instanceActions;
    },

    onDispose: disposeEmitter.on,

    subscribe(
      listenerOrPropKey: (() => void) | keyof TState,
      propListener?: (event: { next: any; prev: any }) => void
    ): VoidFunction {
      incrementRef();

      // Overload 1: subscribe(listener) - all changes
      if (typeof listenerOrPropKey === "function") {
        const unsub = changeEmitter.on(listenerOrPropKey);
        return () => {
          unsub();
          decrementRef();
        };
      }

      // Overload 2: subscribe(propKey, listener) - specific property
      const propKey = listenerOrPropKey;
      const propEmitter = getPropertyEmitter(propKey);
      const unsub = propEmitter.on(({ newValue, oldValue }) => {
        propListener!({ next: newValue, prev: oldValue });
      });
      return () => {
        unsub();
        decrementRef();
      };
    },

    // Internal subscription for effects - doesn't affect refCount
    _subscribeInternal(
      propKey: keyof TState,
      listener: () => void
    ): VoidFunction {
      const propEmitter = getPropertyEmitter(propKey);
      return propEmitter.on(listener);
    },

    dispose() {
      if (disposed) return;
      disposed = true;

      // Cancel pending auto-dispose timeout
      if (disposeTimeout) {
        clearTimeout(disposeTimeout);
        disposeTimeout = null;
      }

      // Dispose all effects
      for (const dispose of effectDisposers) {
        dispose();
      }
      effectDisposers.length = 0;

      // Clear subscribers (using emitter.clear())
      changeEmitter.clear();
      for (const em of propertyEmitters.values()) {
        em.clear();
      }
      propertyEmitters.clear();

      // Notify disposal listeners
      disposeEmitter.emit();
    },

    get disposed() {
      return disposed;
    },
  };

  // ==========================================================================
  // Local Resolver (includes current instance)
  // ==========================================================================

  // Create a local resolver that includes the current instance
  // This allows effects to subscribe to the current store via storeId
  const localResolver: StoreResolver = {
    get(specOrId: any): any {
      // If looking up by ID and it's our store, return our instance
      if (typeof specOrId === "string" && specOrId === storeId) {
        return instance;
      }
      // Otherwise delegate to the container resolver
      return resolver.get(specOrId);
    },
    has(spec: any) {
      return resolver.has(spec);
    },
  };

  // ==========================================================================
  // State Proxies
  // ==========================================================================

  // Mutable proxy for setup context (internal use)
  const mutableState = createMutableStateProxy(
    rawState,
    storeId,
    localResolver,
    getEquality,
    handlePropertyChange
  );

  // Readonly proxy for external access
  const readonlyState = createReadonlyStateProxy(
    rawState,
    storeId,
    localResolver,
    getEquality
  );

  // ==========================================================================
  // Setup Context
  // ==========================================================================

  // Track setup phase to prevent effect() calls outside setup
  let isSetupPhase = true;

  // Current store's lifetime (default is keepAlive)
  const currentLifetime = options.lifetime ?? "keepAlive";

  const setupContext: SetupContext<TState> = {
    state: mutableState,

    get<S extends StateBase, A extends ActionsBase>(
      depSpec: StoreSpec<S, A>
    ): readonly [Readonly<S>, A] {
      // Prevent dynamic store creation outside setup phase
      if (!isSetupPhase) {
        throw new Error(
          `get() can only be called during setup phase. ` +
            `Do not call get() inside actions or async callbacks. ` +
            `Declare all dependencies at the top of your setup function.`
        );
      }

      // Check lifetime compatibility:
      // A keepAlive store cannot depend on an autoDispose store
      const depLifetime = depSpec.options.lifetime ?? "keepAlive";

      if (currentLifetime === "keepAlive" && depLifetime === "autoDispose") {
        const currentName = options.name ?? "unknown";
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
      // Return tuple [readonlyState, actions]
      return [instance.state, instance.actions] as const;
    },

    effect(fn: EffectFn, options?: EffectOptions) {
      // Prevent effect() calls outside setup phase
      if (!isSetupPhase) {
        throw new Error(
          `effect() can only be called during setup phase. ` +
            `Do not call effect() inside actions, async callbacks, or after setup completes.`
        );
      }

      // Use the hook-based effect system
      // Effects run after store instance is created (via scheduleEffect hook)
      createEffect(fn, options);
    },

    config<K extends keyof TState>(key: K, config: PropertyConfig<TState[K]>) {
      if (config.equality) {
        propertyEquality.set(
          key as string,
          resolveEquality(config.equality) as (
            a: unknown,
            b: unknown
          ) => boolean
        );
      }
    },

    untrack: untrackFn,
  };

  // ==========================================================================
  // Run Setup
  // ==========================================================================

  let actions: TActions;

  // Collect scheduled effects during setup, run them after setup completes
  const scheduledEffects: Array<() => VoidFunction> = [];

  try {
    // Run setup with hooks to collect scheduled effects
    actions = withHooks(
      (current) => ({
        ...current,
        scheduleEffect: (runEffect) => {
          // Collect effect runners, don't run yet
          scheduledEffects.push(runEffect);
        },
      }),
      () => options.setup(setupContext)
    );
  } catch (error) {
    // Cleanup any effects that were already scheduled
    for (const dispose of effectDisposers) {
      dispose();
    }
    throw error;
  } finally {
    // End setup phase - effect() calls after this will throw
    isSetupPhase = false;
  }

  // Now run all scheduled effects and collect their dispose functions
  for (const runEffect of scheduledEffects) {
    const dispose = runEffect();
    effectDisposers.push(dispose);
  }

  // ==========================================================================
  // Wrap Actions and assign to instance
  // ==========================================================================

  const wrappedActions = {} as TActions;

  for (const [name, action] of Object.entries(actions)) {
    (wrappedActions as any)[name] = (...args: any[]) => {
      if (disposed) {
        throw new Error(`Cannot call action on disposed store: ${storeId}`);
      }

      try {
        const result = action(...args);

        // Dispatch event
        if (options.onDispatch) {
          options.onDispatch({ name, args } as DispatchEvent<TActions>);
        }

        return result;
      } catch (error) {
        if (options.onError) {
          options.onError(error);
        }
        throw error;
      }
    };
  }

  // Assign wrapped actions to instance
  instanceActions = wrappedActions;

  // ==========================================================================
  // Initial AutoDispose Check
  // ==========================================================================

  // For autoDispose stores with no initial subscribers, start the disposal timer
  if (isAutoDispose && refCount === 0 && instanceOptions.onZeroRefs) {
    disposeTimeout = setTimeout(() => {
      disposeTimeout = null;
      if (refCount <= 0 && !disposed) {
        instanceOptions.onZeroRefs!();
      }
    }, gracePeriodMs);
  }

  return instance;
}
