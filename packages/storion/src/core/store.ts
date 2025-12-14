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
  SetupContext,
  PropertyConfig,
  DispatchEvent,
} from "../types";

import {
  withHooks,
  untrack as untrackFn,
  scheduleNotification,
} from "./tracking";
import { resolveEquality } from "./equality";

// =============================================================================
// Effect Types (local to store)
// =============================================================================

/**
 * Represents a reactive effect.
 */
interface Effect {
  /** The effect function */
  fn: () => void | VoidFunction;

  /** Cleanup function from previous run */
  cleanup: VoidFunction | null;

  /** Dependencies tracked during last run: "storeId.propKey" */
  dependencies: Set<string>;

  /** Properties written during this effect run */
  writtenProps: Set<string>;
}

/**
 * Create a new effect.
 */
function createEffect(fn: () => void | VoidFunction): Effect {
  return {
    fn,
    cleanup: null,
    dependencies: new Set(),
    writtenProps: new Set(),
  };
}

/**
 * Run an effect, tracking its dependencies via hooks.
 */
function runEffect(effect: Effect): void {
  // 1. Run cleanup from previous execution
  if (effect.cleanup) {
    effect.cleanup();
    effect.cleanup = null;
  }

  // 2. Clear old dependencies and written props
  effect.dependencies.clear();
  effect.writtenProps.clear();

  // 3. Run effect with hooks to track dependencies
  withHooks(
    {
      onRead: ({ storeId, prop }) => {
        effect.dependencies.add(`${storeId}.${prop}`);
      },
      onWrite: ({ storeId, prop }) => {
        const depKey = `${storeId}.${prop}`;

        // Check for self-reference: reading AND writing same property
        if (effect.dependencies.has(depKey)) {
          throw new Error(
            `Self-reference detected: Effect reads and writes "${prop}". ` +
              `This would cause an infinite loop.`
          );
        }

        effect.writtenProps.add(depKey);
      },
    },
    () => {
      // 4. Run effect (tracking happens via hooks)
      const cleanup = effect.fn();

      // 5. Store cleanup function
      if (typeof cleanup === "function") {
        effect.cleanup = cleanup;
      }
    }
  );
}

/**
 * Dispose an effect (run cleanup).
 */
function disposeEffect(effect: Effect): void {
  if (effect.cleanup) {
    effect.cleanup();
    effect.cleanup = null;
  }
  effect.dependencies.clear();
  effect.writtenProps.clear();
}

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
    __storion__: true,
    _options: options,
  } as StoreSpec<TState, TActions>;
}

// =============================================================================
// Store Instance Factory
// =============================================================================

/**
 * Resolver function to get other store instances.
 * Provided by container to create instances.
 */
export type StoreResolver = <S extends StateBase, A extends ActionsBase>(
  spec: StoreSpec<S, A>
) => StoreInstance<S, A>;

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
  const options = spec._options;
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

  // Effects
  const effects: Effect[] = [];
  const propertyEffects = new Map<string, Set<Effect>>();
  const runningEffects = new Set<Effect>(); // Track currently running effects

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
    // Notify property-specific effects
    const propEffects = propertyEffects.get(key);
    if (propEffects) {
      // Snapshot the effects to avoid issues with modifying set during iteration
      const effectsToRun = [...propEffects];

      for (const effect of effectsToRun) {
        // Skip effects that are currently running (prevent infinite recursion)
        if (runningEffects.has(effect)) {
          continue;
        }

        runningEffects.add(effect);
        try {
          runEffect(effect);
          registerEffectDependencies(effect);
        } finally {
          runningEffects.delete(effect);
        }
      }
    }

    // Notify property subscribers (using emitter)
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
  // State Proxies
  // ==========================================================================

  // Mutable proxy for setup context (internal use)
  const mutableState = createMutableStateProxy(
    rawState,
    storeId,
    getEquality,
    handlePropertyChange
  );

  // Readonly proxy for external access
  const readonlyState = createReadonlyStateProxy(
    rawState,
    storeId,
    getEquality
  );

  // ==========================================================================
  // Effect Registration
  // ==========================================================================

  function registerEffectDependencies(effect: Effect): void {
    // Clear previous registrations for this effect
    for (const [, effectSet] of propertyEffects) {
      effectSet.delete(effect);
    }

    // Register new dependencies (only READ dependencies, not written properties)
    for (const dep of effect.dependencies) {
      const [depStoreId, propKey] = dep.split(".");

      // Skip properties that were written by this effect (they're in writtenProps)
      if (effect.writtenProps.has(dep)) {
        continue;
      }

      // Only register if it's this store's property
      if (depStoreId === storeId) {
        let effectSet = propertyEffects.get(propKey);
        if (!effectSet) {
          effectSet = new Set();
          propertyEffects.set(propKey, effectSet);
        }
        effectSet.add(effect);
      }
    }
  }

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
      // Check lifetime compatibility:
      // A keepAlive store cannot depend on an autoDispose store
      const depLifetime = depSpec._options.lifetime ?? "keepAlive";

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
      const instance = resolver(depSpec);
      // Return tuple [readonlyState, actions]
      return [instance.state, instance.actions] as const;
    },

    effect(fn) {
      // Prevent effect() calls outside setup phase
      if (!isSetupPhase) {
        throw new Error(
          `effect() can only be called during setup phase. ` +
            `Do not call effect() inside actions, async callbacks, or after setup completes.`
        );
      }

      const effect = createEffect(fn);

      // Run immediately (with tracking to prevent re-entry)
      runningEffects.add(effect);
      try {
        runEffect(effect);
        registerEffectDependencies(effect);
      } finally {
        runningEffects.delete(effect);
      }

      // Store for cleanup
      effects.push(effect);
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

  try {
    actions = options.setup(setupContext);
  } catch (error) {
    // Cleanup effects on setup error
    for (const effect of effects) {
      disposeEffect(effect);
    }
    throw error;
  } finally {
    // End setup phase - effect() calls after this will throw
    isSetupPhase = false;
  }

  // ==========================================================================
  // Wrap Actions
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

  // ==========================================================================
  // Instance
  // ==========================================================================

  const instance: StoreInstance<TState, TActions> = {
    id: storeId,

    get state() {
      return readonlyState as Readonly<TState>;
    },

    actions: wrappedActions,

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

    dispose() {
      if (disposed) return;
      disposed = true;

      // Cancel pending auto-dispose timeout
      if (disposeTimeout) {
        clearTimeout(disposeTimeout);
        disposeTimeout = null;
      }

      // Dispose all effects
      for (const effect of effects) {
        disposeEffect(effect);
      }
      effects.length = 0;

      // Clear subscribers (using emitter.clear())
      changeEmitter.clear();
      for (const em of propertyEmitters.values()) {
        em.clear();
      }
      propertyEmitters.clear();

      // Clear property effects
      propertyEffects.clear();
    },

    get disposed() {
      return disposed;
    },
  };

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
