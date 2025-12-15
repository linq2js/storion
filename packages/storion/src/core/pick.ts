/**
 * pick() - Fine-grained value tracking
 *
 * Wraps a selector to track the computed value instead of individual properties.
 * Only triggers re-render when the computed value actually changes.
 */

import { emitter } from "../emitter";
import { Equality } from "../types";
import { resolveEquality } from "./equality";
import { getHooks, withHooks, type ReadEvent } from "./tracking";

/** Equality function type */
export type PickEquality<T> = Equality<T>;

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
 * useStore(({ resolve }) => {
 *   const [state] = resolve(userStore);
 *   return { name: state.profile.name }; // tracks "profile"
 * });
 *
 * // With pick: re-renders only when profile.name changes
 * useStore(({ resolve }) => {
 *   const [state] = resolve(userStore);
 *   return { name: pick(() => state.profile.name) };
 * });
 *
 * // With custom equality
 * useStore(({ resolve }) => {
 *   const [state] = resolve(userStore);
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

  const evaluate = () => {
    const reads: ReadEvent[] = [];
    // Run selector with our own onRead to capture dependencies
    // Don't propagate to parent - we handle subscriptions ourselves
    const value = withHooks(
      {
        onRead: (event) => {
          reads.push(event);
        },
      },
      selector
    );

    return [reads, value] as const;
  };

  // Collect reads from the selector
  const [collectedReads, value] = evaluate();

  // If no reads were collected, just return the value
  // (selector doesn't depend on any reactive state)
  if (!collectedReads.length) {
    return value;
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
    let cachedValue = value;
    let currentReads = collectedReads.slice(); // Copy to avoid mutation issues
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
      // Re-track dependencies (they can change with conditional logic)
      const [newReads, newValue] = evaluate();

      // Check equality
      const isEqual = equalityFn(cachedValue, newValue);

      // Check if dependencies changed
      const depsChanged =
        newReads.length !== currentReads.length ||
        newReads.some((r, i) => r.key !== currentReads[i]?.key);

      if (depsChanged) {
        // Re-subscribe to new dependencies
        clearSubscriptions();
        currentReads = newReads;
        setupSubscriptions();
      }

      if (!isEqual) {
        cachedValue = newValue;
        listener(); // Notify parent
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
    value,
    subscribe,
  });

  return value;
}
