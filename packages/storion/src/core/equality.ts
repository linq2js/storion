/**
 * Equality utilities for comparing values.
 */

import type { Equality, EqualityShorthand } from "../types";
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

/**
 * Check if value is a Date instance.
 */
function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

/**
 * Get the appropriate equality function for a value.
 *
 * - Custom equality if provided
 * - Deep equality for Date objects (compares by timestamp)
 * - Strict equality (Object.is) for everything else
 */
function getEqualityFn<T>(
  value: T,
  customEqualityFn?: (a: T, b: T) => boolean
): (a: T, b: T) => boolean {
  if (customEqualityFn) {
    return customEqualityFn;
  }
  // Use deep equality for dates (lodash isEqual compares by timestamp)
  if (isDate(value)) {
    return deepEqual as (a: T, b: T) => boolean;
  }
  // Default: strict equality
  return strictEqual;
}

/**
 * Stabilize a value: if equal to previous, return previous reference.
 *
 * This is useful for preventing unnecessary re-renders when values are
 * semantically equal but have different references.
 *
 * Auto-handles:
 * - Date objects (compared by timestamp)
 * - Primitives (strict equality)
 *
 * @param prev - Previous value
 * @param next - New value
 * @param equalityFn - Optional custom equality function or strategy name
 * @returns prev if equal, next otherwise
 *
 * @example
 * ```ts
 * // Basic usage - keeps previous reference if equal
 * const stableDate = stabilize(prevDate, new Date(sameTimestamp));
 * stableDate === prevDate // true
 *
 * // With custom equality
 * const stableObj = stabilize(prevObj, newObj, "shallow");
 * const stableItem = stabilize(prevItem, newItem, (a, b) => a.id === b.id);
 * ```
 */
export function stabilize<T>(
  prev: T,
  next: T,
  equalityFn?: Equality<T>
): T {
  const resolvedFn = getEqualityFn(
    next,
    equalityFn ? resolveEquality(equalityFn) : undefined
  );
  return resolvedFn(prev, next) ? prev : next;
}
