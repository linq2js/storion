import type { Disposable } from "../types";

/**
 * Attempts to dispose a value if it has a `dispose` property.
 *
 * Supports multiple disposal patterns:
 * - If `dispose` is a function, it will be called directly
 * - If `dispose` is an array, each item will be processed:
 *   - Functions are called directly
 *   - Objects are recursively disposed via `tryDispose`
 *
 * @param value - The value to attempt disposal on. Can be any type;
 *                non-disposable values are safely ignored.
 */
export function tryDispose(value: unknown) {
  // Only process objects/functions that have a dispose property
  if (isDisposable(value)) {
    const dispose = value.dispose;

    if (Array.isArray(dispose)) {
      // Handle array of disposables (functions or disposable objects)
      for (const item of dispose) {
        if (typeof item === "function") {
          item();
        } else {
          // Recursively dispose nested disposable objects
          tryDispose(item);
        }
      }
    } else if (typeof dispose === "function") {
      // Handle single dispose function
      dispose();
    }
  }
}

export function isDisposable(value: unknown): value is Disposable {
  return (
    (typeof value === "object" || typeof value === "function") &&
    !!value &&
    "dispose" in value
  );
}

export function willDispose(value: unknown): VoidFunction {
  return () => tryDispose(value);
}
