/**
 * Component-local async mixin.
 * Creates async state isolated per component with auto-disposal.
 */

import type {
  Focus,
  MetaEntry,
  SelectorContext,
  SelectorMixin,
} from "../types";
import type {
  AsyncState,
  AsyncMode,
  AsyncContext,
  AsyncHandler,
  AsyncOptions,
  AsyncActions,
} from "./types";
import { store } from "../core/store";
import { isAbortable, type Abortable } from "./abortable";
import { asyncWithFocus } from "./action";
import { asyncState } from "./state";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Options for creating an async selector mixin.
 */
export interface AsyncMixinOptions<T, M extends AsyncMode = "fresh">
  extends AsyncOptions {
  /**
   * Initial async state. Defaults to `async.fresh<T>()`.
   */
  initial?: AsyncState<T, M>;
  /**
   * Name of store for the async state. Defaults to `async:${handler.name || "anonymous"}`.
   */
  name?: string;
  /**
   * Metadata for the async state. Defaults to empty array.
   */
  meta?: MetaEntry<"result"> | MetaEntry<"result">[];
}

/**
 * Result tuple from async selector mixin: [state, actions]
 */
export type AsyncMixinResult<T, M extends AsyncMode, TArgs extends any[]> = [
  AsyncState<T, M>,
  AsyncActions<T, M, TArgs>
];

// =============================================================================
// HELPER: WRAP ABORTABLE
// =============================================================================

/**
 * Convert an Abortable to an AsyncHandler.
 * @internal
 */
function wrapAbortable<T, TArgs extends any[]>(
  fn: Abortable<TArgs, T>
): AsyncHandler<T, TArgs> {
  return (ctx: AsyncContext, ...args: TArgs): T | PromiseLike<T> => {
    return fn.withSignal(ctx.signal, ...args) as T | PromiseLike<T>;
  };
}

// =============================================================================
// ASYNC MIXIN
// =============================================================================

/**
 * Create an async selector mixin for component-local async state.
 * Uses `scoped()` internally, so state is isolated per component and auto-disposed.
 *
 * @example
 * const submitMutation = async.mixin(async (ctx, data: FormData) => {
 *   const res = await fetch('/api/submit', {
 *     method: 'POST',
 *     body: JSON.stringify(data),
 *     signal: ctx.signal,
 *   });
 *   return res.json();
 * });
 *
 * function ContactForm() {
 *   const [state, { dispatch }] = useStore(({ mixin }) => mixin(submitMutation));
 *   return <button onClick={() => dispatch(formData)}>Submit</button>;
 * }
 */
export function mixin<T, TArgs extends any[]>(
  handler: AsyncHandler<T, TArgs>,
  options?: AsyncMixinOptions<T, "fresh">
): SelectorMixin<AsyncMixinResult<T, "fresh", TArgs>>;

/**
 * Create an async selector mixin with stale mode.
 */
export function mixin<T, TArgs extends any[]>(
  handler: AsyncHandler<T, TArgs>,
  options: AsyncMixinOptions<T, "stale"> & { initial: AsyncState<T, "stale"> }
): SelectorMixin<AsyncMixinResult<T, "stale", TArgs>>;

/**
 * Create an async selector mixin with an Abortable (signal auto-injected).
 */
export function mixin<T, TArgs extends any[]>(
  abortableFn: Abortable<TArgs, T>,
  options?: AsyncMixinOptions<T, "fresh">
): SelectorMixin<AsyncMixinResult<T, "fresh", TArgs>>;

/**
 * Create an async selector mixin with an Abortable and stale mode.
 */
export function mixin<T, TArgs extends any[]>(
  abortableFn: Abortable<TArgs, T>,
  options: AsyncMixinOptions<T, "stale"> & { initial: AsyncState<T, "stale"> }
): SelectorMixin<AsyncMixinResult<T, "stale", TArgs>>;

// Implementation
export function mixin<T, M extends AsyncMode, TArgs extends any[]>(
  handlerOrAbortable: AsyncHandler<T, TArgs> | Abortable<TArgs, T>,
  options?: AsyncMixinOptions<T, M>
): SelectorMixin<AsyncMixinResult<T, M, TArgs>> {
  const handler = isAbortable(handlerOrAbortable)
    ? wrapAbortable(handlerOrAbortable as Abortable<TArgs, T>)
    : (handlerOrAbortable as AsyncHandler<T, TArgs>);

  // Determine initial state
  const initialState =
    options?.initial ?? (asyncState("fresh", "idle") as AsyncState<T, M>);

  // Create a store spec for the async state
  const asyncSpec = store({
    name: options?.name ?? `async:${handler.name || "anonymous"}`,
    state: { result: initialState },
    meta: options?.meta,
    setup(storeContext) {
      const { focus } = storeContext;
      const actions = asyncWithFocus(
        focus("result") as Focus<AsyncState<T, M>>,
        (asyncContext: AsyncContext, ...args: TArgs) => {
          return handler(asyncContext, ...args);
        },
        options
      ) as any;
      return actions;
    },
  });

  // Return a selector mixin that uses scoped()
  return ((context: SelectorContext) => {
    const [state, actions] = context.scoped(asyncSpec);
    return [state.result, actions] as AsyncMixinResult<T, M, TArgs>;
  }) as SelectorMixin<AsyncMixinResult<T, M, TArgs>>;
}
