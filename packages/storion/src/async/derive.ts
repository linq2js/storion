/**
 * Derived async state.
 * Compute async state from other async states.
 */

import type { Focus } from "../types";
import type { AsyncState, AsyncMode } from "./types";
import { AsyncFunctionError } from "../errors";
import { effect } from "../core/effect";
import { untrack } from "../core/tracking";
import { asyncState } from "./state";

// =============================================================================
// DERIVE
// =============================================================================

/**
 * Derive an async state from other async states using a synchronous computation.
 * The computation function uses `async.wait()` to extract data from async states,
 * which throws promises when states are pending.
 *
 * Key behaviors:
 * - If `computeFn` throws a promise (via `async.wait`), sets focus to pending and re-runs after promise settles
 * - If `computeFn` throws an error, sets focus to error state
 * - If `computeFn` returns a value, sets focus to success state
 * - If `computeFn` returns a promise (not throws), throws an error - must be synchronous
 * - Uses a single wrapper promise to avoid cascading re-renders
 *
 * @param focus - Focus to update with derived async state
 * @param computeFn - Synchronous computation function that uses `async.wait()` to read async states
 * @returns Dispose function to stop the derivation
 *
 * @example
 * // Basic usage - derive from multiple async states
 * async.derive(focus('c'), () => {
 *   const a = async.wait(state.a);
 *   const b = async.wait(state.b);
 *   return a + b;
 * });
 *
 * @example
 * // Conditional dependencies
 * async.derive(focus('result'), () => {
 *   const type = async.wait(state.type);
 *   if (type === 'user') {
 *     return async.wait(state.userData);
 *   } else {
 *     return async.wait(state.guestData);
 *   }
 * });
 *
 * @example
 * // For parallel waiting, use async.all
 * async.derive(focus('combined'), () => {
 *   const [a, b, c] = async.all([state.a, state.b, state.c]);
 *   return { a, b, c };
 * });
 *
 * @example
 * // With stale mode - preserves data during loading/error
 * async.derive(focus('result'), () => {
 *   return async.wait(state.userData);
 * });
 */
export function derive<T, M extends AsyncMode = "fresh">(
  focus: Focus<AsyncState<T, M>>,
  computeFn: () => T
): VoidFunction {
  const [getState, setState] = focus;

  // Track if we've created a wrapper promise for this derivation cycle
  let hasSetPending = false;

  return effect((ctx) => {
    // Read current state WITHOUT tracking to get mode and stale data
    // This prevents the derived state from depending on itself
    const currentState = untrack(getState);

    try {
      const result = computeFn();

      // computeFn must be synchronous - returning a promise is an error
      if (
        result !== null &&
        result !== undefined &&
        typeof (result as any).then === "function"
      ) {
        throw new AsyncFunctionError(
          "async.derive computeFn",
          "Use async.wait() for async values, not async/await or returning promises."
        );
      }

      // Success - reset pending flag and set success state
      hasSetPending = false;
      setState(asyncState.from(currentState, "success", result));
    } catch (ex) {
      // Check if it's a thrown promise (from async.wait on pending state)
      if (
        ex !== null &&
        ex !== undefined &&
        typeof (ex as any).then === "function"
      ) {
        // Only set pending state once per derivation cycle
        if (!hasSetPending) {
          hasSetPending = true;
          setState(asyncState.from(currentState, "pending"));
        }

        // When promise settles, refresh the effect to re-run computation
        ctx.safe(ex as Promise<unknown>).then(ctx.refresh, ctx.refresh);
      } else {
        // Real error - reset pending flag and set error state
        hasSetPending = false;
        const error = ex instanceof Error ? ex : new Error(String(ex));
        setState(asyncState.from(currentState, "error", error));
      }
    }
  });
}
