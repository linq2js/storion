/**
 * Development-only utilities.
 *
 * Uses `process.env.NODE_ENV` which bundlers (Vite, Webpack, Rollup) replace at build time.
 * In production builds, all code inside `if (process.env.NODE_ENV !== 'production')` blocks
 * is completely removed via dead code elimination.
 *
 * **How it works:**
 * 1. Bundler replaces `process.env.NODE_ENV` with `"production"` or `"development"`
 * 2. Condition becomes `if ("production" !== 'production')` → `if (false)`
 * 3. Minifier removes the entire dead code block
 *
 * @example
 * ```ts
 * // Development build (after bundling):
 * if ("development" !== 'production') {
 *   console.warn('Warning'); // ✅ Included
 * }
 *
 * // Production build (after bundling + minification):
 * // The entire block is removed - zero runtime cost
 * ```
 */

/**
 * Type declaration for process.env.NODE_ENV.
 * Bundlers replace this at build time - we just need the type.
 */
declare const process: {
  env: {
    NODE_ENV: string;
  };
};

/**
 * Check if running in development mode.
 *
 * **Note:** For tree-shaking to work, use the inline pattern directly:
 * ```ts
 * if (process.env.NODE_ENV !== 'production') {
 *   // dev-only code
 * }
 * ```
 *
 * @returns `true` if in development mode, `false` in production
 */
export function isDev(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Development utilities namespace.
 *
 * **Important:** For optimal tree-shaking, prefer using inline checks:
 * ```ts
 * if (process.env.NODE_ENV !== 'production') {
 *   console.warn('[storion] Warning message');
 * }
 * ```
 *
 * The `dev.*` utilities are convenient but require the bundler to inline
 * the `process.env.NODE_ENV` check within the function body.
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
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  if (fn) {
    fn();
  }

  return true;
}

/**
 * Log a message only in development
 */
export namespace dev {
  /**
   * Log a message only in development.
   *
   * @param message - Message to log
   * @param args - Additional arguments
   *
   * @example
   * ```ts
   * dev.log("Signal created:", signal);
   * // Production: removed entirely
   * // Development: console.log("[storion] Signal created:", signal)
   * ```
   */
  export function log(message: string, ...args: any[]): void {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[storion] ${message}`, ...args);
    }
  }

  /**
   * Log a warning only in development.
   *
   * @param message - Warning message
   * @param args - Additional arguments
   *
   * @example
   * ```ts
   * dev.warn("Deprecated API used");
   * // Production: removed entirely
   * // Development: console.warn("[storion] Deprecated API used")
   * ```
   */
  export function warn(message: string, ...args: any[]): void {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[storion] ${message}`, ...args);
    }
  }

  /**
   * Log an error only in development.
   *
   * @param message - Error message
   * @param args - Additional arguments
   *
   * @example
   * ```ts
   * dev.error("Invalid configuration:", config);
   * // Production: removed entirely
   * // Development: console.error("[storion] Invalid configuration:", config)
   * ```
   */
  export function error(message: string, ...args: any[]): void {
    if (process.env.NODE_ENV !== "production") {
      console.error(`[storion] ${message}`, ...args);
    }
  }

  /**
   * Assert a condition only in development.
   *
   * @param condition - Condition to assert
   * @param message - Error message if assertion fails
   *
   * @example
   * ```ts
   * dev.assert(signal !== undefined, "Signal cannot be undefined");
   * // Production: removed entirely
   * // Development: throws if condition is false
   * ```
   */
  export function assert(condition: boolean, message: string): void {
    if (process.env.NODE_ENV !== "production") {
      if (!condition) {
        throw new Error(`[storion] Assertion failed: ${message}`);
      }
    }
  }
}
