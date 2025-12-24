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
  type PickEquality,
  type FocusGetter,
} from "../types";

import { resolveEquality } from "./equality";
import { pick } from "./pick";
import { dev } from "../dev";

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
// Focus Cache
// =============================================================================

/** Cache key for focus objects - just use path, same path = same focus */
function getCacheKey(segments: string[]): string {
  return segments.join(".");
}

/** Track options for dev-mode warning */
type CachedFocusInfo = {
  focus: Focus<any>;
  options?: FocusOptions<any>;
};

/** Check if two FocusOptions are equivalent */
function optionsMatch(
  a: FocusOptions<any> | undefined,
  b: FocusOptions<any> | undefined
): boolean {
  // Both undefined = match
  if (!a && !b) return true;
  // One undefined = no match
  if (!a || !b) return false;
  // Compare equality option
  if (a.equality !== b.equality) return false;
  // Compare fallback (reference equality - if different functions, assume different)
  if (a.fallback !== b.fallback) return false;
  return true;
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
 * @param cache - Cache map for reusing focus objects by path
 * @param options - Focus options (fallback, equality)
 */
export function createFocus<TValue>(
  storeContext: StoreContext<any>,
  resolver: Resolver,
  context: FocusContext,
  segments: string[],
  cache: Map<string, CachedFocusInfo>,
  options?: FocusOptions<TValue>
): Focus<TValue> {
  // Check cache first - same path = same focus object
  const cacheKey = getCacheKey(segments);
  const cached = cache.get(cacheKey);
  if (cached) {
    // Dev warning if options differ from cached
    if (!optionsMatch(cached.options, options)) {
      dev.warn(
        `focus("${cacheKey}") called with different options. ` +
          `The first options are used. If you need different behavior, use a different path.`
      );
    }
    return cached.focus as Focus<TValue>;
  }

  const { fallback, equality: equalityOption } = options ?? {};
  const equalityFn = resolveEquality(equalityOption as Equality | undefined);

  // Capture initial value at focus creation time
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

  // Add pick method to getter
  const getterWithPick = getter as FocusGetter<TValue>;
  getterWithPick.pick = (equality?: PickEquality<TValue>) => {
    return pick(getter, equality);
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
      cache,
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

  /**
   * Create a pick selector from this focus.
   */
  const focusPick = (equality?: PickEquality<TValue>): TValue => {
    return pick(getter, equality);
  };

  // Create tuple with methods
  const focus = [getterWithPick, setter] as Focus<TValue>;
  Object.assign(focus, {
    [STORION_TYPE]: "focus",
    on,
    to,
    dirty,
    reset,
    pick: focusPick,
    context,
    _storeContext: storeContext,
    _resolver: resolver,
    segments,
  });

  // Cache the focus object with its options
  cache.set(cacheKey, { focus, options });

  return focus;
}
