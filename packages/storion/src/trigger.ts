/**
 * Global trigger utility for deps-based function execution.
 *
 * Runs a function only when dependencies change.
 * Uses per-key scoping with WeakMap for function GC.
 */

import { resolveEquality, shallowEqual } from "./core/equality";
import { unwrapFn } from "./core/fnWrapper";
import { Equality } from "./types";

/** Default key for unkeyed trigger calls */
const DEFAULT_KEY: object = {};

/** Deps can be a single value or an array of values */
export type TriggerDeps = unknown | unknown[];

/** Options for trigger */
export interface TriggerOptions {
  /** Dependencies to check (default: [] - run once) */
  deps?: TriggerDeps;
  /** Scope key (default: DEFAULT_KEY - global) */
  key?: unknown;
  /** Custom equality function for deps comparison */
  equality?: Equality<unknown[]>;
}

/** Cache entry */
interface CacheEntry {
  deps: unknown[];
  result: unknown;
  equality?: (a: unknown[], b: unknown[]) => boolean;
}

/** Cache: key -> WeakMap<function, CacheEntry> */
const cache = new Map<unknown, WeakMap<Function, CacheEntry>>();

/** Normalize deps to always be an array */
function normalizeDeps(deps: TriggerDeps): unknown[] {
  return Array.isArray(deps) ? deps : [deps];
}

/**
 * Get or create the WeakMap for a given key.
 */
function getKeyCache(key: unknown): WeakMap<Function, CacheEntry> {
  let keyCache = cache.get(key);
  if (!keyCache) {
    keyCache = new WeakMap();
    cache.set(key, keyCache);
  }
  return keyCache;
}

/**
 * Trigger a function when dependencies change.
 *
 * @overload With options object
 * @overload With deps (single value or array)
 * @overload With key (scoped)
 *
 * @example
 * ```ts
 * // With single dep value (shorthand)
 * trigger(fetchUser, userId, userId)
 *
 * // With deps array
 * trigger(fetchUser, [userId, page], userId, page)
 *
 * // With options object
 * trigger(reset, { key: id })
 * trigger(fn, { deps: [x], equality: deepEqual }, arg)
 *
 * // With key (scoped, shorthand)
 * trigger(id, reset, [])
 * trigger(id, fetchData, userId, userId)
 * ```
 */
// Overload 1: trigger(fn, options?, ...args)
export function trigger<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
  options?: TriggerOptions,
  ...args: TArgs
): TResult;
// Overload 2: trigger(fn, deps (single or array), ...args)
export function trigger<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => TResult,
  deps: TriggerDeps,
  ...args: TArgs
): TResult;
// Overload 3: trigger(key, fn, deps, ...args)
export function trigger<TArgs extends unknown[], TResult>(
  key: unknown,
  fn: (...args: TArgs) => TResult,
  deps: TriggerDeps,
  ...args: TArgs
): TResult;
export function trigger(
  keyOrFn: unknown,
  fnOrDepsOrOptions: unknown,
  depsOrFirstArg?: unknown,
  ...restArgs: unknown[]
): unknown {
  let key: unknown;
  let fn: Function;
  let deps: unknown[];
  let equality: ((a: unknown[], b: unknown[]) => boolean) | undefined;
  let args: unknown[];

  // Detect signature based on second argument type
  if (typeof fnOrDepsOrOptions === "function") {
    // Signature 3: trigger(key, fn, deps, ...args)
    key = keyOrFn;
    fn = fnOrDepsOrOptions;
    deps = normalizeDeps(depsOrFirstArg ?? []);
    args = restArgs;
  } else if (
    fnOrDepsOrOptions !== undefined &&
    fnOrDepsOrOptions !== null &&
    typeof fnOrDepsOrOptions !== "object"
  ) {
    // Signature 2 with single value: trigger(fn, singleDep, ...args)
    key = DEFAULT_KEY;
    fn = keyOrFn as Function;
    deps = [fnOrDepsOrOptions];
    args = depsOrFirstArg !== undefined ? [depsOrFirstArg, ...restArgs] : [];
  } else if (Array.isArray(fnOrDepsOrOptions)) {
    // Signature 2 with array: trigger(fn, deps, ...args)
    key = DEFAULT_KEY;
    fn = keyOrFn as Function;
    deps = fnOrDepsOrOptions;
    args = depsOrFirstArg !== undefined ? [depsOrFirstArg, ...restArgs] : [];
  } else {
    // Signature 1: trigger(fn, options?, ...args)
    const options = (fnOrDepsOrOptions as TriggerOptions) ?? {};
    key = options.key ?? DEFAULT_KEY;
    fn = keyOrFn as Function;
    deps = normalizeDeps(options.deps ?? []);
    equality = options.equality ? resolveEquality(options.equality) : undefined;
    args = depsOrFirstArg !== undefined ? [depsOrFirstArg, ...restArgs] : [];
  }

  // Unwrap the function to get its original reference for cache key lookup
  // This ensures wrapped store actions are treated the same as their originals
  const cacheKey = unwrapFn(fn);

  const keyCache = getKeyCache(key);
  const cached = keyCache.get(cacheKey);

  // Use cached equality or provided equality or default shallowEqual
  const eq = equality ?? cached?.equality ?? shallowEqual;

  // Check if deps match
  if (cached && eq(cached.deps, deps)) {
    return cached.result;
  }

  // Execute the WRAPPED function (what was passed to trigger)
  // This preserves all wrapping behavior (error handling, middleware, etc.)
  const result = fn(...args);

  // Cache using the unwrapped/original function as the key for deduplication
  keyCache.set(cacheKey, { deps, result, equality });

  return result;
}

/**
 * Clear the cache for a specific key.
 * Useful for cleanup when a scope is no longer needed.
 *
 * @example
 * ```ts
 * // On component unmount
 * trigger.clear(id)
 * ```
 */
trigger.clear = (key: unknown): void => {
  cache.delete(key);
};

/**
 * Clear all caches.
 */
trigger.clearAll = (): void => {
  cache.clear();
};
