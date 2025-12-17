/**
 * Utility for wrapping functions while preserving original references.
 *
 * This allows wrapped and original functions to be treated as the same
 * for deduplication purposes (e.g., in trigger()).
 */

/** Symbol to mark the original function on wrapped functions */
export const ORIGINAL_FN = Symbol.for("storion.originalFn");

/**
 * Wrap a function while marking the original for later retrieval.
 *
 * @param originalFn - The original function to wrap
 * @param createWrapper - Factory function that receives the original and returns the wrapper
 * @returns The wrapper function with the original marked
 *
 * @example
 * ```ts
 * const original = (x: number) => x * 2;
 * const wrapped = wrapFn(original, (fn) => {
 *   return (x: number) => {
 *     console.log('calling...');
 *     return fn(x);
 *   };
 * });
 *
 * unwrapFn(wrapped) === original; // true
 * ```
 */
export function wrapFn<T extends Function>(
  originalFn: T,
  createWrapper: (original: T) => T
): T {
  const wrapper = createWrapper(originalFn);
  (wrapper as any)[ORIGINAL_FN] = originalFn;
  return wrapper;
}

/**
 * Unwrap a function to get its original reference.
 * If the function is not wrapped, returns the function itself.
 *
 * @param fn - The function to unwrap
 * @returns The original function or the function itself if not wrapped
 *
 * @example
 * ```ts
 * const original = (x: number) => x * 2;
 * const wrapped = wrapFn(original, (...args) => original(...args));
 *
 * unwrapFn(wrapped) === original; // true
 * unwrapFn(original) === original; // true
 * ```
 */
export function unwrapFn<T extends Function>(fn: T): T {
  const original = (fn as any)[ORIGINAL_FN];
  return (original ?? fn) as T;
}

/**
 * Check if a function is wrapped.
 *
 * @param fn - The function to check
 * @returns true if the function has an original reference marked
 */
export function isWrappedFn(fn: Function): boolean {
  return ORIGINAL_FN in fn;
}
