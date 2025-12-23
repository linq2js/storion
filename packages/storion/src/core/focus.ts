/**
 * Focus implementation for lens-like state access.
 *
 * A Focus provides a type-safe way to read and write nested state properties.
 */

import {
  STORION_TYPE,
  type StateBase,
  type StoreContext,
  type Resolver,
  type Focus,
  type FocusOptions,
  type FocusContext,
  type Equality,
} from "../types";

import { resolveEquality } from "./equality";
import { SetupPhaseError } from "../errors";

// =============================================================================
// Helpers
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

// =============================================================================
// Focus Factory
// =============================================================================

/**
 * Create a focus for a nested state path.
 *
 * @param storeContext - The store context
 * @param resolver - The dependency resolver
 * @param context - Focus context with state access
 * @param segments - Path segments to focus on
 * @param isSetupPhase - Check if in setup phase
 * @param options - Focus options (fallback, equality)
 */
export function createFocus<TValue>(
  storeContext: StoreContext<any>,
  resolver: Resolver,
  context: FocusContext,
  segments: string[],
  isSetupPhase: () => boolean,
  options?: FocusOptions<TValue>
): Focus<TValue> {
  if (!isSetupPhase()) {
    throw new SetupPhaseError(
      "createFocus",
      "Focus can only be called during setup phase."
    );
  }

  const { fallback, equality: equalityOption } = options ?? {};
  const equalityFn = resolveEquality(equalityOption as Equality | undefined);

  // Capture initial value at focus creation time (during setup phase)
  const initialValue = getAtPath(context.get(), segments) as TValue;

  /**
   * Get the value at the focused path, applying fallback if nullish.
   */
  const getter = (): TValue => {
    const state = context.get();
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
    context.update((draft: StateBase) => {
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
    return context.subscribe(() => {
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
    return createFocus(
      storeContext,
      resolver,
      context,
      [...segments, ...relativePath.split(".")],
      isSetupPhase,
      childOptions
    );
  };

  /**
   * Check if the focused path is dirty (different from initial value).
   */
  const dirty = (): boolean => {
    const currentValue = getter();
    return !equalityFn(currentValue, initialValue);
  };

  /**
   * Reset the focused path to its initial value.
   */
  const reset = (): void => {
    setter(initialValue);
  };

  // Create tuple with on(), to(), dirty(), and reset() methods
  const focus = [getter, setter] as Focus<TValue>;
  Object.assign(focus, {
    [STORION_TYPE]: "focus",
    on,
    to,
    dirty,
    reset,
    context,
    _storeContext: storeContext,
    _resolver: resolver,
    segments,
  });

  return focus;
}

