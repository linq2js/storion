/**
 * Development-only utilities.
 *
 * These use the __DEV__ flag which should be defined by the consuming application's bundler.
 *
 * **For consuming applications:**
 * Add this to your Vite config:
 * ```ts
 * export default defineConfig({
 *   define: {
 *     __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
 *   },
 * });
 * ```
 *
 * In production builds with __DEV__ = false, all code inside `if (__DEV__)` blocks
 * is completely removed via dead code elimination.
 *
 * If __DEV__ is not defined, these utilities fall back to checking process.env.NODE_ENV.
 */

/**
 * Global __DEV__ flag.
 * Should be defined by the consuming application's bundler.
 * If not defined, we fall back to runtime checks.
 */
declare const __DEV__: boolean | undefined;

/**
 * Internal check for development mode.
 * Used as a fallback when __DEV__ is not defined by the consumer.
 */
function checkIsDev(): boolean {
  // If __DEV__ is defined by the consumer's bundler, use it
  if (typeof __DEV__ !== "undefined") {
    return __DEV__;
  }

  // Fallback: check process.env.NODE_ENV at runtime
  // This won't be tree-shaken but ensures dev utilities work
  try {
    // Use globalThis to avoid TypeScript errors in environments without @types/node
    const p = (globalThis as any).process;
    if (p?.env?.NODE_ENV) {
      return p.env.NODE_ENV !== "production";
    }
  } catch {
    // Ignore errors
  }

    // If process is not available (browser without polyfill), assume production
    return false;
}

/**
 * Development utilities namespace.
 *
 * **Usage:**
 * ```ts
 * // Check if in dev mode
 * if (dev()) {
 *   // dev code
 * }
 *
 * // Run function only in dev
 * dev(() => {
 *   validateSignalGraph();
 * });
 *
 * // Logging
 * dev.log("Signal created:", signal);
 * dev.warn("Deprecated API used");
 * dev.error("Invalid config:", config);
 *
 * // Assertions
 * dev.assert(value !== undefined, "Value cannot be undefined");
 * ```
 *
 * @example
 * ```ts
 * // Check dev mode
 * if (dev()) {
 *   console.log("Running in development");
 * }
 *
 * // Execute in dev only
 * dev(() => {
 *   checkMemoryLeaks();
 * });
 *
 * // Development logging
 * dev.log("Signal created");
 * dev.warn("Performance issue detected");
 * dev.error("Configuration invalid");
 * dev.assert(count > 0, "Count must be positive");
 * ```
 */
export function dev(fn?: () => void): boolean {
  const isDev = checkIsDev();

  if (fn) {
    if (isDev) {
      fn();
    }
    return isDev;
  }

  return isDev;
}

/**
 * Log a message only in development
 */
export namespace dev {
  /**
   * Log a message only in development.
   * If __DEV__ is defined and is false, this is removed via dead code elimination.
   *
   * @param message - Message to log
   * @param args - Additional arguments
   *
   * @example
   * ```ts
   * dev.log("Signal created:", signal);
   * // Production (with __DEV__ defined): removed entirely
   * // Development: console.log("[rextive] Signal created:", signal)
   * ```
   */
  export function log(message: string, ...args: any[]): void {
    if (checkIsDev()) {
      console.log(`[rextive] ${message}`, ...args);
    }
  }

  /**
   * Log a warning only in development.
   * If __DEV__ is defined and is false, this is removed via dead code elimination.
   *
   * @param message - Warning message
   * @param args - Additional arguments
   *
   * @example
   * ```ts
   * dev.warn("Deprecated API used");
   * // Production (with __DEV__ defined): removed entirely
   * // Development: console.warn("[rextive] Deprecated API used")
   * ```
   */
  export function warn(message: string, ...args: any[]): void {
    if (checkIsDev()) {
      console.warn(`[rextive] ${message}`, ...args);
    }
  }

  /**
   * Log an error only in development.
   * If __DEV__ is defined and is false, this is removed via dead code elimination.
   *
   * @param message - Error message
   * @param args - Additional arguments
   *
   * @example
   * ```ts
   * dev.error("Invalid configuration:", config);
   * // Production (with __DEV__ defined): removed entirely
   * // Development: console.error("[rextive] Invalid configuration:", config)
   * ```
   */
  export function error(message: string, ...args: any[]): void {
    if (checkIsDev()) {
      console.error(`[rextive] ${message}`, ...args);
    }
  }

  /**
   * Assert a condition only in development.
   * If __DEV__ is defined and is false, this is removed via dead code elimination.
   *
   * @param condition - Condition to assert
   * @param message - Error message if assertion fails
   *
   * @example
   * ```ts
   * dev.assert(signal !== undefined, "Signal cannot be undefined");
   * // Production (with __DEV__ defined): removed entirely
   * // Development: throws if condition is false
   * ```
   */
  export function assert(condition: boolean, message: string): void {
    if (checkIsDev()) {
      if (!condition) {
        throw new Error(`[rextive] Assertion failed: ${message}`);
      }
    }
  }
}
