/**
 * Type guard to check if a value is a PromiseLike object.
 *
 * A PromiseLike is any object that has a `then` method, which includes
 * native Promises and custom thenable objects (like jQuery Deferred).
 *
 * @template T - The expected resolution type of the promise
 * @param value - The value to check
 * @returns True if value is a PromiseLike, false otherwise
 *
 * @example
 * ```typescript
 * const promise = Promise.resolve(42);
 * if (isPromiseLike(promise)) {
 *   promise.then(value => console.log(value)); // 42
 * }
 *
 * const notPromise = { value: 42 };
 * if (isPromiseLike(notPromise)) {
 *   // This block won't execute
 * }
 *
 * // Works with custom thenables
 * const thenable = {
 *   then(onFulfilled: (value: number) => void) {
 *     onFulfilled(42);
 *   }
 * };
 * if (isPromiseLike(thenable)) {
 *   // This block will execute
 * }
 * ```
 */
export function isPromiseLike<T = unknown>(
  value: unknown
): value is PromiseLike<T> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as any).then === "function"
  );
}
