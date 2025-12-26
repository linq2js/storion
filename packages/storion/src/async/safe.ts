/**
 * Safe execution utilities.
 *
 * Creates a `safe` function that wraps operations to be aware of cancellation/staleness.
 * Reused by both effect context and async context.
 */

import { isAbortable, type Abortable } from "./abortable";
import { toPromise } from "./async";

// =============================================================================
// UTILITY: isPromiseLike & toPromise
// =============================================================================

/**
 * Check if a value is a PromiseLike (has a .then method).
 *
 * @example
 * isPromiseLike(Promise.resolve(1)) // true
 * isPromiseLike({ then: () => {} }) // true
 * isPromiseLike(42) // false
 */
export function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    "then" in value &&
    typeof (value as any).then === "function"
  );
}

/**
 * AggregateError polyfill for environments without ES2021 support.
 */
class AggregateErrorImpl extends Error {
  errors: unknown[];
  constructor(errors: unknown[], message?: string) {
    super(message);
    this.name = "AggregateError";
    this.errors = errors;
  }
}

/**
 * Polyfill for Promise.any (ES2021).
 * Returns first fulfilled promise, or rejects with AggregateError if all reject.
 */
function promiseAny<T>(promises: Iterable<PromiseLike<T>>): Promise<T> {
  return new Promise((resolve, reject) => {
    const promiseArray = Array.from(promises);
    if (promiseArray.length === 0) {
      reject(new AggregateErrorImpl([], "All promises were rejected"));
      return;
    }

    const errors: unknown[] = [];
    let rejectedCount = 0;

    promiseArray.forEach((promise, index) => {
      Promise.resolve(promise).then(resolve, (error) => {
        errors[index] = error;
        rejectedCount++;
        if (rejectedCount === promiseArray.length) {
          reject(new AggregateErrorImpl(errors, "All promises were rejected"));
        }
      });
    });
  });
}

// =============================================================================
// SAFE INPUT TYPES
// =============================================================================

/**
 * Safe input: any value or parameterless function.
 * Functions are invoked and their return value is processed.
 */
export type SafeInput<T> = T | (() => T);

/**
 * Extract the resolved type from a SafeInput.
 */
export type SafeInputResult<T> = T extends () => infer R
  ? Awaited<R>
  : Awaited<T>;

// =============================================================================
// SAFE.ALL TYPES
// =============================================================================

type SafeAllArrayResult<T extends readonly SafeInput<any>[]> = {
  -readonly [K in keyof T]: SafeInputResult<T[K]>;
};

type SafeAllObjectResult<T extends Record<string, SafeInput<any>>> = {
  [K in keyof T]: SafeInputResult<T[K]>;
};

export interface SafeAll {
  /**
   * Wait for all inputs to complete. Returns array preserving order and types.
   *
   * @example
   * const [user, posts] = await safe.all([fetchUser(), () => fetchPosts()]);
   */
  <T extends readonly SafeInput<any>[]>(inputs: [...T]): Promise<
    SafeAllArrayResult<T>
  >;

  /**
   * Wait for all inputs to complete. Returns object preserving keys.
   *
   * @example
   * const { user, posts } = await safe.all({
   *   user: fetchUser(),
   *   posts: () => fetchPosts(),
   * });
   */
  <T extends Record<string, SafeInput<any>>>(inputs: T): Promise<
    SafeAllObjectResult<T>
  >;
}

// =============================================================================
// SAFE.RACE TYPES
// =============================================================================

type SafeRaceArrayResult<T extends readonly SafeInput<any>[]> = SafeInputResult<
  T[number]
>;

type SafeRaceObjectResult<T extends Record<string, SafeInput<any>>> = {
  [K in keyof T]: [K, SafeInputResult<T[K]>];
}[keyof T];

export interface SafeRace {
  /**
   * Race inputs. Returns the first value to resolve.
   *
   * @example
   * const fastest = await safe.race([api1(), api2(), api3()]);
   */
  <T extends readonly SafeInput<any>[]>(inputs: [...T]): Promise<
    SafeRaceArrayResult<T>
  >;

  /**
   * Race inputs. Returns [winnerKey, value] tuple.
   *
   * @example
   * const [winner, value] = await safe.race({
   *   primary: primaryApi(),
   *   fallback: fallbackApi(),
   * });
   * // winner: "primary" | "fallback"
   */
  <T extends Record<string, SafeInput<any>>>(inputs: T): Promise<
    SafeRaceObjectResult<T>
  >;
}

// =============================================================================
// SAFE.SETTLED TYPES
// =============================================================================

type SafeSettledArrayResult<T extends readonly SafeInput<any>[]> = {
  -readonly [K in keyof T]: PromiseSettledResult<SafeInputResult<T[K]>>;
};

type SafeSettledObjectResult<T extends Record<string, SafeInput<any>>> = {
  [K in keyof T]: PromiseSettledResult<SafeInputResult<T[K]>>;
};

export interface SafeSettled {
  /**
   * Wait for all inputs to settle (resolve or reject).
   *
   * @example
   * const results = await safe.settled([api1(), api2()]);
   * results.forEach(r => {
   *   if (r.status === "fulfilled") console.log(r.value);
   *   else console.error(r.reason);
   * });
   */
  <T extends readonly SafeInput<any>[]>(inputs: [...T]): Promise<
    SafeSettledArrayResult<T>
  >;

  /**
   * Wait for all inputs to settle. Returns object with PromiseSettledResult values.
   *
   * @example
   * const { user, posts } = await safe.settled({
   *   user: fetchUser(),
   *   posts: fetchPosts(),
   * });
   * if (user.status === "fulfilled") console.log(user.value);
   */
  <T extends Record<string, SafeInput<any>>>(inputs: T): Promise<
    SafeSettledObjectResult<T>
  >;
}

// =============================================================================
// SAFE.ANY TYPES
// =============================================================================

export interface SafeAny {
  /**
   * Returns the first successful result. Throws AggregateError if all fail.
   *
   * @example
   * const result = await safe.any([api1(), api2(), api3()]);
   */
  <T extends readonly SafeInput<any>[]>(inputs: [...T]): Promise<
    SafeRaceArrayResult<T>
  >;

  /**
   * Returns [winnerKey, value] for first success. Throws AggregateError if all fail.
   *
   * @example
   * const [winner, value] = await safe.any({
   *   primary: primaryApi(),
   *   fallback: fallbackApi(),
   * });
   */
  <T extends Record<string, SafeInput<any>>>(inputs: T): Promise<
    SafeRaceObjectResult<T>
  >;
}

// =============================================================================
// SAFE.CALLBACK TYPES
// =============================================================================

export interface SafeCallback {
  /**
   * Wrap a callback to only execute if not cancelled.
   * If cancelled, the callback is a no-op.
   *
   * @example
   * const handleClick = safe.callback((e: MouseEvent) => {
   *   state.clicked = true;
   * });
   * document.addEventListener('click', handleClick);
   */
  <TArgs extends any[]>(callback: (...args: TArgs) => void): (
    ...args: TArgs
  ) => void;
}

// =============================================================================
// SAFE.DELAY TYPES
// =============================================================================

export interface SafeDelay {
  /**
   * Delay execution for specified milliseconds.
   * Never resolves if cancelled.
   *
   * @example
   * // Wait 1 second
   * await safe.delay(1000);
   *
   * // Wait and return a value
   * const result = await safe.delay(500, "done");
   */
  <T = void>(ms: number, resolved?: T): Promise<T>;
}

// =============================================================================
// SAFE FUNCTION TYPES
// =============================================================================

/**
 * Safe function type returned by createSafe.
 *
 * Overloads:
 * 1. `safe(promise)` - Wrap promise, never resolve/reject if cancelled
 * 2. `safe(normalFn, ...args)` - Call function, wrap result if promise
 * 3. `safe(Abortable, ...args)` - Call with signal, wrap result if promise
 */
export interface SafeFn {
  /**
   * Wrap a promise to never resolve/reject if cancelled.
   *
   * @example
   * ctx.safe(fetchData()).then(data => {
   *   // Only runs if not cancelled
   *   state.data = data;
   * });
   */
  <T>(promise: PromiseLike<T>): Promise<T>;

  /**
   * Call a normal function and wrap result if it's a promise.
   *
   * @example
   * const result = await ctx.safe(myAsyncFn, arg1, arg2);
   */
  <TArgs extends any[], TResult>(
    fn: (...args: TArgs) => TResult,
    ...args: TArgs
  ): TResult extends PromiseLike<infer U> ? Promise<U> : TResult;

  /**
   * Call an abortable function with the context's signal.
   * Wraps result if it's a promise.
   *
   * @example
   * const user = await ctx.safe(getUser, userId);
   */
  <TArgs extends any[], TResult>(
    fn: Abortable<TArgs, TResult>,
    ...args: TArgs
  ): TResult extends PromiseLike<infer U> ? Promise<U> : TResult;
}

/**
 * Safe function with utility methods for concurrent operations.
 */
export interface SafeFnWithUtils extends SafeFn {
  /** Wait for all inputs to complete */
  all: SafeAll;
  /** Race inputs, return first to resolve */
  race: SafeRace;
  /** Wait for all inputs to settle (resolve or reject) */
  settled: SafeSettled;
  /** Return first successful result */
  any: SafeAny;
  /** Wrap callback to only execute if not cancelled */
  callback: SafeCallback;
  /** Delay execution, never resolves if cancelled */
  delay: SafeDelay;
}

// =============================================================================
// CREATE SAFE
// =============================================================================

/**
 * Create a safe function for a given context.
 *
 * @param getSignal - Function to get the current AbortSignal
 * @param isCancelled - Function to check if the context is cancelled/stale
 * @returns A safe function with utility methods
 *
 * @example
 * ```ts
 * const safe = createSafe(
 *   () => abortController.signal,
 *   () => abortController.signal.aborted
 * );
 *
 * // Wrap promise
 * await safe(fetchData());
 *
 * // Call abortable function
 * await safe(getUser, userId);
 *
 * // Concurrent operations
 * const [a, b] = await safe.all([fetchA(), fetchB()]);
 * const fastest = await safe.race([api1(), api2()]);
 * ```
 */
export function createSafe(
  getSignal: () => AbortSignal | undefined,
  isCancelled: () => boolean
): SafeFnWithUtils {
  /**
   * Wrap a promise to never resolve/reject if cancelled.
   */
  function wrapPromise<T>(promise: PromiseLike<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      promise.then(
        (value) => {
          if (!isCancelled()) {
            resolve(value);
          }
          // Never resolve/reject if cancelled - promise stays pending
        },
        (error) => {
          if (!isCancelled()) {
            reject(error);
          }
          // Never resolve/reject if cancelled
        }
      );
    });
  }

  /**
   * Wrap a value - if it's a promise-like, wrap it.
   */
  function wrapResult<T>(result: T): T {
    if (isPromiseLike(result)) {
      return wrapPromise(result) as T;
    }
    return result;
  }

  /**
   * Convert and wrap input with never-resolve-if-cancelled behavior.
   */
  function wrapInput<T>(input: SafeInput<T>): Promise<SafeInputResult<T>> {
    return wrapPromise(toPromise(input)) as Promise<SafeInputResult<T>>;
  }

  /**
   * The safe function implementation.
   */
  function safe<T, TArgs extends any[]>(
    input: PromiseLike<T> | ((...args: TArgs) => T) | Abortable<TArgs, T>,
    ...args: TArgs
  ): any {
    // Check if cancelled before doing anything
    if (isCancelled()) {
      // Return a never-resolving promise for consistency
      if (isPromiseLike(input)) {
        return new Promise<T>(() => {});
      }
      // For functions, still call but wrap result
    }

    // Case 1: PromiseLike - wrap it
    if (isPromiseLike(input)) {
      return wrapPromise(input);
    }

    // Case 2: Abortable - call with signal and wrap result
    if (isAbortable(input)) {
      const signal = getSignal();
      const result = input.withSignal(signal, ...args);
      return wrapResult(result);
    }

    // Case 3: Normal function - call and wrap result
    if (typeof input === "function") {
      const result = (input as (...args: TArgs) => T)(...args);
      return wrapResult(result);
    }

    // Fallback - shouldn't happen with proper types
    return input;
  }

  // ---------------------------------------------------------------------------
  // safe.all
  // ---------------------------------------------------------------------------

  const all: SafeAll = ((
    inputs: readonly SafeInput<any>[] | Record<string, SafeInput<any>>
  ) => {
    if (isCancelled()) {
      return new Promise(() => {});
    }

    if (Array.isArray(inputs)) {
      return Promise.all(inputs.map(wrapInput));
    }

    // Object case
    const obj = inputs as Record<string, SafeInput<any>>;
    const keys = Object.keys(obj);
    return Promise.all(keys.map((k) => wrapInput(obj[k]))).then((values) =>
      Object.fromEntries(keys.map((k, i) => [k, values[i]]))
    );
  }) as SafeAll;

  // ---------------------------------------------------------------------------
  // safe.race
  // ---------------------------------------------------------------------------

  const race: SafeRace = ((
    inputs: readonly SafeInput<any>[] | Record<string, SafeInput<any>>
  ) => {
    if (isCancelled()) {
      return new Promise(() => {});
    }

    if (Array.isArray(inputs)) {
      return Promise.race(inputs.map(wrapInput));
    }

    // Object case - return [key, value] tuple
    const obj = inputs as Record<string, SafeInput<any>>;
    const keys = Object.keys(obj);
    return Promise.race(
      keys.map((k) => wrapInput(obj[k]).then((v) => [k, v] as const))
    );
  }) as SafeRace;

  // ---------------------------------------------------------------------------
  // safe.settled
  // ---------------------------------------------------------------------------

  const settled: SafeSettled = ((
    inputs: readonly SafeInput<any>[] | Record<string, SafeInput<any>>
  ) => {
    if (isCancelled()) {
      return new Promise(() => {});
    }

    if (Array.isArray(inputs)) {
      return wrapPromise(Promise.allSettled(inputs.map(toPromise)));
    }

    // Object case
    const obj = inputs as Record<string, SafeInput<any>>;
    const keys = Object.keys(obj);
    return wrapPromise(
      Promise.allSettled(keys.map((k) => toPromise(obj[k])))
    ).then((results) =>
      Object.fromEntries(keys.map((k, i) => [k, results[i]]))
    );
  }) as SafeSettled;

  // ---------------------------------------------------------------------------
  // safe.any
  // ---------------------------------------------------------------------------

  const any: SafeAny = ((
    inputs: readonly SafeInput<any>[] | Record<string, SafeInput<any>>
  ) => {
    if (isCancelled()) {
      return new Promise(() => {});
    }

    if (Array.isArray(inputs)) {
      return wrapPromise(promiseAny(inputs.map(toPromise)));
    }

    // Object case - return [key, value] tuple
    const obj = inputs as Record<string, SafeInput<any>>;
    const keys = Object.keys(obj);
    return wrapPromise(
      promiseAny(
        keys.map((k) => toPromise(obj[k]).then((v) => [k, v] as const))
      )
    );
  }) as SafeAny;

  // ---------------------------------------------------------------------------
  // safe.callback
  // ---------------------------------------------------------------------------

  const callback: SafeCallback = (<TArgs extends any[]>(
    cb: (...args: TArgs) => void
  ) => {
    return (...args: TArgs): void => {
      if (isCancelled()) {
        return;
      }
      cb(...args);
    };
  }) as SafeCallback;

  // ---------------------------------------------------------------------------
  // safe.delay
  // ---------------------------------------------------------------------------

  const delay: SafeDelay = (<T = void>(
    ms: number,
    resolved?: T
  ): Promise<T> => {
    if (isCancelled()) {
      return new Promise(() => {});
    }

    return wrapPromise(
      new Promise<T>((resolve) => {
        setTimeout(() => resolve(resolved as T), ms);
      })
    );
  }) as SafeDelay;

  // ---------------------------------------------------------------------------
  // Return safe with utilities attached
  // ---------------------------------------------------------------------------

  return Object.assign(safe, {
    all,
    race,
    settled,
    any,
    callback,
    delay,
  }) as SafeFnWithUtils;
}
