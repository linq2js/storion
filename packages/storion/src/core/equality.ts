/**
 * Equality utilities for comparing values.
 */

import type { AnyFunc, Equality, EqualityShorthand } from "../types";
import isEqual from "lodash/isEqual";

/**
 * Strict equality (Object.is).
 */
export function strictEqual<T>(a: T, b: T): boolean {
  return Object.is(a, b);
}

/**
 * Shallow equality for objects/arrays.
 * Compares by reference for each top-level key/index.
 *
 * @param itemEqual - Optional comparator for each item/value (defaults to Object.is)
 */
export function shallowEqual<T>(
  a: T,
  b: T,
  itemEqual: (a: unknown, b: unknown) => boolean = Object.is
): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null) return false;
  if (typeof b !== "object" || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!itemEqual((a as any)[key], (b as any)[key])) return false;
  }

  return true;
}

/**
 * 2-level shallow equality.
 * Compares keys/length, then shallow compares each item/value.
 *
 * @example
 * [{ id: 1, data: obj }] vs [{ id: 1, data: obj }] // true (same obj ref)
 */
export function shallow2Equal<T>(a: T, b: T): boolean {
  return shallowEqual(a, b, shallowEqual);
}

/**
 * 3-level shallow equality.
 * Compares keys/length, then shallow2 compares each item/value.
 *
 * @example
 * [{ id: 1, nested: { data: obj } }] vs [{ id: 1, nested: { data: obj } }] // true
 */
export function shallow3Equal<T>(a: T, b: T): boolean {
  return shallowEqual(a, b, shallow2Equal);
}

/**
 * Deep equality.
 */
export const deepEqual = isEqual;

/**
 * Resolve equality strategy to a function.
 */
export function resolveEquality<T>(
  e: Equality<T> | undefined
): (a: T, b: T) => boolean {
  if (!e || e === "strict") return strictEqual;
  if (e === "shallow") return shallowEqual;
  if (e === "shallow2") return shallow2Equal;
  if (e === "shallow3") return shallow3Equal;
  if (e === "deep") return deepEqual;
  return e;
}

export function equality(shorthand: EqualityShorthand) {
  return resolveEquality(shorthand);
}

// =============================================================================
// Value Stabilization
// =============================================================================

export type StableFn<TArgs extends any[], TResult> = {
  getOriginal: () => (...args: TArgs) => TResult;
  getCurrent: () => (...args: TArgs) => TResult;
  setCurrent: (newFn: (...args: TArgs) => TResult) => void;
};

export function createStableFn<TArgs extends any[], TResult>(
  fn: (...args: TArgs) => TResult
): StableFn<TArgs, TResult> {
  const originalFn = fn;
  let currentFn = fn;
  return Object.assign(
    (...args: TArgs) => {
      return currentFn(...args);
    },
    {
      getOriginal: () => originalFn,
      getCurrent: () => currentFn,
      setCurrent(newFn: (...args: TArgs) => TResult) {
        currentFn = newFn;
      },
    }
  );
}

/**
 * Check if a value is a stable function wrapper.
 */
export function isStableFn<TArgs extends any[], TResult>(
  value: unknown
): value is StableFn<TArgs, TResult> {
  return (
    typeof value === "function" &&
    "getOriginal" in value &&
    "getCurrent" in value &&
    "setCurrent" in value
  );
}

/**
 * Stabilize a value with automatic function wrapper support.
 *
 * - Functions: Creates/updates stable wrapper (reference never changes)
 * - Date objects: Compared by timestamp (uses deepEqual)
 * - Other values: Returns previous if equal per equalityFn
 *
 * @param prev - Previous value container (or undefined for first call)
 * @param next - New value
 * @param equalityFn - Equality function for non-function/non-date values
 * @returns Tuple of [stabilized value, wasStable]
 */
export function tryStabilize<T>(
  prev: { value: T } | undefined,
  next: T,
  equalityFn: (a: T, b: T) => boolean
): [T, boolean] {
  // First time - no previous value
  if (!prev) {
    if (typeof next === "function") {
      return [createStableFn(next as AnyFunc) as T, false];
    }
    return [next, false];
  }

  // Handle functions with stable wrapper pattern
  if (typeof next === "function") {
    if (isStableFn(prev.value)) {
      // Update existing stable wrapper with new function
      prev.value.setCurrent(next as AnyFunc);
      return [prev.value as T, true];
    }
    // Previous wasn't a stable fn, create new wrapper
    return [createStableFn(next as AnyFunc) as T, false];
  }

  if (next && next instanceof Date) {
    if (prev.value && prev.value instanceof Date) {
      if (next.getTime() === prev.value.getTime()) {
        return [prev.value, true];
      }
    }
    return [next, false];
  }

  // Non-functions: use equality comparison
  if (equalityFn(prev.value, next)) {
    return [prev.value, true];
  }

  return [next, false];
}
