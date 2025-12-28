/**
 * Async module - reactive async state management.
 *
 * This module provides:
 * - State creators: `async.fresh()`, `async.stale()`
 * - Store-bound actions: `async.action()`
 * - Component-local mixins: `async.mixin()`
 * - Data extraction: `async.wait()`, `async.hasData()`, `async.isLoading()`, `async.isError()`
 * - Combinators: `async.all()`, `async.any()`, `async.race()`, `async.settled()`
 * - Derivation: `async.derive()`
 * - Promise-like chaining: `async.chain()`
 * - Utilities: `async.delay()`, `async.invoke()`, `async.state()`
 */

// Re-export types
export type { AsyncMixinOptions, AsyncMixinResult } from "./mixin";
export type { AsyncStateExtra } from "./state";

// Re-export asyncState factory (used externally)
export { asyncState, asyncStateFrom } from "./state";

// Re-export getPendingPromise (used for Suspense)
export { getPendingPromise } from "./helpers";

// Re-export toPromise utility
export { toPromise } from "./utils";

// =============================================================================
// IMPORT ALL IMPLEMENTATIONS
// =============================================================================

import { fresh, stale } from "./state";
import { action } from "./action";
import { mixin } from "./mixin";
import { wait, hasData, isLoading, isError } from "./wait";
import { all, any, race, settled } from "./combine";
import { derive } from "./derive";
import { chain } from "./then";
import { delay, invoke, state } from "./utils";

// =============================================================================
// ASYNC NAMESPACE
// =============================================================================

/**
 * Async namespace providing reactive async state management.
 *
 * @example
 * // Create async state in store
 * const userStore = store({
 *   name: 'user',
 *   state: { user: async.fresh<User>() },
 *   setup({ focus }) {
 *     const userQuery = async.action(focus('user'), async (ctx, id: string) => {
 *       const res = await fetch(`/api/users/${id}`, { signal: ctx.signal });
 *       return res.json();
 *     });
 *     return { fetchUser: userQuery.dispatch };
 *   },
 * });
 *
 * @example
 * // Use async mixin in component
 * const submitMutation = async.mixin(async (ctx, data: FormData) => {
 *   const res = await fetch('/api/submit', { method: 'POST', body: data });
 *   return res.json();
 * });
 *
 * function Form() {
 *   const [state, { dispatch }] = useStore(({ mixin }) => mixin(submitMutation));
 *   return <button onClick={() => dispatch(formData)}>Submit</button>;
 * }
 */
export const async = Object.assign(
  // Base object (empty, namespace only)
  {},
  {
    // State creators
    fresh,
    stale,

    // Store-bound async
    action,

    // Component-local async
    mixin,

    // Data extraction and checks
    wait,
    hasData,
    isLoading,
    isError,

    // Combinators
    all,
    any,
    race,
    settled,

    // Derivation
    derive,

    // Promise-like chaining (named `chain` to avoid making async look like a thenable)
    chain,

    // Utilities
    delay,
    invoke,
    state,
  }
);
