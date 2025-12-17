/**
 * Store implementation.
 *
 * Creates store specs and instances with the setup() pattern.
 */

import {
  STORION_TYPE,
  type StateBase,
  type ActionsBase,
  type StoreSpec,
  type StoreOptions,
  type StoreInstance,
  type StoreResolver,
  type DispatchEvent,
  type ActionDispatchEvent,
  type ReactiveActions,
  type Equality,
  type AutoDisposeOptions,
} from "../types";

import { produce } from "immer";
import { createStoreContext } from "./storeContext";

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
import { wrapFn } from "./fnWrapper";

import { emitter, Emitter } from "../emitter";
import { collection } from "../collection";

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
    [STORION_TYPE]: "store.spec",
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
  autoDispose?: AutoDisposeOptions;
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
  const gracePeriodMs = instanceOptions.autoDispose?.gracePeriodMs ?? 100;
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
    disposeTimeout && clearTimeout(disposeTimeout);
    refCount--;
    if (refCount <= 0) {
      // Schedule disposal after grace period
      disposeTimeout = setTimeout(() => {
        disposeTimeout = null;
        // Double-check still zero refs (in case of race)
        if (refCount <= 0) {
          instance?.dispose();
        }
      }, gracePeriodMs);
    }
  };

  // ==========================================================================
  // Subscribers (using emitters)
  // ==========================================================================

  const changeEmitter = emitter<void>();
  const disposeEmitter = emitter<void>();

  // Property emitters - created lazily on first subscription
  const propertyEmitters = collection<
    keyof TState,
    Emitter<PropertyChangeEvent>
  >(() => emitter<PropertyChangeEvent>());

  // ==========================================================================
  // Action Dispatch Tracking
  // ==========================================================================

  /** Stores last invocation for each action (immutable objects) */
  const actionInvocations = new Map<
    string,
    ActionDispatchEvent<TActions, keyof TActions>
  >();

  /** Invocation count per action */
  const actionNthCounters = new Map<string, number>();

  /** Action dispatch event type */
  type ActionEmitterEvent = {
    next: ActionDispatchEvent<TActions, keyof TActions>;
    prev: ActionDispatchEvent<TActions, keyof TActions> | undefined;
  };

  /** Emitters for action dispatches - created lazily per action name */
  const actionEmitters = collection<string, Emitter<ActionEmitterEvent>>(() =>
    emitter<ActionEmitterEvent>()
  );

  /** Wildcard emitter for all action dispatches (@) */
  const wildcardActionEmitter = emitter<{
    next: DispatchEvent<TActions>;
    prev: DispatchEvent<TActions> | undefined;
  }>();

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
          propertyEquality.set(key, resolveEquality(eq as Equality));
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

  // Track setup phase - declared early so handlePropertyChange can access it
  let isSetupPhase = true;

  function handlePropertyChange(
    key: string,
    oldValue: unknown,
    newValue: unknown
  ): void {
    // Don't emit change events during setup phase
    if (isSetupPhase) {
      return;
    }

    // Notify property subscribers (using emitter)
    // Effects subscribe via this mechanism through the hooks system
    propertyEmitters.with(key as keyof TState, (em) =>
      em.emit({ newValue, oldValue })
    );

    // Schedule global subscriber notification
    scheduleNotification(() => {
      changeEmitter.emit();
    });
  }

  // ==========================================================================
  // Forward declarations for closures
  // ==========================================================================

  // Declare instance variable early so closures can capture it.
  // Assigned later in "Instance" section.
  let instance: StoreInstance<TState, TActions> | null = null;

  // Helper for closures - instance is always assigned before this is called
  const getInst = () => instance as StoreInstance<TState, TActions>;

  // ==========================================================================
  // Action Dispatch Handler
  // ==========================================================================

  /**
   * Get last invocation for an action (reactive - triggers trackRead).
   */
  function getActionLastInvocation<K extends keyof TActions>(
    actionName: K
  ): ActionDispatchEvent<TActions, K> | undefined {
    const propKey = `@${String(actionName)}`;
    const invocation = actionInvocations.get(String(actionName));

    // Trigger reactive tracking if inside effect
    if (hasReadHook()) {
      // Create subscribe function that captures instance via closure
      // instance is guaranteed to be assigned before this is called
      const subscribeFn = (listener: VoidFunction) =>
        getInst()._subscribeInternal(propKey, listener);
      trackRead(storeId, propKey, invocation, subscribeFn);
    }

    return invocation as ActionDispatchEvent<TActions, K> | undefined;
  }

  // ==========================================================================
  // Instance (created early so effects can subscribe)
  // ==========================================================================

  // We need to create the instance structure early so that effects can
  // subscribe via resolver.get(storeId). We'll fill in actions later.
  let instanceActions: ReactiveActions<TActions> =
    {} as ReactiveActions<TActions>;

  // Assign instance object (instance declared earlier in forward declarations)
  instance = {
    [STORION_TYPE]: "store" as const,
    id: storeId,
    spec,
    deps: [],
    get state() {
      return readonlyState as Readonly<TState>;
    },

    get actions() {
      return instanceActions;
    },

    onDispose: disposeEmitter.on,

    subscribe(
      listenerOrPropKey: (() => void) | keyof TState | string,
      propListener?: (event: { next: any; prev: any }) => void
    ): VoidFunction {
      incrementRef();

      // Overload 1: subscribe(listener) - all state changes
      if (typeof listenerOrPropKey === "function") {
        const unsub = changeEmitter.on(listenerOrPropKey);
        return () => {
          unsub();
          decrementRef();
        };
      }

      const key = listenerOrPropKey as string;

      // Overload 3: subscribe('@*', listener) - all action dispatches
      if (key === "@*") {
        const unsub = wildcardActionEmitter.on(propListener!);
        return () => {
          unsub();
          decrementRef();
        };
      }

      // Overload 4: subscribe('@actionName', listener) - specific action dispatch
      if (key.startsWith("@")) {
        const actionName = key.slice(1);
        const unsub = actionEmitters.get(actionName).on(propListener!);
        return () => {
          unsub();
          decrementRef();
        };
      }

      // Overload 2: subscribe(propKey, listener) - specific property
      const propKey = listenerOrPropKey as keyof TState;
      const propEmitter = propertyEmitters.get(propKey);
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
      propKey: keyof TState | string,
      listener: () => void
    ): VoidFunction {
      const key = propKey as string;

      // Action subscription (@actionName)
      if (key.startsWith("@")) {
        const actionName = key.slice(1);
        return actionEmitters.get(actionName).on(listener);
      }

      // Property subscription
      return propertyEmitters.get(propKey as keyof TState).on(listener);
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

      // Clear state subscribers
      changeEmitter.clear();
      for (const em of propertyEmitters.values()) {
        em.clear();
      }
      propertyEmitters.clear();

      // Clear action subscribers
      wildcardActionEmitter.clear();
      for (const em of actionEmitters.values()) {
        em.clear();
      }
      actionEmitters.clear();
      actionInvocations.clear();
      actionNthCounters.clear();

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

  // ==========================================================================
  // State Objects with defineProperty (faster reads than Proxy)
  // ==========================================================================

  // Create reactive state object using Object.defineProperty
  // Since we know all props upfront, this is faster than Proxy for reads
  function createReactiveState(writable: boolean): TState {
    const obj = {} as TState;

    for (const prop of Object.keys(currentState) as Array<keyof TState>) {
      // Create subscribe function for this property (closure captures prop)
      // Note: instance is guaranteed to be defined when this getter is called
      const subscribeFn = (listener: VoidFunction) =>
        getInst()._subscribeInternal(prop as string, listener);

      Object.defineProperty(obj, prop, {
        enumerable: true,
        configurable: false,
        get() {
          const value = currentState[prop];
          // Only call trackRead if there's an active hook (perf optimization)
          if (hasReadHook()) {
            trackRead(storeId, prop as string, value, subscribeFn);
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

  const deps = new Set<StoreInstance<any, any>>();

  /**
   * Update state using immer-style updater.
   * Handles equality checks and property change notifications.
   */
  function updateState(
    updaterOrPartial: ((draft: TState) => void) | Partial<TState>
  ): void {
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
  }

  // Create setup context using the factory
  const setupContext = createStoreContext<TState, TActions>({
    spec,
    resolver,
    getMutableState: () => mutableState,
    update: updateState,
    subscribe: (listener) => changeEmitter.on(listener),
    dirty: (prop) => instance!.dirty(prop as any),
    reset: () => instance!.reset(),
    getInstance: () => instance,
    onDependency: (depInstance) => deps.add(depInstance),
    isSetupPhase: () => isSetupPhase,
  });

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

  Object.assign(instance, { deps: Array.from(deps) });
  deps.clear();

  // ==========================================================================
  // Wrap Actions with dispatch tracking and .last() method
  // ==========================================================================

  const wrappedActions = {} as ReactiveActions<TActions>;

  for (const [name, action] of Object.entries(actions)) {
    // Actions must be functions
    if (typeof action !== "function") {
      throw new Error(
        `Action "${name}" must be a function, got ${typeof action}. ` +
          `If using focus(), destructure it and return the getter/setter separately: ` +
          `const [get, set] = focus("path"); return { get, set };`
      );
    }

    // Create the wrapped action function with original marked
    const wrappedAction = wrapFn(action, (originalAction) => {
      const wrapper = (...args: any[]) => {
        if (disposed) {
          throw new Error(`Cannot call action on disposed store: ${storeId}`);
        }

        // Record dispatch info BEFORE action execution (for error cases)
        // but DON'T emit to wildcard subscribers yet
        const actionNameKey = name as keyof TActions;
        const nthKey = name;
        const nth = (actionNthCounters.get(nthKey) ?? 0) + 1;
        actionNthCounters.set(nthKey, nth);

        const prev = actionInvocations.get(nthKey);
        const next: ActionDispatchEvent<TActions, typeof actionNameKey> =
          Object.freeze({
            name: actionNameKey,
            args: args as Parameters<TActions[typeof actionNameKey]>,
            nth,
            timestamp: Date.now(),
          });
        actionInvocations.set(nthKey, next);

        // Notify specific action emitter (@actionName) - before execution
        const actionEmitter = actionEmitters.get(nthKey);
        if (actionEmitter.size > 0) {
          actionEmitter.emit({
            next: next as DispatchEvent<TActions>,
            prev: prev as DispatchEvent<TActions> | undefined,
          });
        }

        // Also call options.onDispatch if provided
        if (options.onDispatch) {
          options.onDispatch(next as DispatchEvent<TActions>);
        }

        try {
          const result = originalAction(...args);

          // Emit to wildcard subscribers AFTER action completes successfully
          // This ensures state is captured after all mutations
          if (wildcardActionEmitter.size > 0) {
            wildcardActionEmitter.emit({
              next: next as DispatchEvent<TActions>,
              prev: prev as DispatchEvent<TActions> | undefined,
            });
          }

          return result;
        } catch (error) {
          // Still emit to wildcard on error (so devtools can see failed actions)
          if (wildcardActionEmitter.size > 0) {
            wildcardActionEmitter.emit({
              next: next as DispatchEvent<TActions>,
              prev: prev as DispatchEvent<TActions> | undefined,
            });
          }
          if (options.onError) {
            options.onError(error);
          }
          throw error;
        }
      };

      // Add .last() method for reactive dispatch tracking
      (wrapper as any).last = () =>
        getActionLastInvocation(name as keyof TActions);

      return wrapper;
    });

    (wrappedActions as any)[name] = wrappedAction;
  }

  // Assign wrapped actions to instance
  instanceActions = wrappedActions;

  return instance;
}
