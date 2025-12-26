/**
 * pick() - Fine-grained value tracking
 *
 * Wraps a selector to track the computed value instead of individual properties.
 * Only triggers re-render when the computed value actually changes.
 */

import { emitter } from "../emitter";
import type { PickEquality } from "../types";
import { resolveEquality } from "./equality";
import { getHooks, withHooks, type ReadEvent } from "./tracking";
import { HooksContextError } from "../errors";

// =============================================================================
// TYPES
// =============================================================================

/** Method map for pick.wrap - maps names to selector functions */
type MethodMap = Record<string, (...args: any[]) => any>;

/** Capitalize first letter of a string */
type Capitalize<S extends string> = S extends `${infer F}${infer R}`
  ? `${Uppercase<F>}${R}`
  : S;

/** Add prefix to method names and capitalize */
type PrefixedMethods<TPrefix extends string, TMethods extends MethodMap> = {
  [K in keyof TMethods as `${TPrefix}${Capitalize<K & string>}`]: TMethods[K];
};

/** Pick function interface with wrap method */
export interface PickFn {
  /** Pick a computed value with fine-grained change detection */
  <T>(selector: () => T, equality?: PickEquality<T>): T;

  /**
   * Wrap a single function so it returns pick-wrapped results.
   *
   * @example
   * ```ts
   * const getFullName = pick.wrap(
   *   () => `${state.firstName} ${state.lastName}`,
   *   "strict"
   * );
   * // In selector:
   * return { fullName: getFullName() };
   * ```
   */
  wrap<TArgs extends any[], TResult>(
    fn: (...args: TArgs) => TResult,
    equality?: PickEquality<TResult>
  ): (...args: TArgs) => TResult;

  /**
   * Wrap multiple methods with a prefix.
   *
   * @example
   * ```ts
   * const methods = pick.wrap("pick", {
   *   count: () => state.count,
   *   name: () => state.name,
   * });
   * // Returns: { pickCount: () => state.count, pickName: () => state.name }
   * ```
   */
  wrap<TPrefix extends string, TMethods extends MethodMap>(
    prefix: TPrefix,
    methods: TMethods,
    equality?: PickEquality<any>
  ): PrefixedMethods<TPrefix, TMethods>;

  /**
   * Wrap multiple methods without a prefix.
   *
   * @example
   * ```ts
   * const methods = pick.wrap({
   *   count: () => state.count,
   *   name: () => state.name,
   * });
   * // Returns: { count: () => pick(() => state.count), name: () => pick(() => state.name) }
   * ```
   */
  wrap<TMethods extends MethodMap>(
    methods: TMethods,
    equality?: PickEquality<any>
  ): TMethods;
}

/** Auto-increment counter for unique pick keys */
let pickIdCounter = 0;

/**
 * Pick a computed value with fine-grained change detection.
 *
 * Unlike direct property access which tracks the property itself,
 * `pick` tracks the computed result. Changes only propagate when
 * the result actually changes.
 *
 * @example
 * ```ts
 * // Without pick: re-renders when ANY profile property changes
 * useStore(({ get }) => {
 *   const [state] = get(userStore);
 *   return { name: state.profile.name }; // tracks "profile"
 * });
 *
 * // With pick: re-renders only when profile.name changes
 * useStore(({ get }) => {
 *   const [state] = get(userStore);
 *   return { name: pick(() => state.profile.name) };
 * });
 *
 * // With custom equality
 * useStore(({ get }) => {
 *   const [state] = get(userStore);
 *   return {
 *     profile: pick(
 *       () => ({ name: state.profile.name, age: state.profile.age }),
 *       (a, b) => a.name === b.name && a.age === b.age
 *     )
 *   };
 * });
 * ```
 *
 * @param selector - Function that computes the value
 * @param equality - Optional equality function (default: ===)
 * @returns The computed value
 * @throws Error if called outside of effect/useStore context
 */
function pickImpl<T>(selector: () => T, equality?: PickEquality<T>): T {
  const parentHooks = getHooks();

  // Must be inside an onRead context (effect or useStore)
  if (!parentHooks.onRead) {
    throw new HooksContextError("pick", "an effect or useStore selector");
  }

  const equalityFn = resolveEquality<T>(equality);
  const currentReads: ReadEvent[] = [];

  const evaluate = () => {
    currentReads.length = 0;
    // Run selector with our own onRead to capture dependencies
    // Don't propagate to parent - we handle subscriptions ourselves
    const value = withHooks(
      {
        onRead: (event) => {
          currentReads.push(event);
        },
      },
      selector
    );

    return value;
  };

  // Collect reads from the selector
  let currentValue = evaluate();

  // If no reads were collected, just return the value
  // (selector doesn't depend on any reactive state)
  if (!currentReads.length) {
    return currentValue;
  }

  // Generate a unique key for this pick call
  // Using auto-increment ID because same dependencies can have different values
  // due to external variables (e.g., closures, module-level vars)
  const pickKey = `pick:${++pickIdCounter}`;

  // Create subscribe function that:
  // 1. Subscribes to all collected reads
  // 2. On change, recomputes and compares
  // 3. Re-tracks dependencies (they can change with conditional logic)
  // 4. Only notifies parent if value changed
  const subscribe = (listener: VoidFunction): VoidFunction => {
    const onCleanup = emitter();

    // Subscribe to current reads
    const setupSubscriptions = () => {
      for (const read of currentReads) {
        const unsub = read.subscribe(handleChange);
        onCleanup.on(unsub);
      }
    };

    // Clear all subscriptions
    const clearSubscriptions = () => {
      onCleanup.emitAndClear();
    };

    // Handler for any dependency change
    const handleChange = () => {
      try {
        const prevValue = currentValue;

        // Clear old subscriptions before re-evaluating
        clearSubscriptions();

        // Re-evaluate (may change dependencies with conditional logic)
        currentValue = evaluate();

        // Re-subscribe to current dependencies
        setupSubscriptions();

        // Notify parent if value changed
        if (!equalityFn(prevValue, currentValue)) {
          listener();
        }
      } catch (error) {
        clearSubscriptions();
        listener();
        // Don't throw - let re-render handle the error properly
      }
    };

    // Initial subscription setup
    setupSubscriptions();

    // Return cleanup
    return clearSubscriptions;
  };

  // Notify parent's onRead with our virtual dependency
  parentHooks.onRead?.({
    key: pickKey,
    value: currentValue,
    subscribe,
  });

  return currentValue;
}

// =============================================================================
// pick.wrap IMPLEMENTATION
// =============================================================================

/**
 * Capitalize first letter of a string at runtime.
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Wrap a function so its result is automatically wrapped with pick().
 */
function wrapSingleFn<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => TResult,
  equality?: PickEquality<TResult>
): (...args: TArgs) => TResult {
  return (...args: TArgs): TResult => {
    return pick(() => fn(...args), equality);
  };
}

/**
 * Wrap multiple methods, optionally with a prefix.
 */
function wrapMethods<TMethods extends MethodMap>(
  methods: TMethods,
  prefix: string,
  equality?: PickEquality<any>
): MethodMap {
  const result: MethodMap = {};

  for (const key of Object.keys(methods)) {
    const fn = methods[key];
    const newKey = prefix ? `${prefix}${capitalize(key)}` : key;
    result[newKey] = wrapSingleFn(fn, equality);
  }

  return result;
}

/**
 * pick.wrap - Wrap functions to automatically use pick().
 *
 * Overloads:
 * 1. wrap(fn, equality?) - Wrap a single function
 * 2. wrap(prefix, methods, equality?) - Wrap multiple methods with prefix
 * 3. wrap(methods, equality?) - Wrap multiple methods without prefix
 */
function pickWrap(
  fnOrPrefixOrMethods: ((...args: any[]) => any) | string | MethodMap,
  equalityOrMethods?: PickEquality<any> | MethodMap,
  equalityForPrefixed?: PickEquality<any>
): any {
  // Overload 1: wrap(fn, equality?)
  if (typeof fnOrPrefixOrMethods === "function") {
    return wrapSingleFn(
      fnOrPrefixOrMethods,
      equalityOrMethods as PickEquality<any>
    );
  }

  // Overload 2: wrap(prefix, methods, equality?)
  if (typeof fnOrPrefixOrMethods === "string") {
    const prefix = fnOrPrefixOrMethods;
    const methods = equalityOrMethods as MethodMap;
    return wrapMethods(methods, prefix, equalityForPrefixed);
  }

  // Overload 3: wrap(methods, equality?)
  const methods = fnOrPrefixOrMethods;
  return wrapMethods(methods, "", equalityOrMethods as PickEquality<any>);
}

// Attach wrap to pick
(pickImpl as PickFn).wrap = pickWrap;

/** pick function with wrap method attached */
export const pick: PickFn = pickImpl as PickFn;
