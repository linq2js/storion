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
  StoreContext,
  DispatchEvent,
} from "../types";

import { produce } from "immer";

import {
  withHooks,
  scheduleNotification,
  trackRead,
  trackWrite,
  hasReadHook,
  hasWriteHook,
} from "./tracking";
import { resolveEquality, strictEqual } from "./equality";
import { generateSpecName, generateStoreId } from "./generator";

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
  const name = options.name ?? generateSpecName();
  return {
    name,
    options,
  };
}

// =============================================================================
// Store Instance Factory
// =============================================================================

/** Property change event payload */
interface PropertyChangeEvent {
  newValue: unknown;
  oldValue: unknown;
}

/** Options for creating store instance */
export interface CreateStoreInstanceOptions {
  /** Called when refCount drops to 0 (after grace period) for autoDispose stores */
  onUnused?: () => void;
  /** Grace period in ms before calling onUnused (default: 100) */
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
  const storeId = generateStoreId(spec.name);

  // State (immutable - replaced on each update)
  let disposed = false;
  let currentState = { ...options.state } as TState;
  let initialState: TState = currentState; // Same reference initially, updated after effects

  // ==========================================================================
  // AutoDispose RefCount Tracking
  // ==========================================================================

  const isAutoDispose = options.lifetime === "autoDispose";
  const gracePeriodMs = instanceOptions.gracePeriodMs ?? 100;
  let refCount = 0;
  let disposeTimeout: ReturnType<typeof setTimeout> | null = null;

  const incrementRef = (): void => {
    if (!isAutoDispose || isSetupPhase) {
      return;
    }

    refCount++;
    // Cancel pending dispose if new subscriber joins
    if (disposeTimeout) {
      clearTimeout(disposeTimeout);
      disposeTimeout = null;
    }
  };

  const decrementRef = (): void => {
    if (!isAutoDispose || isSetupPhase) {
      return;
    }

    refCount--;
    if (refCount <= 0 && instanceOptions.onUnused) {
      // Schedule disposal after grace period
      disposeTimeout = setTimeout(() => {
        disposeTimeout = null;
        // Double-check still zero refs (in case of race)
        if (refCount <= 0 && !disposed) {
          instanceOptions.onUnused!();
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
  const disposeEffectsEmitter = emitter();

  // Property equality - resolve from options
  const equalityOption = options.equality;
  const propertyEquality = new Map<
    string,
    (a: unknown, b: unknown) => boolean
  >();
  let defaultEquality: ((a: unknown, b: unknown) => boolean) | null = null;

  // Track if any custom equality is configured (for fast path optimization)
  let hasCustomEquality = false;

  if (equalityOption) {
    hasCustomEquality = true;
    if (
      typeof equalityOption === "string" ||
      typeof equalityOption === "function"
    ) {
      // Single equality for all props
      defaultEquality = resolveEquality(equalityOption);
    } else {
      // Per-property configuration
      const { default: defaultEq, ...propEqualities } = equalityOption;
      if (defaultEq) {
        defaultEquality = resolveEquality(defaultEq);
      }
      for (const [key, eq] of Object.entries(propEqualities)) {
        if (eq) {
          propertyEquality.set(key, resolveEquality(eq));
        }
      }
    }
  }

  // Get equality for a property (only called when hasCustomEquality is true)
  const getEquality = (key: string) =>
    propertyEquality.get(key) ?? defaultEquality ?? strictEqual;

  // Fast path: check equality using === when no custom equality configured
  // Otherwise use configured equality function
  const isEqual = hasCustomEquality
    ? (key: string, a: unknown, b: unknown) => getEquality(key)(a, b)
    : (_key: string, a: unknown, b: unknown) => a === b;

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
    spec,

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
      disposeEffectsEmitter.emitAndClear();
      // Clear subscribers (using emitter.clear())
      changeEmitter.clear();

      for (const em of propertyEmitters.values()) {
        em.clear();
      }
      propertyEmitters.clear();

      // Notify disposal listeners
      disposeEmitter.emit();
    },

    disposed() {
      return disposed;
    },

    dirty(prop?: keyof TState): boolean {
      if (prop !== undefined) {
        return currentState[prop] !== initialState[prop];
      }
      // Simple reference comparison - state is immutable
      return currentState !== initialState;
    },

    reset() {
      if (currentState === initialState) return; // Already at initial state

      // Capture changed keys before reset
      const changedKeys: Array<{ key: keyof TState; oldValue: unknown }> = [];
      for (const key of Object.keys(initialState) as Array<keyof TState>) {
        if (currentState[key] !== initialState[key]) {
          changedKeys.push({ key, oldValue: currentState[key] });
        }
      }

      // Reset to initial state (single assignment)
      currentState = initialState;

      // Trigger listeners for changed properties
      for (const { key, oldValue } of changedKeys) {
        handlePropertyChange(key as string, oldValue, initialState[key]);
      }
    },

    dehydrate(): Record<string, unknown> {
      const normalizer = options.normalize;
      if (normalizer) {
        return normalizer(currentState);
      }
      // Default: return shallow copy of state
      return { ...currentState };
    },

    hydrate(data: Record<string, unknown>): void {
      // Transform data using denormalize option if provided
      const denormalizer = options.denormalize;
      const newState = denormalizer
        ? denormalizer(data)
        : (data as unknown as TState);

      // Apply each property, but skip dirty props to avoid overwriting fresh data
      for (const key of Object.keys(newState) as Array<keyof TState>) {
        // Skip if prop is dirty (has been modified since initialization)
        if (currentState[key] !== initialState[key]) {
          continue;
        }

        const oldValue = currentState[key];
        const newValue = newState[key];

        // Skip if value hasn't changed
        if (isEqual(key as string, oldValue, newValue)) {
          continue;
        }

        // Apply the change
        currentState = { ...currentState, [key]: newValue };
        handlePropertyChange(key as string, oldValue, newValue);
      }
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
      if (specOrId === storeId) {
        return instance;
      }
      // Otherwise delegate to the container resolver
      return resolver.get(specOrId);
    },
    has: resolver.has,
  };

  // ==========================================================================
  // State Objects with defineProperty (faster reads than Proxy)
  // ==========================================================================

  // Create reactive state object using Object.defineProperty
  // Since we know all props upfront, this is faster than Proxy for reads
  function createReactiveState(writable: boolean): TState {
    const obj = {} as TState;

    for (const prop of Object.keys(currentState) as Array<keyof TState>) {
      Object.defineProperty(obj, prop, {
        enumerable: true,
        configurable: false,
        get() {
          const value = currentState[prop];
          // Only call trackRead if there's an active hook (perf optimization)
          if (hasReadHook()) {
            trackRead(storeId, prop as string, value, localResolver);
          }
          return value;
        },
        set: writable
          ? (value: unknown) => {
              const oldValue = currentState[prop];
              // Only call trackWrite if there's an active hook (perf optimization)
              if (hasWriteHook()) {
                trackWrite(storeId, prop as string, value, oldValue);
              }
              // Fast path: skip equality function call when no custom equality configured
              if (isEqual(prop as string, oldValue, value)) return;
              // Immutable update - create new state object
              currentState = { ...currentState, [prop]: value };
              handlePropertyChange(prop as string, oldValue, value);
            }
          : () => {
              // Readonly - ignore writes silently
            },
      });
    }

    return obj;
  }

  // Mutable state for setup context (internal use)
  const mutableState = createReactiveState(true);

  // Readonly state for external access
  const readonlyState = createReactiveState(false);

  // ==========================================================================
  // Setup Context
  // ==========================================================================

  // Track setup phase to prevent effect() calls outside setup
  let isSetupPhase = true;

  // Current store's lifetime (default is keepAlive)
  const currentLifetime = options.lifetime ?? "keepAlive";

  const setupContext: StoreContext<TState> = {
    state: mutableState,

    resolve<S extends StateBase, A extends ActionsBase>(
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

    update(updaterOrPartial: ((draft: TState) => void) | Partial<TState>) {
      let nextState = currentState;
      if (typeof updaterOrPartial === "function") {
        // Immer-style updater function
        const updater = updaterOrPartial as (draft: TState) => void;
        nextState = produce(currentState, updater);
      } else {
        nextState = produce(currentState, (draft) => {
          Object.assign(draft, updaterOrPartial);
        });
      }

      // Immer returns same reference if no changes
      if (nextState === currentState) return;

      const prevState = currentState;
      const changedProps: Array<{
        key: keyof TState;
        oldValue: unknown;
        newValue: unknown;
      }> = [];

      // Fast path: no custom equality configured
      if (!hasCustomEquality) {
        for (const key of Object.keys(nextState) as Array<keyof TState>) {
          if (prevState[key] !== nextState[key]) {
            changedProps.push({
              key,
              oldValue: prevState[key],
              newValue: nextState[key],
            });
          }
        }
        if (changedProps.length > 0) {
          currentState = nextState;
          for (const { key, oldValue, newValue } of changedProps) {
            handlePropertyChange(key as string, oldValue, newValue);
          }
        }
        return;
      }

      // Slow path: custom equality configured
      // Build stable state: preserve references for "equal" props
      const stableState = { ...nextState };

      for (const key of Object.keys(nextState) as Array<keyof TState>) {
        if (prevState[key] !== nextState[key]) {
          const equality = getEquality(key as string);
          if (equality(prevState[key], nextState[key])) {
            // Equal by custom equality - preserve original reference for stability
            stableState[key] = prevState[key];
          } else {
            // Actually changed
            changedProps.push({
              key,
              oldValue: prevState[key],
              newValue: nextState[key],
            });
          }
        }
      }

      // Only update if there are actual changes after equality checks
      if (changedProps.length > 0) {
        currentState = stableState;
        // Trigger listeners for changed properties
        for (const { key, oldValue, newValue } of changedProps) {
          handlePropertyChange(key as string, oldValue, newValue);
        }
      }
    },

    dirty(prop?: keyof TState): boolean {
      return instance.dirty(prop as any);
    },

    reset() {
      instance.reset();
    },

    use<TResult, TArgs extends unknown[]>(
      mixin: (context: StoreContext<TState>, ...args: TArgs) => TResult,
      ...args: TArgs
    ): TResult {
      if (!isSetupPhase) {
        throw new Error(
          `use() can only be called during setup phase. ` +
            `Do not call use() inside actions or async callbacks.`
        );
      }
      return mixin(setupContext, ...args);
    },
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
    disposeEffectsEmitter.emitAndClear();
    throw error;
  } finally {
    // End setup phase - effect() calls after this will throw
    isSetupPhase = false;
  }

  // Now run all scheduled effects and collect their dispose functions
  for (const runEffect of scheduledEffects) {
    const dispose = runEffect();
    disposeEffectsEmitter.on(dispose);
  }

  // Capture initial state - dirty tracking starts now
  // After this, any write creates a new currentState object
  initialState = currentState;

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

  return instance;
}
