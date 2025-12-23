/**
 * Abortable function utilities.
 *
 * Creates functions that can receive an AbortSignal when called via ctx.safe().
 */

import { createSafe, type SafeFn } from "./safe";

// Symbol for type discrimination
const abortableSymbol = Symbol.for("storion.abortable");

/**
 * Context passed to abortable function handlers.
 */
export interface AbortableContext {
  /** AbortSignal for cancellation */
  signal: AbortSignal;
  /** Safe execution utility */
  safe: SafeFn;
}

/**
 * Wrapper type for use() method.
 * Takes the inner function and returns a new handler.
 */
export type AbortableWrapper<
  TArgs extends any[],
  TResult,
  TNewArgs extends any[] = TArgs,
  TNewResult = TResult
> = (
  next: (ctx: AbortableContext, ...args: TArgs) => Promise<TResult>
) => (ctx: AbortableContext, ...args: TNewArgs) => Promise<TNewResult>;

/**
 * Identity wrapper that preserves input types.
 * Use this for wrappers that don't change the function signature.
 */
export type IdentityWrapper = <TArgs extends any[], TResult>(
  next: (ctx: AbortableContext, ...args: TArgs) => Promise<TResult>
) => (ctx: AbortableContext, ...args: TArgs) => Promise<TResult>;

export type AbortableFn<TArgs extends any[], TResult> = (
  ctx: AbortableContext,
  ...args: TArgs
) => Promise<TResult>;

/**
 * An abortable function that can be called with or without an AbortSignal.
 *
 * - Direct call: `fn(...args)` - creates new AbortController
 * - With signal: `fn.with(signal, ...args)` - explicit signal
 * - Via context: `ctx.safe(fn, ...args)` - uses context's signal
 * - Chainable: `fn.use(wrapper)` - returns new Abortable with wrapper applied
 */
export interface Abortable<TArgs extends any[], TResult> {
  /** Call without signal (creates new AbortController) */
  (...args: TArgs): Promise<TResult>;

  /** Call with explicit signal */
  with(signal: AbortSignal | undefined, ...args: TArgs): Promise<TResult>;

  /**
   * Apply a wrapper and return a new Abortable.
   *
   * @example
   * ```ts
   * const fetchUserWithRetry = fetchUser.use(
   *   (next) => async (ctx, id: string) => {
   *     try {
   *       return await next(ctx, id);
   *     } catch (e) {
   *       // Retry once
   *       return next(ctx, id);
   *     }
   *   }
   * );
   * ```
   */
  use<TNewArgs extends any[] = TArgs, TNewResult = TResult>(
    wrapper: (
      next: NoInfer<AbortableFn<TArgs, TResult>>
    ) => AbortableFn<TNewArgs, TNewResult>
  ): Abortable<TNewArgs, TNewResult>;

  as<TNewResult, TNewArgs extends any[] = TArgs>(): Abortable<
    TNewArgs,
    TNewResult
  >;

  /** Type brand for discrimination */
  readonly [abortableSymbol]: true;
}

/**
 * Check if a value is an Abortable.
 */
export function isAbortable<TArgs extends any[], TResult>(
  fn: unknown
): fn is Abortable<TArgs, TResult> {
  return (
    typeof fn === "function" &&
    abortableSymbol in fn &&
    (fn as any)[abortableSymbol] === true
  );
}

/**
 * Create an AbortableContext from an AbortSignal.
 */
function createAbortableContext(signal: AbortSignal): AbortableContext {
  return {
    signal,
    safe: createSafe(
      () => signal,
      () => signal.aborted
    ),
  };
}

/**
 * Create an abortable function.
 *
 * The created function can be called three ways:
 * 1. `fn(...args)` - creates new AbortController
 * 2. `fn.with(signal, ...args)` - explicit signal
 * 3. `ctx.safe(fn, ...args)` - uses context's signal
 *
 * Additionally, wrappers can be applied with `.use()`:
 * ```ts
 * const enhanced = fn.use(retryWrapper).use(loggingWrapper);
 * ```
 *
 * @example
 * ```ts
 * const getUser = abortable(async ({ signal, safe }, id: string) => {
 *   const res = await fetch(`/api/users/${id}`, { signal });
 *   return res.json();
 * });
 *
 * // Direct call (creates new AbortController)
 * const user = await getUser(id);
 *
 * // With explicit signal
 * const user = await getUser.with(controller.signal, id);
 *
 * // In async handler (uses ctx.signal via ctx.safe)
 * const userQuery = async.action(focus("user"), async (ctx, id) => {
 *   return ctx.safe(getUser, id);
 * });
 *
 * // With wrapper
 * const getUserWithRetry = getUser.use(withRetry(3));
 * ```
 */
export function abortable<const TArgs extends any[], TResult>(
  fn: AbortableFn<TArgs, TResult>
): Abortable<TArgs, TResult> {
  // Execute function with given signal
  const execute = (signal: AbortSignal, args: TArgs): Promise<TResult> => {
    const ctx = createAbortableContext(signal);
    return fn(ctx, ...args);
  };

  // Create the wrapper function - creates new AbortController when called directly
  const wrapper = ((...args: TArgs): Promise<TResult> => {
    const controller = new AbortController();
    return execute(controller.signal, args);
  }) as Abortable<TArgs, TResult>;

  // Add with() method for explicit signal
  wrapper.with = (
    signal: AbortSignal | undefined,
    ...args: TArgs
  ): Promise<TResult> => {
    const effectiveSignal = signal ?? new AbortController().signal;
    return execute(effectiveSignal, args);
  };

  // Add use() method for chainable wrappers
  wrapper.use = <TNewArgs extends any[] = TArgs, TNewResult = TResult>(
    wrapperFn: AbortableWrapper<TArgs, TResult, TNewArgs, TNewResult>
  ): Abortable<TNewArgs, TNewResult> => {
    // Create a new abortable with the wrapper applied
    return abortable<TNewArgs, TNewResult>((ctx, ...newArgs) => {
      // wrapperFn takes our original fn and returns a new handler
      const wrappedHandler = wrapperFn(fn);
      return wrappedHandler(ctx, ...newArgs);
    });
  };

  // Add type brand
  Object.defineProperty(wrapper, abortableSymbol, {
    value: true,
    writable: false,
    enumerable: false,
    configurable: false,
  });

  return wrapper;
}
