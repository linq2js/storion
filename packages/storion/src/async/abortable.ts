/**
 * Abortable function utilities.
 *
 * Creates functions that can receive an AbortSignal when called via ctx.safe().
 */

// Symbol for type discrimination
const abortableSymbol = Symbol.for("storion.abortable");

/**
 * An abortable function that can be called with or without an AbortSignal.
 *
 * - Direct call: `fn(...args)` - signal is undefined
 * - With signal: `fn.withSignal(signal, ...args)` - explicit signal
 * - Via context: `ctx.safe(fn, ...args)` - uses context's signal
 */
export interface AbortableFn<TArgs extends any[], TResult> {
  /** Call without signal */
  (...args: TArgs): TResult;

  /** Call with explicit signal */
  withSignal(signal: AbortSignal | undefined, ...args: TArgs): TResult;

  /** Type brand for discrimination */
  readonly [abortableSymbol]: true;
}

/**
 * Check if a value is an AbortableFn.
 */
export function isAbortable<TArgs extends any[], TResult>(
  fn: unknown
): fn is AbortableFn<TArgs, TResult> {
  return (
    typeof fn === "function" &&
    abortableSymbol in fn &&
    (fn as any)[abortableSymbol] === true
  );
}

/**
 * Create an abortable function.
 *
 * The created function can be called three ways:
 * 1. `fn(...args)` - signal is undefined
 * 2. `fn.withSignal(signal, ...args)` - explicit signal
 * 3. `ctx.safe(fn, ...args)` - uses context's signal
 *
 * @example
 * ```ts
 * const getUser = abortable(async (signal, id: string) => {
 *   const res = await fetch(`/api/users/${id}`, { signal });
 *   return res.json();
 * });
 *
 * // Direct call (no cancellation)
 * const user = await getUser(id);
 *
 * // With explicit signal
 * const user = await getUser.withSignal(controller.signal, id);
 *
 * // In async handler (uses ctx.signal)
 * const userQuery = async(focus("user"), (ctx, id) =>
 *   ctx.safe(getUser, id)
 * );
 * ```
 */
export function abortable<TArgs extends any[], TResult>(
  fn: (signal: AbortSignal | undefined, ...args: TArgs) => TResult
): AbortableFn<TArgs, TResult> {
  // Create the wrapper function
  const wrapper = (...args: TArgs): TResult => {
    return fn(undefined, ...args);
  };

  // Add withSignal method
  wrapper.withSignal = (
    signal: AbortSignal | undefined,
    ...args: TArgs
  ): TResult => {
    return fn(signal, ...args);
  };

  // Add type brand
  Object.defineProperty(wrapper, abortableSymbol, {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  return wrapper as AbortableFn<TArgs, TResult>;
}

