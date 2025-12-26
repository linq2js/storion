/**
 * Focus Helpers - Convenient APIs for common state mutations.
 *
 * This module provides:
 * - Reducer helpers (toggle, increment, etc.) for use with list.set() and map.set()
 * - Re-exports list() and map() from their dedicated modules
 */

// =============================================================================
// RE-EXPORTS
// =============================================================================

export {
  list,
  disposalGroup,
  getNamedGroup,
  type ListOptions,
  type FocusList,
  type DisposalGroup,
  type FocusAutoDispose,
  type FocusAutoDisposeOptions,
} from "./list";

export { map, type MapOptions, type FocusMap } from "./map";

// =============================================================================
// REDUCER HELPERS
// =============================================================================

/**
 * Toggle a boolean value. Works with undefined (treats as false).
 *
 * @example
 * ```ts
 * list.set(0, toggle());        // toggles item at index 0
 * map.set('active', toggle());  // toggles 'active' key
 * ```
 */
export function toggle(): (prev: boolean | undefined) => boolean {
  return (prev: boolean | undefined) => !prev;
}

/**
 * Increment a number by a given amount (default: 1).
 *
 * @example
 * ```ts
 * map.set('count', increment());     // +1
 * map.set('count', increment(5));    // +5
 * ```
 */
export function increment(
  amount: number = 1
): (prev: number | undefined) => number {
  return (prev: number | undefined) => (prev ?? 0) + amount;
}

/**
 * Decrement a number by a given amount (default: 1).
 *
 * @example
 * ```ts
 * map.set('count', decrement());     // -1
 * map.set('count', decrement(5));    // -5
 * ```
 */
export function decrement(
  amount: number = 1
): (prev: number | undefined) => number {
  return (prev: number | undefined) => (prev ?? 0) - amount;
}

/**
 * Multiply a number by a factor.
 *
 * @example
 * ```ts
 * map.set('price', multiply(1.1));  // increase by 10%
 * map.set('price', multiply(2));    // double
 * ```
 */
export function multiply(factor: number): (prev: number | undefined) => number {
  return (prev: number | undefined) => (prev ?? 0) * factor;
}

/**
 * Divide a number by a divisor.
 *
 * @example
 * ```ts
 * map.set('price', divide(2));  // halve
 * ```
 */
export function divide(divisor: number): (prev: number | undefined) => number {
  return (prev: number | undefined) => (prev ?? 0) / divisor;
}

/**
 * Clamp a number within min/max bounds.
 *
 * @example
 * ```ts
 * map.set('volume', clamp(0, 100));  // ensure 0-100
 * ```
 */
export function clamp(
  min: number,
  max: number
): (prev: number | undefined) => number {
  return (prev: number | undefined) => Math.min(max, Math.max(min, prev ?? 0));
}

/**
 * Append string to existing value.
 *
 * @example
 * ```ts
 * map.set('log', append('\n' + message));
 * ```
 */
export function append(suffix: string): (prev: string | undefined) => string {
  return (prev: string | undefined) => (prev ?? "") + suffix;
}

/**
 * Prepend string to existing value.
 *
 * @example
 * ```ts
 * map.set('path', prepend('/prefix'));
 * ```
 */
export function prepend(prefix: string): (prev: string | undefined) => string {
  return (prev: string | undefined) => prefix + (prev ?? "");
}

/**
 * Shallow merge object properties.
 *
 * @example
 * ```ts
 * map.set('user', merge({ name: 'John' }));
 * map.set('settings', merge({ theme: 'dark' }));
 * ```
 */
export function merge<T extends object>(
  partial: Partial<T>
): (prev: T | undefined) => T {
  return (prev: T | undefined) => ({ ...prev, ...partial } as T);
}

/**
 * Reset to a default value (ignores previous).
 *
 * @example
 * ```ts
 * map.set('count', reset(0));
 * map.set('items', reset([]));
 * ```
 */
export function reset<T>(defaultValue: T): (prev: T | undefined) => T {
  return () => defaultValue;
}
