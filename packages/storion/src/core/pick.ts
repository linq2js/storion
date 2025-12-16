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
export function pick<T>(selector: () => T, equality?: PickEquality<T>): T {
  const parentHooks = getHooks();

  // Must be inside an onRead context (effect or useStore)
  if (!parentHooks.onRead) {
    throw new Error(
      "pick() must be called inside an effect or useStore selector. " +
        "It requires an active hooks.onRead context."
    );
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
