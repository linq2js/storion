/**
 * Equality utilities for comparing values.
 */

import type { Equality } from "../types";
import isEqual from "lodash/isEqual";

/**
 * Strict equality (Object.is).
 */
export function strictEqual<T>(a: T, b: T): boolean {
  return Object.is(a, b);
}

/**
 * Shallow equality for objects/arrays.
 */
export function shallowEqual<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || a === null) return false;
  if (typeof b !== "object" || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (!Object.is((a as any)[key], (b as any)[key])) return false;
  }

  return true;
}

/**
 * Deep equality.
 */
export const deepEqual = isEqual;

/**
 * Resolve equality strategy to a function.
 */
export function resolveEquality<T>(
  equality: Equality<T> | undefined
): (a: T, b: T) => boolean {
  if (!equality || equality === "strict") return strictEqual;
  if (equality === "shallow") return shallowEqual;
  if (equality === "deep") return deepEqual;
  return equality;
}
